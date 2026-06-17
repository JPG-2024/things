import { viewState } from './viewStore.svelte';
import { addVoice, generateSpeech, parseSSE } from '@/lib/utils/ttsService';

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
	isPaused = $state(false);
	errorMessage = $state('');
	durationSeconds = $state<number | null>(null);

	textContents = $state<string[]>([]);
	isGenerating = $state(false);
	blobs = $state<Blob[]>([]);
	generatedId = $state('');

	language = $derived(viewState.language);
	config = $state<TTSConfig>({
		refAudioFilename: '920d866c-fdc3-4e22-ab7a-838ef0d3fc7b_1.mp3',
		refText:
			'Vas a ver los ejercicios que hago, las series, las repeticiones, los kilos que levanto y lo más importante, como ajusto a la intensidad para poder recuperarme y entrenar de forma inteligente.  Hola chicas y chicos, bienvenidos a un nuevo vídeo del canal.',
		numStep: 16,
		denoise: true,
		guidanceScale: 3.0,
		speed: 1.0,
		preprocessPrompt: true,
		postprocessOutput: true
	});
	configSig = $derived(JSON.stringify(this.config));
	private generatedConfigSig = $state('');

	videoUrl = $state('');
	segment = $state('00:00-01:00');
	namePrefix = $state('jessica_martin');
	chunkCount = $state(1);
	imageSrc = $state('');
	addVoiceStatus = $state<'' | 'downloading' | 'transcribing' | 'chunking' | 'done' | 'error'>('');
	addVoiceMessage = $state('');
	addVoiceLoading = $state(false);
	private abortController: AbortController | null = null;

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
		this.isPaused = false;
	}

	releaseBlobs(): void {
		this.blobs = [];
	}

	async forceRegenerate(id: string): Promise<void> {
		this.releaseBlobs();
		this.generatedId = '';
		this.generatedConfigSig = '';
		await this.generateTTS(id);
	}

	async generateTTS(id: string): Promise<void> {
		if (this.isGenerating || this.textContents.length === 0) {
			return;
		}

		if (
			id === this.generatedId &&
			this.configSig === this.generatedConfigSig &&
			this.blobs.length > 0
		) {
			this.errorMessage = '';
			this.isPlaying = true;
			return;
		}

		this.releaseBlobs();
		this.durationSeconds = null;
		this.errorMessage = '';
		this.isPlaying = false;
		this.isGenerating = true;

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
				this.generatedId = id;
				this.generatedConfigSig = this.configSig;
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
		if (this.abortController) {
			this.abortController.abort();
			this.abortController = null;
		}
	}

	async startAddVoice(): Promise<void> {
		if (this.abortController) {
			this.abortController.abort();
			this.abortController = null;
		}

		this.addVoiceLoading = true;
		this.addVoiceStatus = '';
		this.addVoiceMessage = '';

		const controller = new AbortController();
		this.abortController = controller;

		try {
			const response = await addVoice(
				{
					url: this.videoUrl,
					segment: this.segment,
					name_prefix: this.namePrefix,
					chunk_count: this.chunkCount,
					image_src: this.imageSrc || undefined
				},
				controller.signal
			);

			for await (const { event, data } of parseSSE(response)) {
				viewState.subStatus = event;
			}
		} catch (err) {
			if (err instanceof DOMException && err.name === 'AbortError') {
				return;
			}
			console.error('[SSE] Error:', err);
		} finally {
			this.addVoiceLoading = false;
			this.abortController = null;
			viewState.subStatus = null;
		}
	}
}

export const ttsState = new TTSState();
