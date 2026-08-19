export type PodcastMode = 'interview' | 'smalltalk';

export type SegmentSource = 'questions' | 'content';

export type TurnRole = 'hook' | 'question' | 'answer' | 'casual' | 'initialHook' | 'finalHook';

export type HookSlot = 'initial' | 'final';

export interface PodcastHookConfig {
	enabled: boolean;
	prompts: { interview: string; smalltalk: string; guided: string };
}

export interface TurnPlan {
	role: TurnRole;
	speaker: 'A' | 'B';
	question?: string;
}

export interface Segment {
	topic: string;
	rawChunk: string;
	chunkData: string;
	questions: string[];
	interactionCount: number;
}

export interface PodcastPromptContext {
	topic: string;
	hookSummary: string;
	hostAName: string;
	hostBName: string;
	contextText: string;
}

export interface TurnPrompts {
	systemPrompt: string;
	userPrompt: string;
}

export interface TurnPromptBuildInput {
	plan: TurnPlan;
	segment: Segment;
	ctx: PodcastPromptContext;
	previousExchanges: DialogExchange[];
	questionIndex?: number;
}

export interface DialogExchange {
	speaker: 'A' | 'B';
	text: string;
	role?: TurnRole;
	direct?: boolean;
}
