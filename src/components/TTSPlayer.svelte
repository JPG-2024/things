<script lang="ts">
	import Icon from "./Icon.svelte";
	import { ttsState } from "@/stores/ttsStore.svelte";

	let audioElement = $state<HTMLAudioElement | null>(null);

	function togglePlay() {
		if (!audioElement) return;
		if (ttsState.isPlaying) {
			audioElement.pause();
		} else {
			audioElement.play();
		}
	}

	function handleStop() {
		if (!audioElement) return;
		audioElement.pause();
		audioElement.currentTime = 0;
		ttsState.isPlaying = false;
	}

	function handleEnded() {
		ttsState.nextTrack();
	}

	$effect(() => {
		if (audioElement && ttsState.audioSrc) {
			audioElement.src = ttsState.audioSrc;
			if (ttsState.isPlaying) {
				audioElement.play().catch((err: unknown) => {
					if (err instanceof Error && err.name !== "AbortError") {
						ttsState.errorMessage = "Playback was blocked by the browser.";
					}
				});
			}
		}
	});
</script>

{#if ttsState.playlist.length > 0}
	<div class="tts-player">
		<div class="controls">
			<button
				type="button"
				onclick={() => ttsState.previousTrack()}
				disabled={ttsState.currentIndex === 0}
				aria-label="Previous track"
			>
				<Icon name="SkipBack" size={18} />
			</button>

			<button
				type="button"
				onclick={ttsState.isPlaying ? handleStop : togglePlay}
				disabled={ttsState.isGenerating}
				aria-label={ttsState.isPlaying ? "Stop" : "Play"}
			>
				{#if ttsState.isGenerating}
					<Icon name="Loader" size={18} />
				{:else if ttsState.isPlaying}
					<Icon name="Square" size={18} />
				{:else}
					<Icon name="Play" size={18} />
				{/if}
			</button>

			<button
				type="button"
				onclick={() => ttsState.nextTrack()}
				disabled={ttsState.currentIndex >= ttsState.playlist.length - 1}
				aria-label="Next track"
			>
				<Icon name="SkipForward" size={18} />
			</button>
		</div>

		<div class="track-info">
			<span class="counter">
				{ttsState.currentIndex + 1} / {ttsState.playlist.length}
			</span>
		</div>

		{#if ttsState.isGenerating}
			<span class="status">Generating...</span>
		{/if}

		<audio
			bind:this={audioElement}
			src={ttsState.audioSrc ?? undefined}
			onplay={() => { ttsState.isPlaying = true; }}
			onpause={() => { ttsState.isPlaying = false; }}
			onended={handleEnded}
			onerror={(e) => {
				const target = e.target as HTMLAudioElement;
				ttsState.errorMessage = `Playback error (${target.error?.code ?? "unknown"})`;
				ttsState.isPlaying = false;
			}}
		></audio>
	</div>

	{#if ttsState.errorMessage}
		<div class="error-bar">
			<span>{ttsState.errorMessage}</span>
			<button type="button" onclick={() => ttsState.errorMessage = ""}>×</button>
		</div>
	{/if}
{/if}

<style>
	.tts-player {
		position: fixed;
		bottom: 0;
		left: 0;
		right: 0;
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 0.75rem 1rem;
		background: rgba(0, 0, 0, 0.95);
		border-top: 1px solid rgba(255, 255, 255, 0.1);
		z-index: 1000;
	}

	.controls {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.controls button {
		all: unset;
		box-sizing: border-box;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		padding: 0.4rem;
		border-radius: 4px;
		background: rgba(255, 255, 255, 0.06);
		color: var(--primary-color);
	}

	.controls button:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.controls button:not(:disabled):hover {
		background: rgba(255, 255, 255, 0.12);
	}

	.track-info {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.counter {
		font-size: 0.85rem;
		font-variant-numeric: tabular-nums;
		color: rgba(255, 255, 255, 0.7);
	}

	.status {
		font-size: 0.85rem;
		color: var(--primary-color);
	}

	.error-bar {
		position: fixed;
		bottom: 4rem;
		left: 50%;
		transform: translateX(-50%);
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.5rem 1rem;
		background: rgba(255, 80, 80, 0.15);
		border: 1px solid rgba(255, 80, 80, 0.4);
		border-radius: 8px;
		color: #ff5a5a;
		font-size: 0.85rem;
		z-index: 1001;
	}

	.error-bar button {
		all: unset;
		cursor: pointer;
		font-size: 1.2rem;
		line-height: 1;
		opacity: 0.7;
	}

	.error-bar button:hover {
		opacity: 1;
	}
</style>