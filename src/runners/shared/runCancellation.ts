/**
 * Cancellation registry for article runs.
 *
 * The manager owns the queue, but the run itself is the only one that can stop
 * writing: deleting an article while it is queued or in flight has to abort it
 * before its next persistence point, otherwise the run stores the row again
 * right after the delete and the card comes back.
 *
 * The registry lives in its own module (instead of the manager) so the runner
 * can consult it without importing the manager that imports the runner.
 */

/** Thrown by a run that found its url cancelled before a write. */
export class RunCancelledError extends Error {
	constructor(url: string) {
		super(`Run cancelled for "${url}"`);
		this.name = 'RunCancelledError';
	}
}

const cancelledUrls = new Set<string>();

/** Aborts the run of `url` at its next checkpoint. */
export function cancelRun(url: string): void {
	cancelledUrls.add(url);
}

/**
 * Allows `url` to run again: an url is only cancelled until it is enqueued
 * once more (a re-capture after a delete is a legitimate new run).
 */
export function resumeRun(url: string): void {
	cancelledUrls.delete(url);
}

/** True when the run of `url` must stop before writing anything else. */
export function isRunCancelled(url: string): boolean {
	return cancelledUrls.has(url);
}

/** Throws {@link RunCancelledError} when the run of `url` was cancelled. */
export function throwIfRunCancelled(url: string): void {
	if (cancelledUrls.has(url)) {
		throw new RunCancelledError(url);
	}
}

/** Narrows an unknown error to the abort signal used by the runner. */
export function isRunCancelledError(error: unknown): error is RunCancelledError {
	return error instanceof RunCancelledError;
}
