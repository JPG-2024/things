export type PlayerMode = 'full' | 'mini';

export const DEFAULT_PLAYER_MODE: PlayerMode = 'full';

export type GeneratingWaveStyle =
	| 'softSingleDim'
	| 'organicMultiDim'
	| 'softSingleBright'
	| 'organicMultiBright';

export interface Harmonic {
	cycles: number;
	amplitudeRatio: number;
	speedRatio: number;
}

export interface WaveStyleConfig {
	name: GeneratingWaveStyle;
	harmonics: Harmonic[];
	amplitude: number;
	baseSpeed: number;
	pointCount: number;
	strokeAlpha: number;
}

export const WAVE_STYLES: Record<GeneratingWaveStyle, WaveStyleConfig> = {
	softSingleDim: {
		name: 'softSingleDim',
		harmonics: [{ cycles: 1.5, amplitudeRatio: 1.0, speedRatio: 1.0 }],
		amplitude: 0.18,
		baseSpeed: 0.6,
		pointCount: 80,
		strokeAlpha: 1
	},
	organicMultiDim: {
		name: 'organicMultiDim',
		harmonics: [
			{ cycles: 1.5, amplitudeRatio: 0.6, speedRatio: 1.0 },
			{ cycles: 2.55, amplitudeRatio: 0.3, speedRatio: 1.3 }
		],
		amplitude: 0.2,
		baseSpeed: 0.6,
		pointCount: 80,
		strokeAlpha: 1
	},
	softSingleBright: {
		name: 'softSingleBright',
		harmonics: [{ cycles: 1.5, amplitudeRatio: 1.0, speedRatio: 1.0 }],
		amplitude: 0.18,
		baseSpeed: 0.6,
		pointCount: 80,
		strokeAlpha: 1.0
	},
	organicMultiBright: {
		name: 'organicMultiBright',
		harmonics: [
			{ cycles: 1.5, amplitudeRatio: 0.35, speedRatio: 1.0 },
			{ cycles: 2.55, amplitudeRatio: 0.1, speedRatio: 1.3 }
		],
		amplitude: 0.18,
		baseSpeed: 0.6,
		pointCount: 80,
		strokeAlpha: 1.0
	}
};

let currentStyleName: GeneratingWaveStyle = 'organicMultiBright';

export function getCurrentStyleName(): GeneratingWaveStyle {
	return currentStyleName;
}

export function getCurrentStyle(): WaveStyleConfig {
	return WAVE_STYLES[currentStyleName];
}

export function setCurrentStyle(name: GeneratingWaveStyle): void {
	currentStyleName = name;
}
