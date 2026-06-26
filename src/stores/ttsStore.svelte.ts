import { viewState } from './viewStore.svelte';
import { addVoice, generateSpeech, parseSSE, type Voice } from '@/lib/utils/ttsService';
import { splitTextIntoChunks } from '@/lib/utils/splitText';

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
	randomChunk: boolean;
	splitLevel: 0 | 1 | 2 | 3;
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
	chunksGenerated = $state(0);
	totalChunks = $state(0);
	chunkNotifyVersion = $state(0);
	private _generationAbort: AbortController | null = null;
	private _allChunks: string[] = [];
	private _nextChunkIndex = 0;
	private _generationSession = 0;

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
		postprocessOutput: true,
		randomChunk: false,
		splitLevel: 0
	});
	configSig = $derived(JSON.stringify(this.config));
	private generatedConfigSig = $state('');

	voiceChunks = $state<Voice[]>([]);
	private _chunkRefs: Array<{ refAudioFilename: string; refText: string }> = [];

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

	setVoiceChunks(chunks: Voice[]): void {
		this.voiceChunks = chunks;
	}

	clearPlaylist(): void {
		this.isPlaying = false;
		this.isPaused = false;
	}

	releaseBlobs(): void {
		this.blobs = [];
		this._allChunks = [];
		this._nextChunkIndex = 0;
	}

	async forceRegenerate(id: string): Promise<void> {
		this.resetGenerationState(false);
		await this.generateTTS(id);
	}

	cancelGeneration(): void {
		if (this._generationAbort) {
			this._generationAbort.abort();
			this._generationAbort = null;
		}
		this._generationSession++;
		this.isGenerating = false;
		this._allChunks = [];
		this._nextChunkIndex = 0;
	}

	private resetGenerationState(clearTextContents = false): void {
		this.cancelGeneration();
		this.releaseBlobs();
		this.isPlaying = false;
		this.isPaused = false;
		this.errorMessage = '';
		this.durationSeconds = null;
		this.chunksGenerated = 0;
		this.totalChunks = 0;
		this.chunkNotifyVersion = 0;
		this.generatedId = '';
		this.generatedConfigSig = '';
		this._chunkRefs = [];
		if (clearTextContents) {
			this.textContents = [];
		}
	}

	fullReset(): void {
		this.resetGenerationState(true);
	}

	async generateTTS(id: string): Promise<void> {
		if (this.textContents.length === 0) {
			return;
		}

		if (
			id === this.generatedId &&
			this.configSig === this.generatedConfigSig &&
			this.blobs.length > 0 &&
			!this.isGenerating
		) {
			this.errorMessage = '';
			this.isPlaying = true;
			return;
		}

		this.resetGenerationState(false);

		const session = ++this._generationSession;

		const allChunks: string[] = [];
		for (const text of this.textContents) {
			allChunks.push(...splitTextIntoChunks(text, this.config.splitLevel));
		}

		if (allChunks.length === 0) return;

		this._chunkRefs = allChunks.map(() => {
			if (this.config.randomChunk && this.voiceChunks.length > 0) {
				const v = this.voiceChunks[Math.floor(Math.random() * this.voiceChunks.length)];
				console.log('CHUNK', v.audio_file);
				return { refAudioFilename: v.audio_file, refText: v.text_reference };
			}
			return {
				refAudioFilename: this.config.refAudioFilename,
				refText: this.config.refText
			};
		});

		this.totalChunks = allChunks.length;
		this.isGenerating = true;
		this._allChunks = allChunks;
		this._nextChunkIndex = 1;

		const abort = new AbortController();
		this._generationAbort = abort;

		try {
			const res = await generateSpeech(
				{
					text: allChunks[0],
					ref_audio: this._chunkRefs[0].refAudioFilename,
					ref_text: this._chunkRefs[0].refText,
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
				},
				abort.signal
			);

			if (this._generationSession !== session) {
				return;
			}

			if (res.blob.size === 0) {
				throw new Error('Generated audio is empty (0 bytes)');
			}

			this.blobs.push(res.blob);
			this.chunksGenerated = 1;
			this.chunkNotifyVersion++;
			this.generatedId = id;
			this.generatedConfigSig = this.configSig;
			this.isPlaying = true;
		} catch (err) {
			if (err instanceof DOMException && err.name === 'AbortError') {
				return;
			}
			if (this._generationSession !== session) {
				return;
			}
			this.errorMessage = err instanceof Error ? err.message : 'Failed to generate TTS audio';
			this.isGenerating = false;
			console.error('[TTS] Generation error:', err);
		} finally {
			if (this._generationAbort === abort) {
				this._generationAbort = null;
			}
		}
	}

	async generateNextChunk(): Promise<void> {
		if (this._nextChunkIndex >= this._allChunks.length || this._allChunks.length === 0) {
			this.isGenerating = false;
			return;
		}

		if (this._generationAbort !== null) {
			return;
		}

		const session = this._generationSession;
		const abort = new AbortController();
		this._generationAbort = abort;
		const i = this._nextChunkIndex;

		try {
			const res = await generateSpeech(
				{
					text: this._allChunks[i],
					ref_audio: this._chunkRefs[i]?.refAudioFilename ?? this.config.refAudioFilename,
					ref_text: this._chunkRefs[i]?.refText ?? this.config.refText,
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
				},
				abort.signal
			);

			if (this._generationSession !== session) {
				return;
			}

			if (res.blob.size === 0) {
				throw new Error('Generated audio is empty (0 bytes)');
			}

			this.blobs.push(res.blob);
			this.chunksGenerated = i + 1;
			this.chunkNotifyVersion++;
			this._nextChunkIndex = i + 1;
		} catch (err) {
			if (err instanceof DOMException && err.name === 'AbortError') {
				return;
			}
			if (this._generationSession !== session) {
				return;
			}
			this.errorMessage = err instanceof Error ? err.message : 'Failed to generate TTS audio';
			this.isGenerating = false;
			console.error('[TTS] Generation error:', err);
		} finally {
			if (this._generationAbort === abort) {
				this._generationAbort = null;
			}
			if (this._generationSession === session && this._nextChunkIndex >= this._allChunks.length) {
				this.isGenerating = false;
			}
		}
	}

	cleanup(): void {
		this.fullReset();
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

			for await (const { event } of parseSSE(response)) {
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
