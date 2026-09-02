import type { WaveStyleConfig } from '@/lib/ttsPlayerConfig';

export interface WaveformDrawConfig {
	splineSampleStep: number;
	amplitudeScale: number;
	maxWaveAmplitudePx: number;
	wavelengthScale: number;
	sineFillAlpha: number;
	strokeWidth: number;
}

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

export function resizeCanvas(
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
	resizeCanvas(canvas, ctx, width, height);

	const bufferLength = analyser.frequencyBinCount;
	const dataArray = new Uint8Array(bufferLength);
	analyser.getByteTimeDomainData(dataArray);

	ctx.clearRect(0, 0, width, height);

	const sampleStep = Math.max(1, Math.floor((bufferLength / width / 2) * c.wavelengthScale));
	const minWavePoints = 4;
	let effectiveStep = sampleStep;
	if (bufferLength / effectiveStep < minWavePoints) {
		effectiveStep = Math.floor(bufferLength / minWavePoints);
	}
	const splineSampleCount = Math.round(1 / c.splineSampleStep);
	const points: number[] = [];

	for (let i = 0; i < bufferLength; i += effectiveStep) {
		const value = dataArray[i];
		const normalized = (value / 255 - 0.5) * height * c.amplitudeScale;
		const y = height / 2 - normalized;
		points.push(y);
	}

	const path = new Path2D();
	const pixelStep = width / (points.length - 1);

	if (points.length >= 2) {
		path.moveTo(0, points[0]);

		for (let i = 0; i < points.length - 1; i += 1) {
			const p0 = points[i - 1] ?? points[0];
			const p1 = points[i];
			const p2 = points[i + 1];
			const p3 = points[i + 2] ?? points[points.length - 1];

			for (let j = 1; j <= splineSampleCount; j += 1) {
				const t = j * c.splineSampleStep;
				const y = catmullRomSpline(p0, p1, p2, p3, t);
				const x = (i + t) * pixelStep;
				path.lineTo(x, y);
			}
		}
	}

	ctx.strokeStyle = color;
	ctx.lineWidth = c.strokeWidth;
	ctx.lineCap = 'round';
	ctx.lineJoin = 'round';
	ctx.stroke(path);
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

	const t = performance.now() / 1000;
	const amplitude = Math.min(height * waveConfig.amplitude, c.maxWaveAmplitudePx);
	const pointCount = waveConfig.pointCount;
	const phaseSpeed = waveConfig.baseSpeed;

	ctx.clearRect(0, 0, width, height);

	const points: number[] = [];
	for (let i = 0; i < pointCount; i += 1) {
		const u = pointCount === 1 ? 0 : i / (pointCount - 1);
		let y = height / 2;
		for (const h of waveConfig.harmonics) {
			y +=
				amplitude *
				h.amplitudeRatio *
				Math.sin(2 * Math.PI * h.cycles * u - t * phaseSpeed * h.speedRatio);
		}
		points.push(y);
	}

	const path = new Path2D();
	const pixelStep = width / (points.length - 1);

	if (points.length >= 2) {
		path.moveTo(0, points[0]);

		for (let i = 0; i < points.length - 1; i += 1) {
			const p0 = points[i - 1] ?? points[0];
			const p1 = points[i];
			const p2 = points[i + 1];
			const p3 = points[i + 2] ?? points[points.length - 1];

			const splineSampleCount = Math.round(1 / c.splineSampleStep);
			for (let j = 1; j <= splineSampleCount; j += 1) {
				const tt = j * c.splineSampleStep;
				const y = catmullRomSpline(p0, p1, p2, p3, tt);
				const x = (i + tt) * pixelStep;
				path.lineTo(x, y);
			}
		}
	}

	ctx.strokeStyle = color;
	ctx.lineWidth = c.strokeWidth;
	ctx.lineCap = 'round';
	ctx.lineJoin = 'round';
	ctx.stroke(path);
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

	const path = new Path2D();
	path.moveTo(0, height / 2);
	path.lineTo(width, height / 2);

	ctx.strokeStyle = color;
	ctx.lineWidth = c.strokeWidth;
	ctx.lineCap = 'round';
	ctx.lineJoin = 'round';
	ctx.stroke(path);
}

export function clearCanvas(canvas: HTMLCanvasElement): void {
	const ctx = canvas.getContext('2d');
	if (!ctx) return;
	ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
}
