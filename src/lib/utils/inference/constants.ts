export const DEFAULT_DYNAMIC_MODEL = 'llama-server';

// Analysis output feeds the category comparison (`title + summary`). Run it
// greedily so a re-run reproduces the same summary instead of drifting and
// quietly changing which category the same article lands in.
export const ANALYSIS_COMPLETION_OPTIONS = {
	temperature: 0,
	top_p: 1,
	top_k: 1,
	min_p: 0,
	presence_penalty: 0,
	repetition_penalty: 1,
	n_predict: 2048,
	stream: false
} as const;

export const DEFAULT_TITLE_COMPLETION_OPTIONS = {
	temperature: 0.1,
	top_p: 0.9,
	frequency_penalty: 0.4,
	presence_penalty: 0.2,
	reasoning_effort: 'none'
} satisfies Record<string, unknown>;

export const EMBEDDING_MODEL = 'bge-m3';
