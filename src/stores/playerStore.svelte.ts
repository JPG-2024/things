import type { YouTubePlayerContext } from '@/types/youtube.types';

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
	/** Normal volume (%) of the floating YouTube player when TTS is not ducking. */
	volume = $state(100);
	/** When the video ends, swap it for a random one from the same categories. */
	autoShuffleOnEnd = $state(true);

	open(context: YouTubePlayerContext): void {
		this.active = context;
		this.minimized = false;
		this.maximized = false;
	}

	close(): void {
		this.active = null;
		this.minimized = false;
		this.maximized = false;
	}

	minimize(): void {
		if (this.active === null) return;
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

	toggleMaximized(): void {
		if (this.active === null) return;
		this.maximized = !this.maximized;
	}
}

export const playerStore = new PlayerState();
