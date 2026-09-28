export type HookSlot = 'initial' | 'final';

export type SpeakerDynamics = 'alternate' | 'free';

export interface HostPersona {
	personality: string;
	humorStyle: string;
	catchphrases: string;
	speechQuirks: string;
}

export interface PodcastHookConfig {
	enabled: boolean;
	prompt: string;
}

export interface DialogExchange {
	speaker: 'A' | 'B';
	text: string;
}
