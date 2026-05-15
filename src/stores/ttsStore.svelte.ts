import { viewState } from "./viewStore.svelte";
import { addVoice, generateSpeech } from "@/lib/utils/ttsService";

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
	errorMessage = $state("");
	audioSrc = $state<string | null>(null);
	durationSeconds = $state<number | null>(null);

	textContents = $state<string[]>([]);
	playlist = $state<string[]>([]);
	currentIndex = $state(0);
	isGenerating = $state(false);

	language = $derived(viewState.language);
	config = $state<TTSConfig>({
		refAudioFilename: "",
		refText: "",
		numStep: 16,
		denoise: true,
		guidanceScale: 1.0,
		speed: 1.0,
		preprocessPrompt: true,
		postprocessOutput: true,
	});

	videoUrl = $state("");
	segment = $state("00:00-01:00");
	namePrefix = $state("chunk");
	chunkCount = $state(5);
	addVoiceStatus = $state<
		"" | "downloading" | "transcribing" | "chunking" | "done" | "error"
	>("");
	addVoiceMessage = $state("");
	addVoiceLoading = $state(false);

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
		this.playlist = [];
		this.currentIndex = 0;
	}

	async generateTTS(): Promise<void> {
		if (this.isGenerating || this.textContents.length === 0) {
			return;
		}

		this.isGenerating = true;
		this.errorMessage = "";
		this.playlist = [];
		this.currentIndex = 0;


		
		try {
			for (const text of this.textContents) {

				const res = await generateSpeech({
					text,
					lang: this.language,
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
					audio_chunk_threshold: this.config.audioChunkThreshold,
				});

				if (res.blob.size === 0) {
					throw new Error("Generated audio is empty (0 bytes)");
				}

				const url = URL.createObjectURL(res.blob);
				this.playlist = [...this.playlist, url];
			}

			if (this.playlist.length > 0) {
				this.audioSrc = this.playlist[0];
				this.isPlaying = true;
				this.durationSeconds = null;
			}
		} catch (err) {
			this.errorMessage =
				err instanceof Error ? err.message : "Failed to generate TTS audio";
			console.error("[TTS] Generation error:", err);
		} finally {
			this.isGenerating = false;
		}
	}

	nextTrack(): void {
		if (this.currentIndex < this.playlist.length - 1) {
			this.currentIndex++;
			this.audioSrc = this.playlist[this.currentIndex];
		}
	}

	previousTrack(): void {
		if (this.currentIndex > 0) {
			this.currentIndex--;
			this.audioSrc = this.playlist[this.currentIndex];
		}
	}

	async startAddVoice(): Promise<void> {
		this.addVoiceLoading = true;
		this.addVoiceStatus = "";
		this.addVoiceMessage = "";
		try {
			const { taskId, source } = await addVoice({
				url: this.videoUrl,
				segment: this.segment,
				name_prefix: this.namePrefix,
				chunk_count: this.chunkCount,
			});

			console.log(source);

			await new Promise<void>((resolve) => {
				source.onmessage = (e) => {
					const data = JSON.parse(e.data);
					const eventName = e.type || data.status;
					this.addVoiceStatus = eventName;
					if (eventName === "chunking") {
						this.addVoiceMessage = `Processing chunk ${data.current} of ${data.total}`;
					} else {
						this.addVoiceMessage = data.message ?? eventName;
					}
					if (eventName === "done" || eventName === "error") {
						source.close();
						this.addVoiceLoading = false;
						resolve();
					}
				};
				source.onerror = () => {
					source.close();
					this.addVoiceLoading = false;
					this.addVoiceStatus = "error";
					this.addVoiceMessage = "Connection lost";
					resolve();
				};
			});
		} catch (err) {
			this.addVoiceLoading = false;
			this.addVoiceStatus = "error";
			this.addVoiceMessage =
				err instanceof Error ? err.message : "Failed to start";
		}
	}
}

export const ttsState = new TTSState();
