import { viewState } from "./viewStore.svelte";
import { addVoice } from "@/lib/utils/ttsService";

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
	activeId = $state<string | null>(null);

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
