import { viewState } from "./viewStore.svelte";

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
		refAudioFilename: "scarlet1.wav",
		refText:
			"any products that had any kind of oil in them and I think it wasnt I really was at that sort of breaking point of like this is something that i'm gonna have to deal for the rest of my life that I thought well",
		numStep: 16,
		denoise: true,
		guidanceScale: 2.0,
		speed: 1.0,
		preprocessPrompt: true,
		postprocessOutput: true,
	});
}

export const ttsState = new TTSState();