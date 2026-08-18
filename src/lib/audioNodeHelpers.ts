export function createAnalyserNode(ctx: AudioContext): AnalyserNode {
	const analyser = ctx.createAnalyser();
	analyser.fftSize = 1024;
	analyser.smoothingTimeConstant = 0.8;
	analyser.minDecibels = -90;
	analyser.maxDecibels = -10;
	return analyser;
}

export function teardownSource(source: AudioBufferSourceNode | null): void {
	if (!source) return;
	source.onended = null;
	try {
		source.stop();
	} catch {
		// ignore stop errors
	}
	source.disconnect();
}

export function teardownAnalyser(analyser: AnalyserNode | null): void {
	if (!analyser) return;
	try {
		analyser.disconnect();
	} catch {
		// ignore disconnect errors
	}
}

export async function decodeBlob(blob: Blob, ctx: AudioContext): Promise<AudioBuffer> {
	const arrayBuffer = await blob.arrayBuffer();
	return ctx.decodeAudioData(arrayBuffer);
}

export function waitMs(delay: number, signal?: AbortSignal): Promise<void> {
	return new Promise<void>((resolve) => {
		if (delay <= 0) {
			resolve();
			return;
		}
		const timer = setTimeout(resolve, delay);
		signal?.addEventListener(
			'abort',
			() => {
				clearTimeout(timer);
				resolve();
			},
			{ once: true }
		);
	});
}
