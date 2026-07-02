const WHISPER_API_URL = import.meta.env.VITE_WHISPER_API_URL;

let micContext: AudioContext | null = null;
let micStream: MediaStream | null = null;
let workletNode: AudioWorkletNode | null = null;
let micAnalyser: AnalyserNode | null = null;

export async function startMicRecording(
	onChunk: (pcm: Float32Array) => void
): Promise<{ analyser: AnalyserNode }> {
	console.log('start');
	if (micContext) {
		throw new Error('Microphone is already active');
	}

	const stream = await navigator.mediaDevices.getUserMedia({
		audio: {
			channelCount: 1,
			echoCancellation: true,
			noiseSuppression: true,
			autoGainControl: true
		}
	});

	const ctx = new AudioContext({ sampleRate: 16000 });
	await ctx.audioWorklet.addModule('/audio-worklet-processor.js');

	const source = ctx.createMediaStreamSource(stream);
	const node = new AudioWorkletNode(ctx, 'pcm-processor');

	const analyser = ctx.createAnalyser();
	analyser.fftSize = 1024;
	analyser.smoothingTimeConstant = 0.8;
	analyser.minDecibels = -90;
	analyser.maxDecibels = -10;

	node.port.onmessage = (event: MessageEvent<Float32Array>) => {
		onChunk(event.data);
	};

	source.connect(node);
	source.connect(analyser);
	node.connect(ctx.destination);

	micContext = ctx;
	micStream = stream;
	workletNode = node;
	micAnalyser = analyser;

	return { analyser };
}

export function stopMicRecording(): void {
	console.log('stop');
	if (micStream) {
		for (const track of micStream.getTracks()) {
			track.stop();
		}
		micStream = null;
	}

	if (workletNode) {
		workletNode.disconnect();
		workletNode.port.onmessage = null;
		workletNode = null;
	}

	if (micAnalyser) {
		try {
			micAnalyser.disconnect();
		} catch {
			// ignore
		}
		micAnalyser = null;
	}

	if (micContext) {
		void micContext.close();
		micContext = null;
	}
}

export async function sendAudio(pcm: Float32Array): Promise<string | null> {
	try {
		const blob = new Blob([pcm.buffer], { type: 'audio/pcm' });
		const res = await fetch(`${WHISPER_API_URL}/speech`, {
			method: 'POST',
			headers: { 'Content-Type': 'audio/pcm' },
			body: blob
		});

		if (!res.ok) {
			console.error('[Mic] Speech API error:', res.status);
			return null;
		}

		const data = await res.json();
		console.log('speech response', data);
		return typeof data.text === 'string' ? data.text : null;
	} catch (err) {
		console.error('[Mic] Failed to send audio chunk:', err);
		return null;
	}
}

export function pcmToWav(pcm: Float32Array, sampleRate: number): Blob {
	const int16 = new Int16Array(pcm.length);
	for (let i = 0; i < pcm.length; i++) {
		const s = Math.max(-1, Math.min(1, pcm[i]));
		int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
	}

	const buffer = new ArrayBuffer(44 + int16.length * 2);
	const view = new DataView(buffer);

	writeString(view, 0, 'RIFF');
	view.setUint32(4, 36 + int16.length * 2, true);
	writeString(view, 8, 'WAVE');
	writeString(view, 12, 'fmt ');
	view.setUint32(16, 16, true);
	view.setUint16(20, 1, true);
	view.setUint16(22, 1, true);
	view.setUint32(24, sampleRate, true);
	view.setUint32(28, sampleRate * 2, true);
	view.setUint16(32, 2, true);
	view.setUint16(34, 16, true);
	writeString(view, 36, 'data');
	view.setUint32(40, int16.length * 2, true);

	const dataView = new DataView(buffer, 44);
	for (let i = 0; i < int16.length; i++) {
		dataView.setInt16(i * 2, int16[i], true);
	}

	return new Blob([buffer], { type: 'audio/wav' });
}

function writeString(view: DataView, offset: number, string: string): void {
	for (let i = 0; i < string.length; i++) {
		view.setUint8(offset + i, string.charCodeAt(i));
	}
}
