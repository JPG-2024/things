export type SynthParams = {
	numStep: number;
	guidanceScale: number;
	speed: number;
	splitLevel: 0 | 1 | 2 | 3;
};

export type PauseSettings = {
	minGapMs: number;
	maxGapMs: number;
	betweenParagraphs: number;
};

export type WheelSelection = {
	profileId: string;
	audioFile: string;
	randomChunk: boolean;
	synthParams: SynthParams;
	pauseSettings: PauseSettings;
};
