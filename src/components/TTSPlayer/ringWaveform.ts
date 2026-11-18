import type { WaveformDrawConfig } from '@/lib/canvasWaveform';
import type { WaveStyleConfig } from '@/lib/ttsPlayerConfig';

/**
 * Radial (circular) variants of the TTS waveform drawers.
 *
 * The shared `@/lib/canvasWaveform` draws a horizontal line and is also used
 * by ConversationMode, so the TTS strip gets its own copy here that emits
 * polar coordinates instead: a ring centered in the canvas that deforms with
 * the audio. No runtime dependency on the shared module — only its config
 * type is imported.
 */

interface RingDefaults {
	/** Ring radius as a fraction of the inscribed circle diameter. */
	baseRadiusRatio: number;
	/** Max deviation from the base radius, as a fraction of the diameter. */
	maxDeviationRatio: number;
	/** Stroke width cap as a fraction of the diameter. */
	maxStrokeWidthRatio: number;
	/**
	 * Minimum control points around the ring. The linear drawers resolve ~4
	 * points across a wide strip, which is smooth enough there but reads as a
	 * blob when wrapped, so the ring keeps a denser sample.
	 */
	minPoints: number;
}

// baseRadiusRatio + maxDeviationRatio + maxStrokeWidthRatio / 2 must stay
// below 0.5, otherwise the stroke bleeds outside the inscribed circle.
const RING_DEFAULTS: RingDefaults = {
	baseRadiusRatio: 0.3,
	maxDeviationRatio: 0.15,
	maxStrokeWidthRatio: 0.08,
	minPoints: 48
};

const DEFAULT_CONFIG: WaveformDrawConfig = {
	splineSampleStep: 0.1,
	amplitudeScale: 1.0,
	maxWaveAmplitudePx: 80,
	wavelengthScale: 300,
	sineFillAlpha: 0.24,
	strokeWidth: 4
};

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

function resizeCanvas(
	canvas: HTMLCanvasElement,
	ctx: CanvasRenderingContext2D,
	width: number,
	height: number
): void {
	const pixelRatio = window.devicePixelRatio || 1;
	const scaledWidth = Math.floor(width * pixelRatio);
	const scaledHeight = Math.floor(height * pixelRatio);

	if (canvas.width !== scaledWidth || canvas.height !== scaledHeight) {
		canvas.width = scaledWidth;
		canvas.height = scaledHeight;
		ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
	}
}

interface RingGeometry {
	cx: number;
	cy: number;
	baseR: number;
	maxDev: number;
	lineW: number;
}

function ringGeometry(width: number, height: number, cfg: WaveformDrawConfig): RingGeometry {
	const size = Math.min(width, height);
	return {
		cx: width / 2,
		cy: height / 2,
		baseR: size * RING_DEFAULTS.baseRadiusRatio,
		maxDev: size * RING_DEFAULTS.maxDeviationRatio,
		lineW: Math.min(cfg.strokeWidth, size * RING_DEFAULTS.maxStrokeWidthRatio)
	};
}

function polarPoint(g: RingGeometry, angle: number, dev: number): { x: number; y: number } {
	// Clamp so no caller (amplitudeScale, harmonics) can push the ring out of
	// the inscribed circle.
	const radius = g.baseR + Math.max(-g.maxDev, Math.min(g.maxDev, dev));
	return {
		x: g.cx + Math.sin(angle) * radius,
		y: g.cy - Math.cos(angle) * radius
	};
}

/**
 * Wraps samples into a seamless loop: run them forward, then mirror them
 * back so the last point lands on the first one's radius instead of leaving
 * a radial notch where the path closes.
 */
function mirrorRing(devs: number[]): number[] {
	const ring = devs.slice();
	for (let i = devs.length - 2; i >= 1; i -= 1) ring.push(devs[i]);
	ring.push(devs[0]);
	return ring;
}

function strokeRingPath(
	ctx: CanvasRenderingContext2D,
	path: Path2D,
	color: string,
	g: RingGeometry
): void {
	ctx.strokeStyle = color;
	ctx.lineWidth = g.lineW;
	ctx.lineCap = 'round';
	ctx.lineJoin = 'round';
	ctx.stroke(path);
}

export function drawWaveform(
	canvas: HTMLCanvasElement,
	analyser: AnalyserNode,
	color: string,
	cfg?: Partial<WaveformDrawConfig>
): void {
	const c = { ...DEFAULT_CONFIG, ...cfg };
	const ctx = canvas.getContext('2d');
	if (!ctx) return;

	const width = canvas.clientWidth;
	const height = canvas.clientHeight;
	if (width === 0 || height === 0) return;

	resizeCanvas(canvas, ctx, width, height);

	const bufferLength = analyser.frequencyBinCount;
	const dataArray = new Uint8Array(bufferLength);
	analyser.getByteTimeDomainData(dataArray);

	ctx.clearRect(0, 0, width, height);

	const size = Math.min(width, height);
	const sampleStep = Math.max(1, Math.floor((bufferLength / size / 2) * c.wavelengthScale));
	const minWavePoints = 4;
	let effectiveStep = sampleStep;
	if (bufferLength / effectiveStep < minWavePoints) {
		effectiveStep = Math.floor(bufferLength / minWavePoints);
	}
	effectiveStep = Math.max(
		1,
		Math.min(effectiveStep, Math.floor(bufferLength / RING_DEFAULTS.minPoints))
	);
	const splineSampleCount = Math.round(1 / c.splineSampleStep);

	// Deviations from the base radius, sampled around the buffer.
	const devs: number[] = [];
	for (let i = 0; i < bufferLength; i += effectiveStep) {
		const normalized = (dataArray[i] / 255 - 0.5) * size * c.amplitudeScale;
		devs.push(normalized);
	}

	if (devs.length < 2) return;

	// Mirror the samples so the ring closes on the radius it started with —
	// otherwise the last sample jumps back to the first and leaves a radial
	// notch at 12 o'clock.
	const ring = mirrorRing(devs);

	const g = ringGeometry(width, height, c);
	const path = new Path2D();
	const count = ring.length;

	// Build spline samples in polar space: each sample carries its angle and
	// its interpolated deviation.
	const samples: { angle: number; dev: number }[] = [];
	for (let i = 0; i < count - 1; i += 1) {
		const p0 = ring[i - 1] ?? ring[0];
		const p1 = ring[i];
		const p2 = ring[i + 1];
		const p3 = ring[i + 2] ?? ring[count - 1];

		for (let j = 0; j <= splineSampleCount; j += 1) {
			const t = j * c.splineSampleStep;
			const u = (i + t) / (count - 1);
			samples.push({ angle: u * Math.PI * 2, dev: catmullRomSpline(p0, p1, p2, p3, t) });
		}
	}

	const first = polarPoint(g, samples[0].angle, samples[0].dev);
	path.moveTo(first.x, first.y);
	for (let i = 1; i < samples.length; i += 1) {
		const p = polarPoint(g, samples[i].angle, samples[i].dev);
		path.lineTo(p.x, p.y);
	}
	path.closePath();

	strokeRingPath(ctx, path, color, g);
}

export function drawGeneratingWave(
	canvas: HTMLCanvasElement,
	color: string,
	waveConfig: WaveStyleConfig,
	cfg?: Partial<WaveformDrawConfig>
): void {
	const c = { ...DEFAULT_CONFIG, ...cfg };
	const ctx = canvas.getContext('2d');
	if (!ctx) return;

	const width = canvas.clientWidth;
	const height = canvas.clientHeight;
	if (width === 0 || height === 0) return;

	resizeCanvas(canvas, ctx, width, height);

	const g = ringGeometry(width, height, c);
	const t = performance.now() / 1000;
	const amplitude = Math.min(Math.min(width, height) * waveConfig.amplitude, g.maxDev);
	const pointCount = waveConfig.pointCount;
	const phaseSpeed = waveConfig.baseSpeed;

	ctx.clearRect(0, 0, width, height);

	const devs: number[] = [];
	for (let i = 0; i < pointCount; i += 1) {
		const u = pointCount === 1 ? 0 : i / (pointCount - 1);
		let dev = 0;
		for (const h of waveConfig.harmonics) {
			dev +=
				amplitude *
				h.amplitudeRatio *
				Math.sin(2 * Math.PI * h.cycles * u - t * phaseSpeed * h.speedRatio);
		}
		devs.push(dev);
	}

	const path = new Path2D();
	// The harmonics do not necessarily end where they start (non-integer
	// cycles), so mirror them into a seamless loop like the waveform does.
	const ring = mirrorRing(devs);
	const first = polarPoint(g, 0, ring[0]);
	path.moveTo(first.x, first.y);
	for (let i = 1; i < ring.length; i += 1) {
		const p = polarPoint(g, (i / (ring.length - 1)) * Math.PI * 2, ring[i]);
		path.lineTo(p.x, p.y);
	}
	path.closePath();

	strokeRingPath(ctx, path, color, g);
}

export function drawIdleLine(
	canvas: HTMLCanvasElement,
	color: string,
	cfg?: Partial<WaveformDrawConfig>
): void {
	const c = { ...DEFAULT_CONFIG, ...cfg };
	const ctx = canvas.getContext('2d');
	if (!ctx) return;

	const width = canvas.clientWidth;
	const height = canvas.clientHeight;
	if (width === 0 || height === 0) return;

	resizeCanvas(canvas, ctx, width, height);

	ctx.clearRect(0, 0, width, height);

	const g = ringGeometry(width, height, c);
	const path = new Path2D();
	path.arc(g.cx, g.cy, g.baseR, 0, Math.PI * 2);

	strokeRingPath(ctx, path, color, g);
}
