/**
 * The durable-log channel: every frontend log line goes through this wrapper
 * into `tauri-plugin-log` (stdout always, `app_data_dir()/logs` in dev).
 *
 * The wrapper is the real filter for webview records: the plugin's
 * `plugin:log|log` command calls `log::logger().log(...)` directly and never
 * consults `log::max_level()`, so the Rust-side level cannot gate them. Two
 * gates apply before any IPC is paid:
 *
 * - level: the message severity must reach `viewState.logLevel`;
 * - module: `viewState.logModules[module]` must be on.
 *
 * Both settings live in the dev-only "Logging" section of SettingsModal and
 * are mirrored into Rust by `syncLogFilters` (which gates the Rust macros).
 * Import the plugin directly nowhere else: a direct call bypasses the gates.
 */
import { isTauri, invoke } from '@tauri-apps/api/core';
import { debug, error, info, trace, warn, LogLevel } from '@tauri-apps/plugin-log';
import { viewState } from '@/stores/viewStore.svelte';
import type { ErrorFeature } from '@/stores/errorStore.svelte';

/** Log modules reuse the error-center feature axis (capture = scraping). */
export type LogModule = ErrorFeature;

export type LogLevelName = 'trace' | 'debug' | 'info' | 'warn' | 'error';

export const LOG_LEVEL_NAMES: LogLevelName[] = ['trace', 'debug', 'info', 'warn', 'error'];

export const LOG_MODULES: LogModule[] = ['inference', 'tts', 'runner', 'db', 'capture', 'ui'];

/** Numeric values match the plugin's `LogLevel` (and `set_log_level`). */
const LEVEL_VALUE: Record<LogLevelName, LogLevel> = {
	trace: LogLevel.Trace,
	debug: LogLevel.Debug,
	info: LogLevel.Info,
	warn: LogLevel.Warn,
	error: LogLevel.Error
};

function inTauri(): boolean {
	try {
		return isTauri();
	} catch {
		return false;
	}
}

function passes(module: LogModule, level: LogLevel): boolean {
	return viewState.logModules[module] && level >= LEVEL_VALUE[viewState.logLevel];
}

function emit(
	fn: (message: string) => Promise<void>,
	module: LogModule,
	level: LogLevel,
	message: string
): void {
	if (!inTauri() || !passes(module, level)) return;
	// Fire-and-forget: a logging failure must never surface as an unhandled
	// rejection (the error center itself logs through here).
	void fn(`[${module}] ${message}`).catch(() => {});
}

export const appLog = {
	trace: (module: LogModule, message: string): void => emit(trace, module, LogLevel.Trace, message),
	debug: (module: LogModule, message: string): void => emit(debug, module, LogLevel.Debug, message),
	info: (module: LogModule, message: string): void => emit(info, module, LogLevel.Info, message),
	warn: (module: LogModule, message: string): void => emit(warn, module, LogLevel.Warn, message),
	error: (module: LogModule, message: string): void => emit(error, module, LogLevel.Error, message)
};

/**
 * Mirrors the persisted log filters into Rust: the global level gates the
 * `log::` macros and the module map gates the fern filter. Called by the
 * settings persistence effect on startup and on every change.
 */
export async function syncLogFilters(): Promise<void> {
	if (!inTauri()) return;
	const level = LEVEL_VALUE[viewState.logLevel];
	const modules = { ...viewState.logModules };
	try {
		await invoke('set_log_level', { level });
		await Promise.all(
			LOG_MODULES.map((module) => invoke('set_module_log', { module, enabled: modules[module] }))
		);
	} catch (err) {
		console.warn('[appLog] failed to sync log filters', err);
	}
}
