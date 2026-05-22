import { viewState } from './viewStore.svelte';
import { addVoice, generateSpeech } from '@/lib/utils/ttsService';

export interface TTSRefConfig {
	refAudioFilename: string;
	refText: string;
}

export interface TTSConfig extends TTSRefConfig {
	numStep: number;
	denoise: boolean;
	guidanceScale: number;
	speed: number;
	preprocessPrompt: boolean;
	postprocessOutput: boolean;
	tShift?: number;
	positionTemperature?: number;
	classTemperature?: number;
	layerPenaltyFactor?: number;
	duration?: number;
	audioChunkDuration?: number;
	audioChunkThreshold?: number;
}

class TTSState {
	isLoading = $state(false);
	isPlaying = $state(false);
	errorMessage = $state('');
	durationSeconds = $state<number | null>(null);

	textContents = $state<string[]>([]);
	isGenerating = $state(false);
	blobs = $state<Blob[]>([]);

	language = $derived(viewState.language);
	config = $state<TTSConfig>({
		refAudioFilename: '920d866c-fdc3-4e22-ab7a-838ef0d3fc7b_1.mp3',
		refText:
			'Vas a ver los ejercicios que hago, las series, las repeticiones, los kilos que levanto y lo más importante, como ajusto a la intensidad para poder recuperarme y entrenar de forma inteligente.  Hola chicas y chicos, bienvenidos a un nuevo vídeo del canal.',
		numStep: 16,
		denoise: true,
		guidanceScale: 1.0,
		speed: 1.0,
		preprocessPrompt: true,
		postprocessOutput: true
	});

	videoUrl = $state('');
	segment = $state('00:00-01:00');
	namePrefix = $state('jessica_martin');
	chunkCount = $state(1);
	addVoiceStatus = $state<'' | 'downloading' | 'transcribing' | 'chunking' | 'done' | 'error'>('');
	addVoiceMessage = $state('');
	addVoiceLoading = $state(false);
	private eventSource: EventSource | null = null;

	setTextContents(contents: string[]): void {
		this.textContents = contents;
	}

	addTextContent(content: string): void {
		this.textContents = [...this.textContents, content];
	}

	clearTextContents(): void {
		this.textContents = [];
	}

	clearPlaylist(): void {
		this.isPlaying = false;
		this.blobs = [];
	}

	releaseBlobs(): void {
		this.blobs = [];
	}

	async generateTTS(): Promise<void> {
		if (this.isGenerating || this.textContents.length === 0) {
			return;
		}

		this.releaseBlobs();
		this.isGenerating = true;
		this.errorMessage = '';
		this.isPlaying = false;

		try {
			let totalDuration = 0;

			for (const text of this.textContents) {
				const res = await generateSpeech({
					text,
					ref_audio: this.config.refAudioFilename,
					ref_text: this.config.refText,
					num_step: this.config.numStep,
					denoise: this.config.denoise,
					guidance_scale: this.config.guidanceScale,
					t_shift: this.config.tShift,
					position_temperature: this.config.positionTemperature,
					class_temperature: this.config.classTemperature,
					layer_penalty_factor: this.config.layerPenaltyFactor,
					duration: this.config.duration,
					speed: this.config.speed,
					preprocess_prompt: this.config.preprocessPrompt,
					postprocess_output: this.config.postprocessOutput,
					audio_chunk_duration: this.config.audioChunkDuration,
					audio_chunk_threshold: this.config.audioChunkThreshold
				});

				if (res.blob.size === 0) {
					throw new Error('Generated audio is empty (0 bytes)');
				}

				this.blobs.push(res.blob);
				totalDuration += res.durationSeconds ?? 0;
			}

			this.durationSeconds = totalDuration;

			if (this.blobs.length > 0) {
				this.isPlaying = true;
			}
		} catch (err) {
			this.errorMessage = err instanceof Error ? err.message : 'Failed to generate TTS audio';
			console.error('[TTS] Generation error:', err);
		} finally {
			this.isGenerating = false;
		}
	}

	cleanup(): void {
		if (this.eventSource) {
			this.eventSource.close();
			this.eventSource = null;
		}
	}

	async startAddVoice(): Promise<void> {
		if (this.eventSource) {
			this.eventSource.close();
			this.eventSource = null;
		}

		this.addVoiceLoading = true;
		this.addVoiceStatus = '';
		this.addVoiceMessage = '';
		try {
			const { source } = await addVoice({
				url: this.videoUrl,
				segment: this.segment,
				name_prefix: this.namePrefix,
				chunk_count: this.chunkCount
			});

			this.eventSource = source;

			console.log(source);

			await new Promise<void>((resolve) => {
				source.onmessage = (e) => {
					const data = JSON.parse(e.data);
					const eventName = e.type || data.status;
					this.addVoiceStatus = eventName;
					if (eventName === 'chunking') {
						this.addVoiceMessage = `Processing chunk ${data.current} of ${data.total}`;
					} else {
						this.addVoiceMessage = data.message ?? eventName;
					}
					if (eventName === 'done' || eventName === 'error') {
						source.close();
						this.eventSource = null;
						this.addVoiceLoading = false;
						resolve();
					}
				};
				source.onerror = () => {
					source.close();
					this.eventSource = null;
					this.addVoiceLoading = false;
					this.addVoiceStatus = 'error';
					this.addVoiceMessage = 'Connection lost';
					resolve();
				};
			});
		} catch (err) {
			this.addVoiceLoading = false;
			this.addVoiceStatus = 'error';
			this.addVoiceMessage = err instanceof Error ? err.message : 'Failed to start';
		}
	}
}

export const ttsState = new TTSState();
