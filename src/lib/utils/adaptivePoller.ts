export interface AdaptivePollerOptions {
	/** Delay when the last cycle saw every target up. */
	intervalMs: number;
	/** Cap for the exponential backoff applied while a target stays down. */
	maxIntervalMs: number;
	/** Runs one probe cycle; must sync its results into state. */
	refresh: () => Promise<void>;
	/** True when the last cycle found every target up. */
	isAllUp: () => boolean;
	/** Label used in the failure warning log. */
	label: string;
}

/**
 * Self-scheduling health poller (BOOT-3). Skips cycles while the window is
 * hidden (with an immediate refresh on returning to the foreground) and backs
 * off exponentially (`intervalMs` → 2× → `maxIntervalMs`) while a target stays
 * down, resetting as soon as everything is up again. A down cycle is the
 * expensive one (timeouts instead of instant replies), so it is the one that
 * gets spaced out; recovering from a flap is detected on the next tick or the
 * foreground refresh. Returns a stop function.
 */
export function createAdaptivePoller(opts: AdaptivePollerOptions): () => void {
	let stopped = false;
	let timer: ReturnType<typeof setTimeout> | null = null;
	let running = false;
	let failedCycles = 0;

	const nextDelayMs = (): number =>
		failedCycles === 0
			? opts.intervalMs
			: Math.min(opts.maxIntervalMs, opts.intervalMs * 2 ** failedCycles);

	async function tick(): Promise<void> {
		timer = null;
		if (stopped || running) return;
		running = true;
		try {
			if (!document.hidden) {
				let allUp = false;
				try {
					await opts.refresh();
					allUp = opts.isAllUp();
				} catch (error) {
					console.warn(`[${opts.label}] health poll failed`, error);
				}
				failedCycles = allUp ? 0 : failedCycles + 1;
			}
		} finally {
			running = false;
		}
		if (!stopped) timer = setTimeout(() => void tick(), nextDelayMs());
	}

	const onVisibilityChange = (): void => {
		if (document.hidden || stopped) return;
		if (timer !== null) {
			clearTimeout(timer);
			timer = null;
		}
		void tick();
	};

	document.addEventListener('visibilitychange', onVisibilityChange);
	void tick();
	return () => {
		stopped = true;
		if (timer !== null) clearTimeout(timer);
		document.removeEventListener('visibilitychange', onVisibilityChange);
	};
}
