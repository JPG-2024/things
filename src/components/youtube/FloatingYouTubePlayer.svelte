<script lang="ts">
	import { createHotkey } from '@tanstack/svelte-hotkeys';
	import { fade } from 'svelte/transition';
	import { playerStore } from '@/stores/playerStore.svelte';
	import { viewState } from '@/stores/viewStore.svelte';

	const active = $derived(playerStore.active);
	const minimized = $derived(playerStore.minimized);

	createHotkey(
		'Escape',
		() => {
			playerStore.toggleMinimized();
		},
		() => ({
			enabled: active !== null && !viewState.overlayOpen,
			ignoreInputs: true,
			stopPropagation: true,
			preventDefault: true
		})
	);
</script>

{#if active}
	<div class="floating-player" in:fade={{ duration: 200 }} out:fade={{ duration: 200 }}>
		<!-- The iframe stays mounted while minimized so audio keeps playing;
			it is only hidden via the `.frame-hidden` class. -->
		<div class="player-frame" class:frame-hidden={minimized}>
			<div class="player-actions">
				<button
					class="player-action"
					onclick={() => playerStore.minimize()}
					aria-label="Minimize video player"
					title="Minimize video player"
				>
					−
				</button>
				<button
					class="player-action"
					onclick={() => playerStore.close()}
					aria-label="Close video player"
					title="Close video player"
				>
					×
				</button>
			</div>
			{#key active.videoId}
				<iframe
					class="player-video"
					src={`https://www.youtube-nocookie.com/embed/${active.videoId}?autoplay=1&rel=0&modestbranding=1`}
					title="YouTube video player"
					allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; web-share"
					allowfullscreen
				></iframe>
			{/key}
		</div>

		{#if minimized}
			<div class="player-mini" transition:fade={{ duration: 150 }}>
				<button
					class="player-mini-restore"
					onclick={() => playerStore.restore()}
					aria-label="Restore video player"
					title="Restore video player"
				>
					<img src={active.thumbnailImageSrc} alt="Playing video thumbnail" />
				</button>
			</div>
		{/if}
	</div>
{/if}

<style>
	/* Zero-size anchor: children are absolutely positioned from this corner. */
	.floating-player {
		position: fixed;
		right: 1rem;
		bottom: 1rem;
		width: 0;
		height: 0;
		z-index: 600; /* above content, below modals (9999/10000) */
	}

	.player-frame {
		position: absolute;
		right: 0;
		bottom: 0;
		width: clamp(280px, 24vw, 400px);
		aspect-ratio: 16 / 9;
		overflow: hidden;
		border-radius: var(--radius-md);
		background: #000;
		box-shadow: 0 8px 30px rgba(0, 0, 0, 0.6);
		transition: opacity 150ms ease;
	}

	.player-frame.frame-hidden {
		opacity: 0;
		pointer-events: none;
	}

	.player-video {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		border: 0;
	}

	.player-actions {
		position: absolute;
		top: 0.4rem;
		right: 0.4rem;
		z-index: 2;
		display: flex;
		gap: 0.25rem;
	}

	.player-action {
		display: flex;
		justify-content: center;
		align-items: center;
		width: 1.6rem;
		height: 1.6rem;
		padding: 0;
		border: none;
		border-radius: var(--radius-sm);
		background: black;
		color: white;
		font-size: 1rem;
		font-weight: bold;
		line-height: 1;
		cursor: pointer;
		transition:
			background 0.12s ease,
			opacity 0.12s ease;
	}

	.player-action:hover {
		background: var(--bg-color);
		opacity: 1;
	}

	.player-mini {
		position: absolute;
		right: 0;
		bottom: 0;
		width: 80px;
		height: 80px;
		overflow: hidden;
		border-radius: 50%;
		background: #000;
		box-shadow: 0 8px 30px rgba(0, 0, 0, 0.6);
		cursor: pointer;
	}

	.player-mini-restore {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		padding: 0;
		border: none;
		background: transparent;
		cursor: pointer;
	}

	.player-mini-restore img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		transform: scale(1.4);
	}
</style>
