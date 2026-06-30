import { startMicRecording, stopMicRecording, sendAudio, pcmToWav } from '@/lib/utils/micService';

class MicState {
	isRecording = $state(false);
	transcription = $state('');
	errorMessage = $state('');
	isTestRecording = $state(false);
	testAudioUrl = $state<string | null>(null);
	testAudioBlob = $state<Blob | null>(null);

	private _chunkBuffer: Float32Array[] = [];
	private _bufferedSamples = 0;
	private _testChunkBuffer: Float32Array[] = [];
	private _testBufferedSamples = 0;

	async startMic(): Promise<void> {
		if (this.isRecording) return;

		this.errorMessage = '';
		this.transcription = '';
		this._chunkBuffer = [];
		this._bufferedSamples = 0;

		try {
			await startMicRecording((pcm) => {
				this._chunkBuffer.push(pcm);
				this._bufferedSamples += pcm.length;
			});

			this.isRecording = true;
		} catch (err) {
			this.errorMessage = err instanceof Error ? err.message : 'Failed to start microphone';
			this.isRecording = false;
		}
	}

	stopMic(): void {
		if (!this.isRecording) return;

		stopMicRecording();
		this.isRecording = false;

		void this._flushBuffer();
	}

	private async _flushBuffer(): Promise<void> {
		if (this._bufferedSamples === 0) return;

		const total = new Float32Array(this._bufferedSamples);
		let offset = 0;
		for (const chunk of this._chunkBuffer) {
			total.set(chunk, offset);
			offset += chunk.length;
		}

		this._chunkBuffer = [];
		this._bufferedSamples = 0;

		const text = await sendAudio(total);
		if (text) {
			this.transcription += text + ' ';
		}
	}

	async startTestRecording(): Promise<void> {
		if (this.isRecording || this.isTestRecording) return;

		this.errorMessage = '';
		this._testChunkBuffer = [];
		this._testBufferedSamples = 0;

		try {
			await startMicRecording((pcm) => {
				this._testChunkBuffer.push(pcm);
				this._testBufferedSamples += pcm.length;
			});

			this.isTestRecording = true;
		} catch (err) {
			this.errorMessage = err instanceof Error ? err.message : 'Failed to start microphone';
			this.isTestRecording = false;
		}
	}

	stopTestRecording(): void {
		if (!this.isTestRecording) return;

		stopMicRecording();
		this.isTestRecording = false;

		if (this._testBufferedSamples > 0) {
			const total = new Float32Array(this._testBufferedSamples);
			let offset = 0;
			for (const chunk of this._testChunkBuffer) {
				total.set(chunk, offset);
				offset += chunk.length;
			}

			this._testChunkBuffer = [];
			this._testBufferedSamples = 0;

			const wavBlob = pcmToWav(total, 16000);
			this.testAudioBlob = wavBlob;
			this.testAudioUrl = URL.createObjectURL(wavBlob);
		}
	}

	playTestAudio(): void {
		if (this.testAudioUrl) {
			const audio = new Audio(this.testAudioUrl);
			void audio.play();
		}
	}

	clearTestAudio(): void {
		if (this.testAudioUrl) {
			URL.revokeObjectURL(this.testAudioUrl);
		}
		this.testAudioUrl = null;
		this.testAudioBlob = null;
	}
}

export const micState = new MicState();
