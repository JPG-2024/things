export const DEFAULT_DYNAMIC_MODEL = 'llama-server';

export const DEFAULT_EMOJI_COMPLETION_OPTIONS = {
	temperature: 0.1,
	top_p: 0.9,
	max_tokens: 5,
	frequency_penalty: 0,
	presence_penalty: 0,
	stop: ['\n'],
	seed: 42
} satisfies Record<string, unknown>;

export const DEFAULT_CATEGORY_DESCRIPTION_COMPLETION_OPTIONS = {
	temperature: 0.2,
	top_p: 0.9,
	max_tokens: 64,
	frequency_penalty: 0,
	presence_penalty: 0,
	stop: ['\n', '. ']
} satisfies Record<string, unknown>;

export const SUMMARY_COMPLETION_OPTIONS = {
	temperature: 0.2,
	top_k: 40,
	min_p: 0.05,
	presence_penalty: 0,
	n_predict: 1500,
	stream: true
} as const;

export const DEFAULT_STRUCTURED_OUTPUT_OPTIONS = {
	temperature: 0.1,
	top_k: 40,
	min_p: 0.1,
	presence_penalty: 0,
	n_predict: 256,
	stream: false
} as const;

export const DEFAULT_IA_COMPLETION_OPTIONS = {
	temperature: 0.7,
	top_p: 0.8,
	top_k: 20,
	min_p: 0.0,
	presence_penalty: 1.5,
	repetition_penalty: 1.0,
	stream: false
} as const;

export const DEFAULT_TITLE_COMPLETION_OPTIONS = {
	temperature: 0.7,
	top_p: 0.9,
	max_tokens: 100,
	frequency_penalty: 0.4,
	presence_penalty: 0.2,
	stop: ['\n', '. ']
} satisfies Record<string, unknown>;

export const DEFAULT_WEB_COMPLETION_OPTIONS = {
	model: 'llama-server',
	temperature: 0.7,
	top_p: 0.8,
	top_k: 20,
	min_p: 0.0,
	presence_penalty: 1.5,
	repetition_penalty: 1.0,
	stream: true
} as const;

export const DEFAULT_YOUTUBE_COMPLETION_OPTIONS = {
	model: 'llama-server',
	temperature: 0.8,
	min_p: 0.0,
	presence_penalty: 1.5,
	repetition_penalty: 1.0,
	stream: true
} as const;

export const DEFAULT_RAW_COMPLETION_OPTIONS = {
	model: 'llama-server',
	temperature: 0.7,
	top_p: 0.8,
	top_k: 20,
	min_p: 0.0,
	presence_penalty: 1.5,
	repetition_penalty: 1.0,
	stream: true
} as const;

export const YOUTUBE_STRUCTURED_OUTPUT_OPTIONS = {
	temperature: 0,
	top_p: 0.9,
	top_k: 1,
	presence_penalty: 0,
	stream: false
} as const;

export const EMBEDDING_MODEL = 'bge-m3';
