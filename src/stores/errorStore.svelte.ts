/**
 * The error center: a session log of the errors the user should know about.
 *
 * One entry point, `report`, does both visibility jobs in a single call:
 * it logs to the console (the developer channel) and appends the error to
 * the in-memory list rendered by the floating icon and its modal (the user
 * channel). A site that only logs is how an error ends up visible in the
 * devtools and nowhere else — the failure this store exists to prevent.
 *
 * The list is deduplicated (`feature` + curated message, with a ×N counter),
 * capped, and never persisted: it is a log of the current session.
 */

/** Feature an error is attributed to; the future filter axes of the modal. */
export type ErrorFeature = 'inference' | 'tts' | 'runner' | 'db' | 'capture' | 'ui';

export type ErrorLevel = 'error' | 'warn';

/** Dev-only detail payload; never collected in prod builds. */
export interface AppErrorDetails {
	/** Normalized (uncurated) error message. */
	message: string;
	/** Messages of the `cause` chain, outermost first. */
	causeChain: string[];
	stack: string | null;
	context: Record<string, string>;
}

export interface AppError {
	id: number;
	feature: ErrorFeature;
	level: ErrorLevel;
	/** Curated, prod-safe description; the only text shown in prod. */
	userMessage: string;
	timestamp: number;
	/** How many times the same error repeated since it first appeared. */
	count: number;
	/** Present only in dev builds (`import.meta.env.DEV`); `null` in prod. */
	details: AppErrorDetails | null;
}

export interface ReportErrorOptions {
	feature: ErrorFeature;
	/** Curated description shown in the modal; a per-feature fallback if absent. */
	userMessage?: string;
	/** String context (urls, ids) stored with the dev details. */
	context?: Record<string, string | undefined>;
	/**
	 * `warn` for benign degradations (kept out of the console's error level
	 * and rendered muted in the modal).
	 */
	level?: ErrorLevel;
	/**
	 * Log to the console as part of the report. `false` for the global
	 * handlers (`unhandledrejection`, `window.onerror`, `svelte:boundary`),
	 * where the browser already logs on its own.
	 */
	log?: boolean;
}

/** Prod-safe per-feature description when a site sends no curated message. */
const FEATURE_FALLBACK_MESSAGE: Record<ErrorFeature, string> = {
	inference: 'Local inference error',
	tts: 'Voice (TTS) error',
	runner: 'Article processing error',
	db: 'Database error',
	capture: 'Source capture error',
	ui: 'Interface error'
};

function messageOf(value: unknown): string {
	if (value instanceof Error) return value.message;
	if (typeof value === 'string' && value.trim()) return value;
	try {
		return JSON.stringify(value) ?? String(value);
	} catch {
		return String(value);
	}
}

function buildDetails(error: unknown, context: ReportErrorOptions['context']): AppErrorDetails {
	const causeChain: string[] = [];
	let cause: unknown = error instanceof Error ? error.cause : undefined;
	while (cause !== undefined && cause !== null && causeChain.length < 5) {
		const message = messageOf(cause);
		if (!message) break;
		causeChain.push(message);
		cause = cause instanceof Error ? cause.cause : undefined;
	}

	const safeContext: Record<string, string> = {};
	for (const [key, value] of Object.entries(context ?? {})) {
		if (typeof value === 'string' && value) safeContext[key] = value;
	}

	return {
		message: messageOf(error),
		causeChain,
		stack: error instanceof Error ? (error.stack ?? null) : null,
		context: safeContext
	};
}

/** Flattens an error and its `cause` chain into one readable line. */
export function describeErrorChain(error: unknown): string {
	const parts: string[] = [];
	let current: unknown = error;
	while (current !== undefined && current !== null && parts.length < 5) {
		const message = messageOf(current);
		if (message) parts.push(message);
		current = current instanceof Error ? current.cause : undefined;
	}
	return parts.join(' — ');
}

/** Session log cap: the oldest entry gives its seat up. */
const MAX_ERRORS = 100;

class ErrorStore {
	/** Oldest first; the modal renders newest-first. */
	errors = $state<AppError[]>([]);
	/** Whether the error modal is open (shared by the icon and the modal). */
	open = $state(false);

	#nextId = 1;

	/**
	 * Logs (by default) and records an error. The curated `userMessage` is
	 * the modal text and the console line, so one call keeps both channels
	 * in sync; per-feature fallbacks cover the sites without one.
	 */
	report(error: unknown, options: ReportErrorOptions): void {
		const level = options.level ?? 'error';
		const userMessage = options.userMessage?.trim() || FEATURE_FALLBACK_MESSAGE[options.feature];
		const details = import.meta.env.DEV ? buildDetails(error, options.context) : null;

		const existing = this.errors.find(
			(entry) =>
				entry.feature === options.feature &&
				entry.level === level &&
				entry.userMessage === userMessage
		);
		if (existing) {
			existing.count += 1;
			existing.timestamp = Date.now();
		} else {
			this.errors.push({
				id: this.#nextId++,
				feature: options.feature,
				level,
				userMessage,
				timestamp: Date.now(),
				count: 1,
				details
			});
			while (this.errors.length > MAX_ERRORS) {
				this.errors.shift();
			}
		}

		if (options.log ?? true) {
			const log = level === 'warn' ? console.warn : console.error;
			const context =
				details && Object.keys(details.context).length > 0 ? details.context : undefined;
			log(`[${options.feature}] ${userMessage}`, error, context ?? '');
		}
	}

	/** Removes one entry (the ✕ of the modal). */
	dismiss(id: number): void {
		this.errors = this.errors.filter((entry) => entry.id !== id);
	}

	/** The modal's "Clear all". */
	clear(): void {
		this.errors = [];
	}
}

export const errorStore = new ErrorStore();
