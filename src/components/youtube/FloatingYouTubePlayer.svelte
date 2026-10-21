<script lang="ts">
	import { createHotkey } from '@tanstack/svelte-hotkeys';
	import { fade } from 'svelte/transition';
	import { playerStore } from '@/stores/playerStore.svelte';
	import { viewState } from '@/stores/viewStore.svelte';
	import { ttsState } from '@/stores/ttsStore.svelte';

	const active = $derived(playerStore.active);
	const minimized = $derived(playerStore.minimized);

	let frameEl: HTMLIFrameElement | null = $state(null);

	const FADE_STEPS = 10;
	/** Last volume we told the player. YouTube starts each (re)load at 100. */
	let currentVolume = 100;
	let fadeTimer: ReturnType<typeof setInterval> | null = null;

	function setPlayerVolume(volume: number): void {
		frameEl?.contentWindow?.postMessage(
			JSON.stringify({ event: 'command', func: 'setVolume', args: [volume] }),
			'*'
		);
	}

	function clearFade(): void {
		if (fadeTimer !== null) {
			clearInterval(fadeTimer);
			fadeTimer = null;
		}
	}

	/** Ramp the player from its current volume to `target` over the configured
	 * fade duration. Cancels any in-flight fade, so rapid changes stay smooth. */
	function fadePlayerVolume(target: number): void {
		clearFade();
		const start = currentVolume;
		if (start === target) return;

		const durationMs = ttsState.volumeFadeMs;
		if (durationMs <= 0) {
			currentVolume = target;
			setPlayerVolume(target);
			return;
		}

		const intervalMs = durationMs / FADE_STEPS;
		let step = 0;
		fadeTimer = setInterval(() => {
			step += 1;
			const value = Math.round(start + (target - start) * (step / FADE_STEPS));
			currentVolume = value;
			setPlayerVolume(value);
			if (step >= FADE_STEPS) {
				clearFade();
			}
		}, intervalMs);
	}

	/** Reset our tracked volume to YouTube's default after an iframe (re)load,
	 * so a freshly-mounted player fades from 100 instead of a stale value. */
	function resetVolumeTracking(): void {
		clearFade();
		currentVolume = 100;
	}

	function applyCurrentVolume(): void {
		fadePlayerVolume(ttsState.isPlaying ? ttsState.volumeWhileTTS : 100);
	}

	// Duck the video to a low volume while TTS is actively playing, and restore
	// it to full volume otherwise. Tracks `active`, `ttsState.isPlaying`, and the
	// iframe reference so it re-applies whenever any of them change.
	$effect(() => {
		if (!active) {
			clearFade();
			return;
		}
		applyCurrentVolume();
	});

	// Clear any in-flight fade if the component is torn down.
	$effect(() => {
		return () => clearFade();
	});

	// The `{#key active.videoId}` block remounts the iframe on video change and
	// `setVolume` is only honored once the player is ready, so re-apply on the
	// embed's `onReady` message as well.
	$effect(() => {
		if (!active) return;

		const onMessage = (event: MessageEvent) => {
			if (typeof event.data !== 'string') return;
			let data: unknown;
			try {
				data = JSON.parse(event.data);
			} catch {
				return;
			}
			if (
				typeof data === 'object' &&
				data !== null &&
				(data as { event?: unknown }).event === 'onReady'
			) {
				resetVolumeTracking();
				applyCurrentVolume();
			}
		};

		window.addEventListener('message', onMessage);
		return () => window.removeEventListener('message', onMessage);
	});

	// Auto-minimize the player to the mini thumbnail while TTS is playing and
	// restore the previous mode once it stops. Only acts on transitions so it
	// never fights the user manually toggling the player mid-playback.
	let wasPlaying = false;
	let prevMinimized = false;

	$effect(() => {
		if (!active) {
			wasPlaying = false;
			return;
		}

		const playing = ttsState.isPlaying && ttsState.autoMinimizeWhileTTS;

		if (playing && !wasPlaying) {
			prevMinimized = playerStore.minimized;
			if (!playerStore.minimized) playerStore.minimize();
		} else if (!playing && wasPlaying) {
			if (prevMinimized) playerStore.minimize();
			else playerStore.restore();
		}

		wasPlaying = playing;
	});

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
					bind:this={frameEl}
					class="player-video"
					src={`https://www.youtube-nocookie.com/embed/${active.videoId}?autoplay=1&rel=0&modestbranding=1&enablejsapi=1`}
					title="YouTube video player"
					allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; web-share"
					allowfullscreen
					onload={() => {
						resetVolumeTracking();
						applyCurrentVolume();
					}}
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
