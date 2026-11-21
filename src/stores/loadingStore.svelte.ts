/**
 * The loading registry: live status of the work the app is doing, split into
 * two maps — `backend` (services and jobs owned by Rust: llama servers, db
 * operations, scrapes, downloads, voice cloning) and `frontend` (pipelines
 * orchestrated by the webview: the article runner, TTS generation).
 *
 * The floating `LoadingStatus` component renders each map in its own section
 * and is visible only while entries exist. Terminal transitions (`finish`,
 * `fail`, `remove`) delete the entry: the float shows live work only, and the
 * durable history lives in the Tauri log (every transition logs via `appLog`).
 *
 * Error *reporting* stays with the call sites (`errorStore.report`): most
 * producers already report, and a second report here would duplicate it.
 * `fail` only logs and clears the entry.
 *
 * `progress` is stored from day one so a loading bar can be added later
 * without touching the producers.
 */
import { SvelteMap } from 'svelte/reactivity';
import { appLog, type LogModule } from '@/lib/utils/appLog';

export type LoadingSource = 'backend' | 'frontend';

/** Live states only: terminal transitions remove the entry. */
export type LoadingStatus = 'pending' | 'active';

export interface LoadingProgress {
	done: number;
	total: number;
}

export interface LoadingEntry {
	id: string;
	source: LoadingSource;
	module: LogModule;
	/** Human-readable label shown in the float (a url, a workspace name…). */
	label: string;
	status: LoadingStatus;
	/** Current step, e.g. `analysis` or `Transcribing…`. */
	message: string | null;
	progress: LoadingProgress | null;
	updatedAt: number;
}

export interface LoadingStartOptions {
	source: LoadingSource;
	module: LogModule;
	label: string;
	message?: string;
	progress?: LoadingProgress;
	status?: LoadingStatus;
}

export interface LoadingUpdate {
	label?: string;
	message?: string | null;
	progress?: LoadingProgress | null;
	status?: LoadingStatus;
}

class LoadingStore {
	/** Rust-owned services and jobs. SvelteMap: set/delete drive the float. */
	backend = new SvelteMap<string, LoadingEntry>();
	/** Webview-orchestrated pipelines. */
	frontend = new SvelteMap<string, LoadingEntry>();

	get backendEntries(): LoadingEntry[] {
		return [...this.backend.values()];
	}

	get frontendEntries(): LoadingEntry[] {
		return [...this.frontend.values()];
	}

	get activeCount(): number {
		return this.backend.size + this.frontend.size;
	}

	get busy(): boolean {
		return this.activeCount > 0;
	}

	/** Registers (or restarts) one unit of work. */
	start(id: string, options: LoadingStartOptions): void {
		const entry: LoadingEntry = {
			id,
			source: options.source,
			module: options.module,
			label: options.label,
			status: options.status ?? 'active',
			message: options.message ?? null,
			progress: options.progress ?? null,
			updatedAt: Date.now()
		};
		this.mapFor(options.source).set(id, entry);
		appLog.info(options.module, `${id}: start — ${options.label}`);
	}

	/** Updates the step/progress of a live entry; unknown ids are a no-op.
	 *  SvelteMap values are not deeply reactive, so replace the entry object
	 *  (set with a new reference) to bump the per-key reactive source. */
	update(id: string, patch: LoadingUpdate): void {
		const entry = this.backend.get(id) ?? this.frontend.get(id);
		if (!entry) return;
		const next: LoadingEntry = {
			...entry,
			...(patch.label !== undefined && { label: patch.label }),
			...(patch.message !== undefined && { message: patch.message }),
			...(patch.progress !== undefined && { progress: patch.progress }),
			...(patch.status !== undefined && { status: patch.status }),
			updatedAt: Date.now()
		};
		this.mapFor(entry.source).set(id, next);

		const detail =
			patch.message ?? (patch.progress ? `${patch.progress.done}/${patch.progress.total}` : '');
		if (detail) appLog.debug(entry.module, `${id}: ${detail}`);
	}

	/** Successful end: logs and clears the entry. */
	finish(id: string): void {
		const entry = this.take(id);
		if (!entry) return;
		appLog.info(entry.module, `${id}: done — ${entry.label}`);
	}

	/** Failed end: logs at error level and clears. Reporting stays with the caller. */
	fail(id: string, message: string): void {
		const entry = this.take(id);
		if (!entry) return;
		appLog.error(entry.module, `${id}: failed — ${message}`);
	}

	/** Silent end (cancellation, deletion): logs and clears. */
	remove(id: string): void {
		const entry = this.take(id);
		if (!entry) return;
		appLog.info(entry.module, `${id}: removed — ${entry.label}`);
	}

	private mapFor(source: LoadingSource): SvelteMap<string, LoadingEntry> {
		return source === 'backend' ? this.backend : this.frontend;
	}

	private take(id: string): LoadingEntry | undefined {
		const entry = this.backend.get(id) ?? this.frontend.get(id);
		if (entry) this.mapFor(entry.source).delete(id);
		return entry;
	}
}

export const loadingStore = new LoadingStore();
