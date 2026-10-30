<script lang="ts">
	import { createHotkey } from '@tanstack/svelte-hotkeys';
	import { invoke } from '@tauri-apps/api/core';
	import { fade } from 'svelte/transition';
	import { playerStore } from '@/stores/playerStore.svelte';
	import { viewState, voiceSettingsState } from '@/stores/viewStore.svelte';
	import { ttsState } from '@/stores/ttsStore.svelte';

	const active = $derived(playerStore.active);
	const minimized = $derived(playerStore.minimized);

	/** True while the voice settings modal is open: the player then lifts
	 * above its backdrop (see `.over-voice-modal`) so the video/thumbnail
	 * stays visible while tweaking voice settings. */
	const voiceModalOpen = $derived(voiceSettingsState.ttsOpen);

	/** True while TTS owns the audio: from generation start until stop/reset,
	 * including the paused-but-resumable state. Drives auto-minimize, the
	 * thumbnail grayscale and the video volume duck so all three share one
	 * window. */
	const ttsActive = $derived(ttsState.isGenerating || ttsState.isPlaying || ttsState.isPaused);

	/** The embed is not framed from this page directly: the production webview
	 * origin is the `tauri://` protocol, which YouTube's embed refuses to play
	 * from (tauri-apps/tauri#14422, Error 153). `youtube_embed_url` (Rust) hands
	 * back a loopback wrapper URL that frames the real embed and relays
	 * `postMessage` traffic both ways, so the volume API below works as if the
	 * player sat one hop away. */
	let embedSrc = $state<string | null>(null);
	/** Non-reactive memo: which videoId the current `embedSrc` belongs to.
	 * Kept out of rune-land so resolving the same URL twice never re-runs the
	 * effect below, and a failed resolve can be retried on the next open. */
	let embedSrcVideoId: string | null = null;

	/** TEMP diagnostic: in dev, `localStorage['things:direct-embed'] = '1'`
	 * frames `youtube-nocookie` directly (the pre-wrapper architecture) so the
	 * wrapper's nested iframe can be A/B tested for frame pacing. Remove once
	 * the performance question is settled. */
	function directEmbedOverride(videoId: string): string | null {
		if (!import.meta.env.DEV) return null;
		const enabled =
			import.meta.env.VITE_DIRECT_EMBED === '1' ||
			localStorage.getItem('things:direct-embed') === '1';
		if (!enabled) return null;
		console.warn('[diag] direct YouTube embed override active (no wrapper)');
		return `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1&enablejsapi=1&origin=${encodeURIComponent(window.location.origin)}`;
	}

	$effect(() => {
		const videoId = active?.videoId;
		if (!videoId || embedSrcVideoId === videoId) return;
		embedSrcVideoId = videoId;
		embedSrc = null;
		const direct = directEmbedOverride(videoId);
		if (direct) {
			embedSrc = direct;
			return;
		}
		let cancelled = false;
		invoke<string>('youtube_embed_url', { videoId })
			.then((url) => {
				if (cancelled) return;
				embedSrc = url;
			})
			.catch((error: unknown) => {
				if (cancelled) return;
				embedSrc = null;
				embedSrcVideoId = null;
				console.error('Failed to resolve YouTube embed URL', error);
			});
		return () => {
			cancelled = true;
		};
	});

	let frameEl: HTMLIFrameElement | null = $state(null);

	const FADE_STEPS = 10;
	/** Last volume we told the player. Only used as the next fade's start
	 * point: YouTube starts each (re)load at 100. */
	let currentVolume = 100;
	let fadeTimer: ReturnType<typeof setInterval> | null = null;
	/** Follow-up sends after an iframe (re)load. `setVolume` is silently
	 * ignored until the embed's player is ready, and the `onReady` message may
	 * never reach a Tauri webview, so the desired volume is re-sent on a short
	 * schedule instead of trusting a single message. */
	let reassertTimers: ReturnType<typeof setTimeout>[] = [];
	/** Delays (ms) after `onload`/`onReady`. The last one sits past the
	 * slowest fade (`volumeFadeMs` tops out at 2000ms). */
	const REASSERT_DELAYS_MS = [150, 400, 900, 1800, 3000];

	/** Volume the player should be at right now. Read inside the effect so
	 * `ttsActive`, the duck slider and the base volume stay tracked as
	 * dependencies. */
	function desiredVolume(): number {
		// Ducking never makes the video louder than the configured base volume.
		return ttsActive ? Math.min(playerStore.volume, ttsState.volumeWhileTTS) : playerStore.volume;
	}

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

	function clearReasserts(): void {
		for (const timer of reassertTimers) clearTimeout(timer);
		reassertTimers = [];
	}

	/** Push the current desired volume at the player with no fade. Skipped
	 * while a fade is in flight (it ends on the target itself) and retried
	 * shortly after it settles, so a load landing mid-fade can never leave the
	 * player on a value it never received. */
	function reassertNow(): void {
		if (fadeTimer !== null) {
			reassertTimers.push(setTimeout(reassertNow, 300));
			return;
		}
		const target = desiredVolume();
		currentVolume = target;
		setPlayerVolume(target);
	}

	function scheduleReasserts(): void {
		clearReasserts();
		for (const delayMs of REASSERT_DELAYS_MS) {
			reassertTimers.push(setTimeout(reassertNow, delayMs));
		}
	}

	/** Ramp the player from its current volume to `target` over the configured
	 * fade duration. Cancels any in-flight fade, so rapid changes stay smooth.
	 * Always sends at least one message even when the tracked volume already
	 * matches: that message may have been dropped while the player was still
	 * loading, and skipping the send is what left the video stuck loud. */
	function fadePlayerVolume(target: number): void {
		clearFade();
		const start = currentVolume;

		if (start === target || ttsState.volumeFadeMs <= 0) {
			currentVolume = target;
			setPlayerVolume(target);
			return;
		}

		const intervalMs = ttsState.volumeFadeMs / FADE_STEPS;
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
		fadePlayerVolume(desiredVolume());
	}

	// Duck the video to a low volume for the whole TTS window (generating,
	// playing and paused), and restore full volume once it is over. Tracks
	// `active`, `ttsActive`, the duck slider and the iframe reference: reading
	// `frameEl` here is deliberate — `setPlayerVolume()` otherwise only runs
	// inside the fade interval, outside this effect, so a `{#key}` remount of
	// the iframe would never re-apply the volume.
	$effect(() => {
		const frame = frameEl;
		const target = desiredVolume();
		if (!active || !frame) {
			clearFade();
			clearReasserts();
			return;
		}
		fadePlayerVolume(target);
	});

	// Clear any in-flight fade or pending re-assert if the component is torn
	// down.
	$effect(() => {
		return () => {
			clearFade();
			clearReasserts();
		};
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
				scheduleReasserts();
			}
		};

		window.addEventListener('message', onMessage);
		return () => window.removeEventListener('message', onMessage);
	});

	// Auto-minimize the player to the mini thumbnail as soon as TTS starts
	// generating — not only once the audio plays — and restore the previous
	// mode once generation, playback and pause are all over. Only acts on
	// transitions so it never fights the user manually toggling the player.
	let wasActive = false;
	let prevMinimized = false;

	$effect(() => {
		if (!active) {
			wasActive = false;
			return;
		}

		const engage = ttsActive && ttsState.autoMinimizeWhileTTS;

		if (engage && !wasActive) {
			prevMinimized = playerStore.minimized;
			if (!playerStore.minimized) playerStore.minimize();
		} else if (!engage && wasActive) {
			if (prevMinimized) playerStore.minimize();
			else playerStore.restore();
		}

		wasActive = engage;
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
	<div
		class="floating-player"
		class:over-voice-modal={voiceModalOpen}
		in:fade={{ duration: 200 }}
		out:fade={{ duration: 200 }}
	>
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
				{#if embedSrc}
					<iframe
						bind:this={frameEl}
						class="player-video"
						src={embedSrc}
						title="YouTube video player"
						allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; web-share"
						allowfullscreen
						onload={() => {
							resetVolumeTracking();
							applyCurrentVolume();
							// The player is not ready yet at this point, so every
							// command sent above is dropped: keep re-sending until
							// the wrapper relays an onReady for us.
							scheduleReasserts();
						}}
					></iframe>
				{/if}
			{/key}
		</div>

		{#if minimized}
			<div class="player-mini" class:is-tts-active={ttsActive} transition:fade={{ duration: 150 }}>
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
		right: var(--float-anchor-right);
		bottom: var(--float-anchor-bottom);
		width: 0;
		height: 0;
		z-index: 600; /* above content, below modals (9999/10000) */
	}

	/* The voice settings modal's backdrop sits at 100000; lift the player one
	   step above it so the video/thumbnail stays visible while it is open.
	   Conditional, so every other modal still covers the player as before. */
	.floating-player.over-voice-modal {
		z-index: 100001;
	}

	.player-frame {
		position: absolute;
		right: 0;
		bottom: 0;
		width: clamp(280px, 24vw, 400px);
		aspect-ratio: 16 / 9;
		overflow: hidden;
		/* border-radius: var(--radius-md); */
		background: #000;
		/* box-shadow: 0 8px 30px rgba(0, 0, 0, 0.6); */
		transition: opacity 200ms ease;
		/* border: 2px solid var(--bg-color); */
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
		border: 2px solid var(--gray-700);
		border-style: dashed;
		border-radius: var(--radius-sm);
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
		background: rgb(50, 50, 50);
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
		width: var(--float-mini-width);
		height: var(--float-mini-height);
		overflow: hidden;
		border-radius: var(--radius-md);
		background: transparent;
		/* box-shadow: 0 8px 30px rgba(0, 0, 0, 0.6); */
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
		transition: filter 250ms ease;
		filter: grayscale(0);
	}

	/* Mid grayscale for the whole TTS window: the video is ducked at that
	 * point, so the thumbnail reads as "backed off". */
	.player-mini.is-tts-active img {
		filter: grayscale(0.95);
	}
</style>
