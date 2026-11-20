<script lang="ts">
	import { goto } from '$app/navigation';
	import { createHotkey } from '@tanstack/svelte-hotkeys';
	import { invoke } from '@tauri-apps/api/core';
	import { fade } from 'svelte/transition';
	import Icon from '@/components/Icon.svelte';
	import ProfileThumb from '@/components/ProfileThumb.svelte';
	import { getYouTubeThumbnailUrl } from '@/lib/utils/youtube';
	import { isYouTubeEndedEvent, youTubeVideoId } from '@/lib/utils/youtube/helpers';
	import { playerStore } from '@/stores/playerStore.svelte';
	import { viewState, voiceSettingsState } from '@/stores/viewStore.svelte';
	import { ttsState } from '@/stores/ttsStore.svelte';
	import { errorStore } from '@/stores/errorStore.svelte';
	import {
		getArticleByUrl,
		getRandomYouTubeArticleInSameCategories,
		getRandomYouTubeArticleInSameProfile
	} from '@/stores/webStore';

	const active = $derived(playerStore.active);
	const minimized = $derived(playerStore.minimized);
	const maximized = $derived(playerStore.maximized);
	/** True while the maximize button has locked enlarged mode: the icon then
	 *  reflects the pin (what a click undoes), not the current size. */
	const pinned = $derived(playerStore.pinned);

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
				// Reported: the player just never loads otherwise, with no
				// visible hint of why.
				errorStore.report(error, {
					feature: 'ui',
					userMessage: 'Failed to resolve the YouTube player — playback is unavailable'
				});
			});
		return () => {
			cancelled = true;
		};
	});

	/** Profile of the loaded video, resolved from its article row. The player
	 * context only carries the url, so this feeds the corner thumb and its
	 * navigation target; the profile shuffle resolves the id on its own. */
	type CurrentProfile = {
		profileId: string;
		name: string | null;
		pictureSrc: string | null;
	};

	let currentProfile = $state<CurrentProfile | null>(null);

	$effect(() => {
		const url = active?.url;
		if (!url) {
			currentProfile = null;
			return;
		}
		let cancelled = false;
		void getArticleByUrl(url).then((article) => {
			if (cancelled) return;
			const profileId = article?.profileId ?? article?.profile ?? article?.domain ?? null;
			currentProfile = profileId
				? {
						profileId,
						name: article?.profile ?? article?.domain ?? null,
						pictureSrc: article?.profilePictureSrc ?? null
					}
				: null;
		});
		return () => {
			cancelled = true;
		};
	});

	function goToProfile(): void {
		if (!currentProfile) return;
		viewState.currentProfileId = currentProfile.profileId;
		void goto(`/profile/${encodeURIComponent(currentProfile.profileId)}`).catch(
			(error: unknown) => {
				errorStore.report(error, {
					feature: 'ui',
					userMessage: 'Failed to open the profile page'
				});
			}
		);
	}

	const SHUFFLE_MESSAGES = {
		category: {
			empty: 'No other YouTube videos share this category',
			failed: 'Failed to pick a random video from the same category'
		},
		profile: {
			empty: 'No other YouTube videos share this profile',
			failed: 'Failed to pick a random video from the same profile'
		}
	} as const;

	type ShuffleMode = keyof typeof SHUFFLE_MESSAGES;

	/** True while either random-video query is in flight: blocks a second press. */
	let shuffling = $state(false);

	/** Swaps the current video for a random YouTube article from the same
	 * category (`R`, the shuffle icon, or the end of the video) or profile
	 * (`Shift+R`). The new context goes through `playerStore.open()`, so the
	 * existing `{#key active.videoId}` block remounts the iframe and
	 * re-applies the volume. */
	async function shuffle(mode: ShuffleMode, options: { silent?: boolean } = {}): Promise<void> {
		const current = playerStore.active;
		if (!current || shuffling) return;

		shuffling = true;
		const messages = SHUFFLE_MESSAGES[mode];
		try {
			const article =
				mode === 'profile'
					? await getRandomYouTubeArticleInSameProfile(current.url)
					: await getRandomYouTubeArticleInSameCategories(current.url);
			// The player may have been closed or pointed elsewhere while the
			// query ran: never hijack a video the user picked in the meantime.
			if (playerStore.active?.url !== current.url) return;
			if (!article?.url) {
				// A legitimately empty pool is not an error, but a manual press
				// must not be silent either: the button would look broken. The
				// automatic end-of-video trigger stays quiet instead of warning
				// on every short clip.
				if (!options.silent) {
					errorStore.report(new Error(`No random candidate in the same ${mode}`), {
						feature: 'ui',
						level: 'warn',
						userMessage: messages.empty
					});
				}
				return;
			}

			const url = article.url;
			const videoId = youTubeVideoId(url);
			if (!videoId) return;

			// `open()` always restores the frame; a shuffle fired from the mini
			// player (`R` / `Shift+R`) should leave it exactly as it was.
			const wasMinimized = playerStore.minimized;
			playerStore.open({
				mediaDirectory: article.mediaDirectory ?? '',
				thumbnailImage: article.thumbnail ?? '',
				thumbnailImageSrc: article.thumbnailSrc ?? getYouTubeThumbnailUrl(videoId, 'high'),
				videoId,
				url
			});
			if (wasMinimized) playerStore.minimize();
		} catch (error) {
			errorStore.report(error, {
				feature: 'ui',
				userMessage: messages.failed
			});
		} finally {
			shuffling = false;
		}
	}

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

	/** Set once the player answers: repeating the handshake after that can make
	 * it emit `onReady` again, which would reschedule this same loop. Reset on
	 * every iframe load (video change). */
	let playerEventsConfirmed = false;

	/** Tell the player we are listening. Without this handshake YouTube only
	 * accepts commands and never posts `onStateChange` back, which would leave
	 * the end-of-video shuffle silent. It is re-sent with the volume
	 * re-asserts because the wrapper loads before the inner player is ready. */
	function announceListening(): void {
		if (playerEventsConfirmed) return;
		frameEl?.contentWindow?.postMessage(
			JSON.stringify({ event: 'listening', id: 1, channel: 'widget' }),
			'*'
		);
	}

	function scheduleReasserts(): void {
		clearReasserts();
		announceListening();
		for (const delayMs of REASSERT_DELAYS_MS) {
			reassertTimers.push(
				setTimeout(() => {
					announceListening();
					reassertNow();
				}, delayMs)
			);
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
			// Only the frame this component owns: other embeds on the page (the
			// article view) must not drive the floating player, and a late ENDED
			// from a previous iframe must not chain a second shuffle.
			if (event.source !== frameEl?.contentWindow) return;
			if (typeof event.data !== 'string') return;
			let data: unknown;
			try {
				data = JSON.parse(event.data);
			} catch {
				return;
			}
			if (isYouTubeEndedEvent(data)) {
				playerEventsConfirmed = true;
				if (playerStore.autoShuffleOnEnd) void shuffle('category', { silent: true });
				return;
			}
			if (
				typeof data === 'object' &&
				data !== null &&
				(data as { event?: unknown }).event === 'onReady'
			) {
				playerEventsConfirmed = true;
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
			// Leave enlarged mode before shrinking to the mini thumbnail, so a
			// single Escape never jumps from 50vw straight to the thumbnail.
			// Works for both hover-expanded and button-pinned max mode.
			if (!playerStore.minimized && (playerStore.maximized || playerStore.pinned)) {
				playerStore.exitMaximized();
				return;
			}
			playerStore.toggleMinimized();
		},
		() => ({
			// Escape is also "stop TTS" while playback owns the audio, and the
			// hotkey manager fires every matching handler — stay out of its way
			// so one press cannot both stop TTS and minimize the video.
			enabled: active !== null && !viewState.overlayOpen && !ttsActive,
			ignoreInputs: true,
			stopPropagation: true,
			preventDefault: true
		})
	);

	createHotkey(
		'R',
		() => {
			void shuffle('category');
		},
		() => ({
			enabled: active !== null && !viewState.overlayOpen && !shuffling,
			ignoreInputs: true,
			stopPropagation: true,
			preventDefault: true
		})
	);

	// Shift+R is also "record voice" while the voice settings modal sits in
	// record view, but that hotkey is gated on `show`, and `overlayOpen` is
	// true for that modal, so the player stays out of its way here.
	createHotkey(
		'Shift+R',
		() => {
			void shuffle('profile');
		},
		() => ({
			enabled: active !== null && !viewState.overlayOpen && !shuffling,
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
		<div
			class="player-frame"
			class:frame-hidden={minimized}
			class:maximized
			role="group"
			onmouseenter={() => playerStore.hoverEnter()}
			onmouseleave={() => playerStore.hoverLeave()}
		>
			{#if currentProfile}
				<div class="player-profile">
					{#if currentProfile.pictureSrc}
						<ProfileThumb
							src={currentProfile.pictureSrc}
							alt={currentProfile.name ?? ''}
							tooltip={currentProfile.name ?? 'View profile'}
							tooltipProps={{ position: 'bottom' }}
							ariaLabel={currentProfile.name ?? 'View profile'}
							size={28}
							onClick={goToProfile}
						/>
					{:else}
						<button
							type="button"
							class="player-action player-profile-fallback"
							onclick={goToProfile}
							aria-label={currentProfile.name ?? 'View profile'}
							title={currentProfile.name ?? 'View profile'}
						>
							<Icon name="User" size={14} color="white" />
						</button>
					{/if}
				</div>
			{/if}
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
					onclick={() => playerStore.togglePin()}
					aria-label={pinned ? 'Restore video player size' : 'Maximize video player'}
					title={pinned ? 'Restore video player size' : 'Maximize video player'}
				>
					<Icon name={pinned ? 'Minimize' : 'Maximize'} size={14} color="white" />
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
							// Fresh player: the previous handshake no longer applies.
							playerEventsConfirmed = false;
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
			<button
				class="player-action player-shuffle"
				onclick={() => void shuffle('category')}
				disabled={shuffling}
				aria-label="Play a random video from the same category"
				title="Random video from same category (R)"
			>
				<Icon name="Shuffle" size={14} color="white" />
			</button>
			<button
				class="player-action player-profile-shuffle"
				onclick={() => void shuffle('profile')}
				disabled={shuffling}
				aria-label="Play a random video from the same profile"
				title="Random video from same profile (Shift+R)"
			>
				<Icon name="Users" size={14} color="white" />
			</button>
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

	/* The voice settings modal now renders through the shared Modal layer
	   (backdrop 9999 / dialog 10000); lift the player above that layer so
	   the video/thumbnail stays visible while it is open. Conditional, so
	   every other modal still covers the player as before. */
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
		background: #000;
		/* box-shadow: 0 8px 30px rgba(0, 0, 0, 0.6); */
		transition:
			opacity 100ms ease,
			width 100ms ease;
		border: 3px solid var(--gray-500);
		border-style: dashed;
		border-radius: var(--radius-sm);
	}

	/* Enlarged mode: half the viewport width, height follows the aspect
	 * ratio. The iframe stretches with the frame, so the embed re-lays out
	 * without a reload (playback position and volume survive). */
	.player-frame.maximized {
		width: 50vw;
	}

	/* Small screens: a half-width player gets too cramped, so maximize takes
	 * the whole width minus the floating anchor padding on both sides. */
	@media (max-width: 1000px) {
		.player-frame.maximized {
			width: calc(100vw - 2 * var(--float-anchor-right));
		}
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
		border: none;
	}

	/* Top-left corner: the profile avatar opens its page. The ring keeps it
	 * legible over both bright and dark video frames. */
	.player-profile {
		position: absolute;
		top: 0.4rem;
		left: 0.4rem;
		z-index: 2;
		display: flex;
		justify-content: center;
		align-items: center;
		width: 1.8rem;
		height: 1.8rem;
		border-radius: 50%;
		background: rgb(50, 50, 50);
		box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.35);
	}

	.player-profile-fallback {
		background: transparent;
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

	/* The avatar fallback sits on a dark ring; keep its hover dark too so the
	 * white icon never lands on a light `--bg-color`. */
	.player-profile-fallback:hover {
		background: rgb(70, 70, 70);
	}

	/* Bottom-right shuffle control. It keeps its own dark hover so the white
	   icon never lands on a light `--bg-color` (the frame sits over video). */
	.player-shuffle {
		position: absolute;
		right: 0.4rem;
		bottom: 0.4rem;
		z-index: 2;
	}

	.player-shuffle:hover {
		background: rgb(70, 70, 70);
	}

	.player-shuffle:disabled {
		opacity: 0.5;
		cursor: default;
	}

	/* Bottom-left mirror of the category shuffle, so both random actions stay
	 * visible together regardless of the video's brightness. */
	.player-profile-shuffle {
		position: absolute;
		left: 0.4rem;
		bottom: 0.4rem;
		z-index: 2;
	}

	.player-profile-shuffle:hover {
		background: rgb(70, 70, 70);
	}

	.player-profile-shuffle:disabled {
		opacity: 0.5;
		cursor: default;
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
