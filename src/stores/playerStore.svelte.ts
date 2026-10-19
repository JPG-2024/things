import type { YouTubePlayerContext } from '@/runners/youtube/tasks/youtubeTasks.shared';

/**
 * Global floating video player state. The player component itself is mounted
 * once in `+layout.svelte`, so it survives route changes; this store decides
 * whether it is visible, which video it holds, and whether it is minimized to
 * the article thumbnail.
 */
class PlayerState {
	active = $state<YouTubePlayerContext | null>(null);
	minimized = $state(false);

	open(context: YouTubePlayerContext): void {
		this.active = context;
		this.minimized = false;
	}

	close(): void {
		this.active = null;
		this.minimized = false;
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
}

export const playerStore = new PlayerState();
