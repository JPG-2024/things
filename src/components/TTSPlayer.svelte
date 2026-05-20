<script lang="ts">
	import Icon from './Icon.svelte';
	import { ttsState } from '@/stores/ttsStore.svelte';

	let audioContext: AudioContext | null = $state(null);
	let currentSource: AudioBufferSourceNode | null = $state(null);
	let combinedBuffer: AudioBuffer | null = $state(null);
	let isSettingUp = false;

	function getAudioContext(): AudioContext {
		if (!audioContext) {
			audioContext = new AudioContext();
		}
		return audioContext;
	}

	async function ensureResumed() {
		const ctx = getAudioContext();
		if (ctx.state === 'suspended') {
			await ctx.resume();
		}
	}

	async function decodeBlob(blob: Blob): Promise<AudioBuffer> {
		const ctx = getAudioContext();
		const arrayBuffer = await blob.arrayBuffer();
		return ctx.decodeAudioData(arrayBuffer);
	}

	async function concatenateBlobs(blobs: Blob[]): Promise<AudioBuffer> {
		const ctx = getAudioContext();
		const decoded = await Promise.all(blobs.map((b) => decodeBlob(b)));

		if (decoded.length === 0) {
			throw new Error('No blobs to concatenate');
		}

		const sampleRate = decoded[0].sampleRate;
		const channels = decoded[0].numberOfChannels;
		const totalLength = decoded.reduce((acc, buf) => acc + buf.length, 0);

		const combined = ctx.createBuffer(channels, totalLength, sampleRate);

		let offset = 0;
		for (const buf of decoded) {
			for (let ch = 0; ch < channels; ch++) {
				combined.copyToChannel(buf.getChannelData(ch), ch, offset);
			}
			offset += buf.length;
		}

		return combined;
	}

	async function playBuffer() {
		if (isSettingUp || !combinedBuffer) return;
		isSettingUp = true;

		await ensureResumed();

		if (currentSource) {
			currentSource.onended = null;
			currentSource.stop();
			currentSource = null;
		}

		const ctx = getAudioContext();
		const source = ctx.createBufferSource();
		source.buffer = combinedBuffer;
		source.connect(ctx.destination);

		source.onended = () => {
			if (currentSource === source) {
				currentSource.disconnect();
				currentSource = null;
				ttsState.isPlaying = false;
			}
		};

		source.start(0);
		currentSource = source;
		ttsState.isPlaying = true;
		isSettingUp = false;
	}

	function stopPlayback() {
		if (currentSource) {
			currentSource.onended = null;
			currentSource.stop();
			ttsState.isPlaying = false;
		}
	}

	async function togglePlay() {
		if (ttsState.isPlaying) {
			stopPlayback();
			return;
		}

		if (ttsState.blobs.length === 0) return;

		if (!audioContext) {
			getAudioContext();
		}
		await ensureResumed();

		const buf = await concatenateBlobs(ttsState.blobs);
		combinedBuffer = buf;
		await playBuffer();
	}

	function handleStop() {
		stopPlayback();
	}

	$effect(() => {
		if (ttsState.blobs.length > 0 && ttsState.isPlaying) {
			concatenateBlobs(ttsState.blobs).then((buf) => {
				combinedBuffer = buf;
				playBuffer();
			});
		} else if (ttsState.blobs.length === 0) {
			combinedBuffer = null;
		}
	});

	$effect(() => {
		if (ttsState.isGenerating) {
			stopPlayback();
		}
	});

	$effect(() => {
		return () => {
			stopPlayback();
			if (audioContext) {
				audioContext.close();
				audioContext = null;
			}
		};
	});
</script>

<div class="tts-player">
	<div class="controls">
		<button
			type="button"
			onclick={ttsState.isPlaying ? handleStop : togglePlay}
			disabled={ttsState.isGenerating}
			aria-label={ttsState.isPlaying ? 'Stop' : 'Play'}
		>
			{#if ttsState.isGenerating}
				<Icon name="Loader" size={18} />
			{:else if ttsState.isPlaying}
				<Icon name="Square" size={18} />
			{:else}
				<Icon name="Play" size={18} />
			{/if}
		</button>
	</div>

	<div class="track-info">
		<span class="counter">
			{ttsState.blobs.length} track{ttsState.blobs.length !== 1 ? 's' : ''}
		</span>
	</div>

	{#if ttsState.isGenerating}
		<span class="status">Generating...</span>
	{/if}
</div>

{#if ttsState.errorMessage}
	<div class="error-bar">
		<span>{ttsState.errorMessage}</span>
		<button type="button" onclick={() => (ttsState.errorMessage = '')}>×</button>
	</div>
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
