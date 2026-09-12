<script lang="ts">
	import {
		drawWaveform,
		drawGeneratingWave,
		drawIdleLine,
		type WaveformDrawConfig
	} from '@/lib/canvasWaveform';
	import type { WaveStyleConfig } from '@/lib/ttsPlayerConfig';

	interface Props {
		analyser: AnalyserNode | null;
		isPlaying: boolean;
		isPaused: boolean;
		isGenerating: boolean;
		addVoiceLoading: boolean;
		waitingForChunk: boolean;
		chunksGenerated: number;
		color: string;
		drawConfig: WaveformDrawConfig;
		waveConfig: WaveStyleConfig;
		variant: 'full' | 'mini';
	}

	let {
		analyser,
		isPlaying,
		isPaused,
		isGenerating,
		addVoiceLoading,
		waitingForChunk,
		chunksGenerated,
		color,
		drawConfig,
		waveConfig,
		variant
	}: Props = $props();

	let canvas: HTMLCanvasElement | null = $state(null);
	let animationFrame: number | null = null;

	function draw() {
		if (!canvas) return;
		if (analyser && isPlaying && !isPaused) {
			drawWaveform(canvas, analyser, color, drawConfig);
		} else if (addVoiceLoading || (isGenerating && chunksGenerated === 0)) {
			drawGeneratingWave(canvas, color, waveConfig, drawConfig);
		} else if (isGenerating || waitingForChunk) {
			drawIdleLine(canvas, color, drawConfig);
		}
	}

	function step() {
		draw();
		animationFrame = requestAnimationFrame(step);
	}

	function startAnimation() {
		if (animationFrame !== null) return;
		animationFrame = requestAnimationFrame(step);
	}

	function stopAnimation() {
		if (animationFrame !== null) {
			cancelAnimationFrame(animationFrame);
			animationFrame = null;
		}
	}

	$effect(() => {
		const shouldAnimate =
			isGenerating || addVoiceLoading || waitingForChunk || (!!analyser && isPlaying && !isPaused);
		if (shouldAnimate) {
			startAnimation();
		} else {
			stopAnimation();
		}

		return () => stopAnimation();
	});
</script>

<canvas
	bind:this={canvas}
	class="wave-canvas"
	class:wave-canvas--mini={variant === 'mini'}
	aria-hidden="true"
></canvas>

<style>
	.wave-canvas {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		display: block;
	}

	.wave-canvas--mini {
		background: rgba(9, 9, 9, 0.565);
		border-radius: var(--radius-lg);
	}
</style>
