/* eslint-disable @typescript-eslint/no-explicit-any */

export type LlamaLogitBias =
	| Array<[number | string, number | false]>
	| Record<string, number | false>;

export interface LlamaLoraSpec {
	/** LoRA adapter id (from GET /lora-adapters). */
	id: number;
	/** LoRA scale to apply for this request. */
	scale: number;
}

/**
 * POST /completion request payload (llama.cpp non-OAI endpoint).
 * Notes:
 * - `prompt` supports multiple shapes (string, tokens, mixed, multimodal object, arrays of those).
 * - When `stream: true`, the server uses SSE; each event JSON includes `content` (next token text).
 */
export interface LlamaCompletionParams {
	/** Prompt to complete (string | tokens | mixed | multimodal object | array of prompts). */
	prompt:
		| string
		| number[]
		| Array<number | string>
		| { prompt_string: string; multimodal_data?: string[] }
		| Array<string | number[] | Array<number | string> | { prompt_string: string; multimodal_data?: string[] }>;

	/** Sampling temperature (default server-side: 0.8). */
	temperature?: number;

	/** Dynamic temperature range (0 disables). Final temp in [t-d; t+d]. */
	dynatemp_range?: number;

	/** Dynamic temperature exponent. */
	dynatemp_exponent?: number;

	/** Top-k sampling (0 disables). */
	top_k?: number;

	/** Top-p nucleus sampling (1 disables). */
	top_p?: number;

	/** Min-p sampling (0 disables). */
	min_p?: number;

	/** Locally typical sampling parameter (1 disables). */
	typical_p?: number;

	/** RNG seed (-1/random supported by server; server may map to uint32). */
	seed?: number;

	/** Ignore EOS and continue generating. */
	ignore_eos?: boolean;

	/** Max tokens to predict (-1 = infinity). */
	n_predict?: number;

	/** Minimum line indentation (whitespace chars) for generation. */
	n_indent?: number;

	/** Tokens from prompt to keep when context is exceeded (-1 keeps all). */
	n_keep?: number;

	/** Number of completions to generate per prompt. */
	n_cmpl?: number;

	/** Stop strings (not included in output). */
	stop?: string[];

	/** Consider last N tokens for repetition penalty (0 disables; -1 = ctx size). */
	repeat_last_n?: number;

	/** Repetition penalty (1 disables). */
	repeat_penalty?: number;

	/** Presence penalty (0 disables). */
	presence_penalty?: number;

	/** Frequency penalty (0 disables). */
	frequency_penalty?: number;

	/** DRY sampling multiplier (0 disables). */
	dry_multiplier?: number;

	/** DRY sampling base value. */
	dry_base?: number;

	/** DRY allowed repetition length before penalties apply. */
	dry_allowed_length?: number;

	/** DRY scan window (0 disables; -1 = context size). */
	dry_penalty_last_n?: number;

	/** DRY sequence breakers (strings). */
	dry_sequence_breakers?: string[];

	/** XTC token removal probability (0 disables). */
	xtc_probability?: number;

	/** XTC probability threshold (>0.5 disables XTC). */
	xtc_threshold?: number;

	/** Mirostat mode (0 off, 1, 2). */
	mirostat?: 0 | 1 | 2;

	/** Mirostat target entropy (tau). */
	mirostat_tau?: number;

	/** Mirostat learning rate (eta). */
	mirostat_eta?: number;

	/** Grammar string for grammar-based sampling. */
	grammar?: string;

	/** JSON schema for grammar-based sampling. */
	json_schema?: any;

	/** Logit bias configuration (array or OpenAI-style object). */
	logit_bias?: LlamaLogitBias;

	/** If >0, return top-N token probabilities for each generated token. */
	n_probs?: number;

	/** Force samplers to return at least N tokens. */
	min_keep?: number;

	/** Time limit (ms) for generation phase (0 disables). */
	t_max_predict_ms?: number;

	/** Assign request to specific slot (-1 auto). */
	id_slot?: number;

	/** Enable KV reuse by shifting if possible (server default: true). */
	cache_prompt?: boolean;

	/** Min chunk size to attempt reusing from cache via KV shifting (0 disables). */
	n_cache_reuse?: number;

	/** Return token ids in `tokens` field (otherwise empty). */
	return_tokens?: boolean;

	/** Stream tokens via SSE. */
	stream?: boolean;

	/**
	 * Sampling chain order (array of sampler names).
	 * If set, overrides server defaults.
	 */
	samplers?: string[];

	/** Include prompt+gen speed per token in response. */
	timings_per_token?: boolean;

	/** In stream mode: include prompt processing progress in `prompt_progress`. */
	return_progress?: boolean;

	/** Return probabilities after applying sampling chain (uses prob/top_probs instead of logprob/top_logprobs). */
	post_sampling_probs?: boolean;

	/**
	 * Select response fields (paths) to include; supports unnesting via `/`.
	 * Example: ["content", "generation_settings/n_predict"].
	 */
	response_fields?: string[];

	/** Per-request LoRA configuration (disables batching across different LoRA configs). */
	lora?: LlamaLoraSpec[];
}

export interface LlamaCompletionResponse {
	/** Generated text (in stream mode: next token text per event). */
	content: string;
	/** Generated token ids (only if return_tokens or stream is true). */
	tokens?: number[];
	/** Stream mode stop flag (true when finished). */
	stop?: boolean;

	/** Model alias/id. */
	model?: string;

	/** Processed prompt (special tokens may be added). */
	prompt?: any;

	/** Why generation stopped: none|eos|limit|word. */
	stop_type?: "none" | "eos" | "limit" | "word";
	/** Stopping word encountered (if stop_type=word). */
	stopping_word?: string;

	/** Generation settings echoed back by server (may be normalized). */
	generation_settings?: Record<string, any>;

	/** Timing/perf information. */
	timings?: Record<string, any>;

	/** KV reuse info. */
	tokens_cached?: number;
	tokens_evaluated?: number;
	truncated?: boolean;

	/** Token probabilities, if requested. */
	probs?: any;

	/** Present when return_progress=true in stream mode. */
	prompt_progress?: { total: number; cache: number; processed: number; time_ms: number };

	/** Any other server fields. */
	[k: string]: any;
}

function joinUrl(baseUrl: string, path: string): string {
	return `${baseUrl.replace(/\/+$/, "")}${path.startsWith("/") ? "" : "/"}${path}`;
}

function extractSseDataLines(eventBlock: string): string[] {
	// SSE event is blocks separated by blank line; we only consume `data:` lines.
	return eventBlock
		.split(/\r?\n/)
		.map((l) => l.trimEnd())
		.filter((l) => l.startsWith("data:"))
		.map((l) => l.slice("data:".length).trimStart())
		.filter(Boolean);
}

async function readSseJson(
	res: Response,
	onEvent: (json: any) => void,
	signal?: AbortSignal,
): Promise<void> {
	if (!res.body) return;

	const reader = res.body.getReader();
	const decoder = new TextDecoder("utf-8");
	let buffer = "";

	while (true) {
		if (signal?.aborted) {
			try {
				await reader.cancel();
			} catch {
				// ignore
			}
			return;
		}

		const { value, done } = await reader.read();
		if (done) break;

		buffer += decoder.decode(value, { stream: true });

		// Events separated by blank line
		let sepIndex: number;
		while ((sepIndex = buffer.indexOf("\n\n")) !== -1) {
			const rawEvent = buffer.slice(0, sepIndex);
			buffer = buffer.slice(sepIndex + 2);

			const dataLines = extractSseDataLines(rawEvent);
			for (const data of dataLines) {
				// Some servers send [DONE] (OAI style); llama.cpp /completion typically sends JSON only.
				if (data === "[DONE]") continue;
				onEvent(JSON.parse(data));
			}
		}
	}

	// Flush any trailing complete event (rare, but handle if ends without \n\n)
	const trailing = buffer.trim();
	if (trailing) {
		const dataLines = extractSseDataLines(trailing);
		for (const data of dataLines) {
			if (data === "[DONE]") continue;
			onEvent(JSON.parse(data));
		}
	}
}

/**
 * Call llama.cpp server POST /completion (non-OAI endpoint).
 *
 * @param baseUrl e.g. "http://localhost:8080"
 * @param params request payload
 * @param onToken optional callback invoked for each streamed token when stream=true
 * @param options optional fetch options (headers, signal, etc.)
 */
export async function completion(
	baseUrl: string = "http://localhost:8080",
	params: LlamaCompletionParams,
	onToken?: (tokenText: string, event: LlamaCompletionResponse) => void,
	options?: Omit<RequestInit, "method" | "body">,
): Promise<LlamaCompletionResponse> {
	const url = joinUrl(baseUrl, "/completion");

	const streamEnabled = params.stream === true || typeof onToken === "function";
	const payload: LlamaCompletionParams = { ...params, stream: streamEnabled };

	const res = await fetch(url, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			...(options?.headers ?? {}),
		},
		body: JSON.stringify(payload),
		...options,
	});

	if (!res.ok) {
		const text = await res.text().catch(() => "");
		throw new Error(`llama.cpp /completion failed: ${res.status} ${res.statusText}${text ? ` - ${text}` : ""}`);
	}

	if (!streamEnabled) {
		return (await res.json()) as LlamaCompletionResponse;
	}

	let aggregated = "";
	let lastEvent: LlamaCompletionResponse = { content: "" };

	await readSseJson(
		res,
		(evt) => {
			const e = evt as LlamaCompletionResponse;
			lastEvent = e;
			if (typeof e.content === "string" && e.content.length) {
				aggregated += e.content;
				onToken?.(e.content, e);
			}
		},
		options?.signal,
	);

	return {
		...lastEvent,
		// normalize to full text for convenience
		content: aggregated,
	};
}
