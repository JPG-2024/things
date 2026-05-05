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
		| Array<
				| string
				| number[]
				| Array<number | string>
				| { prompt_string: string; multimodal_data?: string[] }
		  >;

	/** Optional system prompt to prepend to the prompt. */
	system_prompt?: string;

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
	prompt_progress?: {
		total: number;
		cache: number;
		processed: number;
		time_ms: number;
	};

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

function findSseSeparatorIndex(
	buffer: string
): { index: number; length: number } | null {
	const idx = buffer.search(/\r?\n\r?\n/);
	if (idx === -1) return null;
	const m = buffer.slice(idx).match(/^\r?\n\r?\n/);
	return { index: idx, length: m?.[0].length ?? 2 };
}

async function readSseJson(
	res: Response,
	onEvent: (json: any) => void,
	signal?: AbortSignal
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

		// Events separated by blank line (LF or CRLF)
		while (true) {
			const sep = findSseSeparatorIndex(buffer);
			if (!sep) break;

			const rawEvent = buffer.slice(0, sep.index);
			buffer = buffer.slice(sep.index + sep.length);

			const dataLines = extractSseDataLines(rawEvent);
			for (const data of dataLines) {
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

function promptToOpenAI(
	prompt: LlamaCompletionParams["prompt"],
	systemPrompt?: string
): OpenAICompletionPrompt {
	const sys = (systemPrompt ?? "").trim();
	const prefix = sys ? `${sys}\n` : "";

	const toSingleString = (p: any): string => {
		if (typeof p === "string") return p;
		if (Array.isArray(p) && p.every((x) => typeof x === "number"))
			return p.join(" "); // best-effort stringify
		if (Array.isArray(p))
			return p.map((x) => (typeof x === "string" ? x : String(x))).join("");
		if (p && typeof p === "object" && typeof p.prompt_string === "string")
			return p.prompt_string;
		return String(p ?? "");
	};

	// If system prompt exists, we always return string or string[] so we can prepend safely.
	if (Array.isArray(prompt)) {
		// token array vs array of prompts
		if (prompt.every((x) => typeof x === "number")) {
			const asStr = (prompt as number[]).join(" ");
			return prefix ? `${prefix}${asStr}` : asStr;
		}
		return (prompt as any[]).map((p) => `${prefix}${toSingleString(p)}`);
	}

	const s = toSingleString(prompt);
	return prefix ? `${prefix}${s}` : s;
}

function logitBiasToOpenAI(
	logit_bias: LlamaLogitBias | undefined
): Record<string, number> | undefined {
	if (!logit_bias) return undefined;

	// OpenAI expects: { "token_id_as_string": bias_number }
	if (Array.isArray(logit_bias)) {
		const out: Record<string, number> = {};
		for (const [tok, bias] of logit_bias) {
			if (bias === false) {
				out[String(tok)] = -100; // "ban" equivalent
			} else if (typeof bias === "number") {
				out[String(tok)] = bias;
			}
		}
		return out;
	}

	const out: Record<string, number> = {};
	for (const [tok, bias] of Object.entries(logit_bias)) {
		if (bias === false) out[String(tok)] = -100;
		else if (typeof bias === "number") out[String(tok)] = bias;
	}
	return out;
}

function finishReasonToStopType(
	r?: string | null
): LlamaCompletionResponse["stop_type"] {
	// OpenAI: "stop" | "length" | "content_filter" | null
	if (!r) return "none";
	if (r === "stop") return "word";
	if (r === "length") return "limit";
	return "none";
}

/**
 * OpenAI-compatible v1 /completions request/response (minimal fields used here).
 */
type OpenAICompletionPrompt = string | string[] | number[] | number[][];

interface OpenAICompletionRequest {
	model: string;
	prompt: OpenAICompletionPrompt;
	max_tokens?: number;
	temperature?: number;
	top_p?: number;
	stop?: string | string[];
	presence_penalty?: number;
	frequency_penalty?: number;
	logit_bias?: Record<string, number>;
	stream?: boolean;
	// allow llama-server extensions without fighting TS
	[k: string]: any;
}

interface OpenAICompletionChoice {
	text?: string;
	finish_reason?: string | null;
}

interface OpenAICompletionResponse {
	id?: string;
	model?: string;
	choices: OpenAICompletionChoice[];
	usage?: any;
	[k: string]: any;
}

interface OpenAICompletionChunk {
	id?: string;
	model?: string;
	choices: OpenAICompletionChoice[];
	[k: string]: any;
}

/**
 * Call llama-server OpenAI-compatible POST /v1/completions endpoint.
 *
 * @param baseUrl e.g. "http://localhost:8080"
 * @param params request payload (llama-style; mapped to OpenAI fields)
 * @param onToken optional callback invoked for each streamed token when stream=true
 * @param options optional fetch options (headers, signal, etc.)
 */
export async function completion(
	baseUrl: string = "http://localhost:8080",
	params: LlamaCompletionParams,
	onToken?: (tokenText: string, event: LlamaCompletionResponse) => void,
	options?: Omit<RequestInit, "method" | "body">
): Promise<LlamaCompletionResponse> {
	const url = joinUrl(baseUrl, "/v1/completions");

	const streamEnabled = params.stream === true || typeof onToken === "function";

	// llama-server typically requires `model` for OpenAI routes; allow caller to pass via (params as any).model
	const model = params.model ?? "default";

	const payload: OpenAICompletionRequest = {
		model,
		prompt: promptToOpenAI(params.prompt, params.system_prompt),
		max_tokens: params.n_predict,
		temperature: params.temperature,
		top_p: params.top_p,
		stop: params.stop,
		presence_penalty: params.presence_penalty,
		frequency_penalty: params.frequency_penalty,
		logit_bias: logitBiasToOpenAI(params.logit_bias),
		stream: streamEnabled,
		json_schema: params.json_schema,
		seed: params.seed,

		// optional pass-through for servers that accept it as an extension field
		system_prompt: params.system_prompt,
	};

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
		// try to surface OpenAI-style error.message if present
		try {
			const j = text ? JSON.parse(text) : null;
			const msg = j?.error?.message;
			if (msg)
				throw new Error(
					`llama-server /v1/completions failed: ${res.status} ${res.statusText} - ${msg}`
				);
		} catch {
			// ignore parse errors
		}
		throw new Error(
			`llama-server /v1/completions failed: ${res.status} ${res.statusText}${text ? ` - ${text}` : ""}`
		);
	}

	// Prepare the system prompt prefix that was included in the prompt
	const sysPrefixToRemove = params.system_prompt
		? `${params.system_prompt.trim()}\n`
		: "";

	if (!streamEnabled) {
		const j = (await res.json()) as OpenAICompletionResponse;
		const choice0 = j.choices?.[0];
		let text = choice0?.text ?? "";

		// Remove system prompt if it was prepended to the response
		if (sysPrefixToRemove && text.startsWith(sysPrefixToRemove)) {
			text = text.slice(sysPrefixToRemove.length);
		}

		return {
			content: text,
			model: j.model,
			stop: Boolean(choice0?.finish_reason),
			stop_type: finishReasonToStopType(choice0?.finish_reason),
			// keep original raw for callers that relied on extra fields
			choices: j.choices,
			usage: j.usage,
		} as any;
	}

	let aggregated = "";
	let lastChunk: OpenAICompletionChunk | null = null;

	await readSseJson(
		res,
		(evt) => {
			const chunk = evt as OpenAICompletionChunk;
			lastChunk = chunk;

			const t = chunk.choices?.[0]?.text ?? "";
			if (t) {
				aggregated += t;
				onToken?.(t, { content: t } as any);
			}
		},
		options?.signal
	);

	// Remove system prompt from aggregated response if it was prepended
	let finalContent = aggregated;
	if (sysPrefixToRemove && finalContent.startsWith(sysPrefixToRemove)) {
		finalContent = finalContent.slice(sysPrefixToRemove.length);
	}

	const finishReason = lastChunk?.choices?.[0]?.finish_reason ?? null;

	return {
		content: finalContent,
		model: lastChunk?.model ?? model,
		stop: Boolean(finishReason),
		stop_type: finishReasonToStopType(finishReason),
		choices: lastChunk?.choices,
	} as any;
}
