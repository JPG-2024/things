import type { YouTubePlayerContext } from '@/types/youtube.types';
import { youTubeVideoId } from '@/lib/utils/youtube/helpers';
import { getYouTubeThumbnailUrl } from '@/lib/utils/youtube';

/**
 * Global floating video player state. The player component itself is mounted
 * once in `+layout.svelte`, so it survives route changes; this store decides
 * whether it is visible, which video it holds, and whether it is minimized to
 * the article thumbnail.
 */
class PlayerState {
	active = $state<YouTubePlayerContext | null>(null);
	minimized = $state(false);
	/** Enlarged mode: half the viewport width (full width on small screens). */
	maximized = $state(false);
	/** Manual lock set by the maximize button: while pinned, leaving the
	 *  player does not collapse it back to normal size. Hover only expands
	 *  and collapses while this is false. */
	pinned = $state(false);
	/** Ms the player waits after the pointer leaves before collapsing back to
	 *  normal size (0 = collapse immediately). Persisted in settingsStore. */
	hoverCollapseDelayMs = $state(10000);
	/** Pending collapse scheduled by `hoverLeave`. Deliberately not `$state`:
	 *  a timer handle must never trigger renders. */
	collapseTimer: ReturnType<typeof setTimeout> | null = null;
	/** Ms the pointer must stay inside before the player expands (0 = now). */
	hoverExpandDelayMs = $state(300);
	expandTimer: ReturnType<typeof setTimeout> | null = null;
	/** Normal volume (%) of the floating YouTube player when TTS is not ducking. */
	volume = $state(100);
	/** When the video ends, swap it for a random one from the same categories. */
	autoShuffleOnEnd = $state(true);

	open(context: YouTubePlayerContext): void {
		this.clearHoverTimers();
		this.active = context;
		this.minimized = false;
		this.maximized = false;
		this.pinned = false;
	}

	/**
	 * Opens a YouTube URL in the floating player. Non-video URLs are ignored,
	 * so callers can share one path (thumbnail play button, Shift+click) without
	 * duplicating the player-context shape.
	 */
	openFromUrl(url: string | null | undefined, thumbnailSrc?: string | null): boolean {
		if (!url) return false;
		const videoId = youTubeVideoId(url);
		if (!videoId) return false;
		this.open({
			mediaDirectory: '',
			thumbnailImage: '',
			thumbnailImageSrc: thumbnailSrc ?? getYouTubeThumbnailUrl(videoId, 'high'),
			videoId,
			url
		});
		return true;
	}

	close(): void {
		this.clearHoverTimers();
		this.active = null;
		this.minimized = false;
		this.maximized = false;
		this.pinned = false;
	}

	minimize(): void {
		if (this.active === null) return;
		// Drop a pending expansion: firing it while hidden would bring the
		// player back enlarged with no pointer over it to ever collapse it.
		// The pending collapse is kept for the mirror reason (see hoverLeave).
		this.clearExpandTimer();
		this.minimized = true;
	}

	restore(): void {
		if (this.active === null) return;
		this.minimized = false;
	}

	toggleMinimized(): void {
		if (this.active === null) return;
		this.minimized = !this.minimized;
	}

	clearCollapseTimer(): void {
		if (this.collapseTimer !== null) {
			clearTimeout(this.collapseTimer);
			this.collapseTimer = null;
		}
	}

	clearExpandTimer(): void {
		if (this.expandTimer !== null) {
			clearTimeout(this.expandTimer);
			this.expandTimer = null;
		}
	}

	/** Explicit size decisions (open, close, Escape, pin) drop both pending
	 *  hover timers so neither fires on a player they already settled. */
	clearHoverTimers(): void {
		this.clearExpandTimer();
		this.clearCollapseTimer();
	}

	hoverEnter(): void {
		if (this.active === null || this.pinned) return;
		this.clearCollapseTimer();
		this.clearExpandTimer();
		// Already enlarged: re-entering only cancels the pending collapse.
		if (this.maximized) return;
		if (this.hoverExpandDelayMs <= 0) {
			this.maximized = true;
			return;
		}
		this.expandTimer = setTimeout(() => {
			this.expandTimer = null;
			if (this.active === null || this.pinned) return;
			this.maximized = true;
		}, this.hoverExpandDelayMs);
	}

	hoverLeave(): void {
		if (this.active === null || this.pinned) return;
		// A graze must not expand after the pointer already left.
		this.clearExpandTimer();
		this.clearCollapseTimer();
		if (!this.maximized) return;
		if (this.hoverCollapseDelayMs <= 0) {
			this.maximized = false;
			return;
		}
		// Not cleared by minimize(): the pointer had left, so letting this fire
		// keeps a later restore from coming back enlarged with no pointer over
		// it that could ever collapse it again.
		this.collapseTimer = setTimeout(() => {
			this.collapseTimer = null;
			if (this.active === null || this.pinned) return;
			this.maximized = false;
		}, this.hoverCollapseDelayMs);
	}

	/** The maximize button: lock enlarged mode. Unpinning collapses
	 *  immediately so the click always shows a visible change. */
	togglePin(): void {
		if (this.active === null) return;
		this.clearHoverTimers();
		if (this.pinned) {
			this.exitMaximized();
			return;
		}
		this.pinned = true;
		this.maximized = true;
	}

	/** Leave enlarged mode entirely (Escape and unpin both land here). */
	exitMaximized(): void {
		if (this.active === null) return;
		this.clearHoverTimers();
		this.pinned = false;
		this.maximized = false;
	}
}

export const playerStore = new PlayerState();
