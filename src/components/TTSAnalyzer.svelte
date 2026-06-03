<script lang="ts">
	import { viewState } from '@/stores/viewStore.svelte';
	import { fade } from 'svelte/transition';

	let canvas: HTMLCanvasElement | null = $state(null);
	let { analyserNode, isPlaying } = $props();

	let animationFrame: number | null = null;
	const amplitudeScale = 0.3; // Increase for softer, more pronounced waves
	const wavelengthScale = 100; // Increase to make waves wider (larger X amplitude between zero crossings)

	function catmullRomSpline(p0: number, p1: number, p2: number, p3: number, t: number): number {
		const t2 = t * t;
		const t3 = t2 * t;
		return (
			0.5 *
			(2 * p1 +
				(-p0 + p2) * t +
				(2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
				(-p0 + 3 * p1 - 3 * p2 + p3) * t3)
		);
	}

	function resizeCanvas(ctx: CanvasRenderingContext2D, width: number, height: number) {
		const pixelRatio = window.devicePixelRatio || 1;
		const scaledWidth = Math.floor(width * pixelRatio);
		const scaledHeight = Math.floor(height * pixelRatio);

		if (canvas!.width !== scaledWidth || canvas!.height !== scaledHeight) {
			canvas!.width = scaledWidth;
			canvas!.height = scaledHeight;
			ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
		}
	}

	function drawWaveform() {
		if (!canvas || !analyserNode) {
			return;
		}

		const ctx = canvas.getContext('2d');
		if (!ctx) {
			return;
		}

		const width = canvas.clientWidth;
		const height = canvas.clientHeight;
		resizeCanvas(ctx, width, height);

		const bufferLength = analyserNode.fftSize;
		const dataArray = new Uint8Array(bufferLength);
		analyserNode.getByteTimeDomainData(dataArray);

		ctx.clearRect(0, 0, width, height);
		ctx.fillStyle = 'rgba(0, 0, 0, 0.24)';
		ctx.fillRect(0, 0, width, height);

		// Sample every 2 points for smooth spline interpolation
		const sampleStep = Math.max(1, Math.floor((bufferLength / width / 2) * wavelengthScale));
		const points: number[] = [];

		for (let i = 0; i < bufferLength; i += sampleStep) {
			const value = dataArray[i];
			const normalized = (value / 255 - 0.5) * height * amplitudeScale;
			const y = height / 2 - normalized;
			points.push(y);
		}

		// Build waveform path using Catmull-Rom spline
		const path = new Path2D();
		const pixelStep = width / (points.length - 1);

		if (points.length >= 2) {
			// Start at first point
			path.moveTo(0, points[0]);

			// Interpolate between each pair of points
			for (let i = 0; i < points.length - 1; i += 1) {
				const p0 = points[i - 1] ?? points[0];
				const p1 = points[i];
				const p2 = points[i + 1];
				const p3 = points[i + 2] ?? points[points.length - 1];

				// Draw curve between p1 and p2 using 10 interpolation steps
				for (let t = 0.1; t <= 1; t += 0.1) {
					const y = catmullRomSpline(p0, p1, p2, p3, t);
					const x = (i + t) * pixelStep;
					path.lineTo(x, y);
				}
			}
		}

		ctx.strokeStyle = 'white';
		ctx.lineWidth = 3;
		ctx.lineCap = 'round';
		ctx.lineJoin = 'round';
		ctx.stroke(path);
	}

	function startAnimation() {
		if (animationFrame !== null) return;

		const step = () => {
			drawWaveform();
			animationFrame = requestAnimationFrame(step);
		};

		animationFrame = requestAnimationFrame(step);
	}

	function stopAnimation() {
		if (animationFrame !== null) {
			cancelAnimationFrame(animationFrame);
			animationFrame = null;
		}
	}

	$effect(() => {
		if (analyserNode && isPlaying) {
			startAnimation();
		} else {
			stopAnimation();
		}

		return () => stopAnimation();
	});
</script>

<div in:fade out:fade class="analyzer-wrapper" class:hidden={!analyserNode || !isPlaying}>
	<canvas bind:this={canvas} class="analyzer-canvas" aria-hidden="true"></canvas>
</div>

<style>
	.analyzer-wrapper {
		position: fixed;
		bottom: 0;
		width: 100%;
		height: 100%;
		border-radius: 16px;
		overflow: hidden;
		background: rgba(14, 14, 14, 0.76);
		box-shadow:
			0 0 0 1px rgba(255, 255, 255, 0.06),
			0 18px 48px rgba(0, 0, 0, 0.4);
		z-index: 1000;
	}

	.analyzer-canvas {
		width: 100%;
		height: 100%;
		display: block;
	}

	.hidden {
		display: none;
	}
</style>
