/* eslint-disable @typescript-eslint/no-explicit-any */
import OpenAI from 'openai';
import type { Completion, CompletionCreateParams } from 'openai/resources/completions';

/**
 * Llama-server specific fields that extend OpenAI's CompletionCreateParams.
 * These are sent via extra_body when using the OpenAI TypeScript library.
 */
export interface LlamaExtraBody {
	/** System prompt to prepend to the prompt. */
	system_prompt?: string;

	// === Token Prediction & Context ===
	/** Minimum line indentation (whitespace chars) for generation. */
	n_indent?: number;
	/** Tokens from prompt to keep when context is exceeded (-1 keeps all). */
	n_keep?: number;
	/** Number of completions to generate per prompt. */
	n_cmpl?: number;
	/** Ignore EOS and continue generating. */
	ignore_eos?: boolean;

	// === Advanced Sampling ===
	/** Top-k sampling (0 disables). */
	top_k?: number;
	/** Min-p sampling (0 disables). */
	min_p?: number;
	/** Locally typical sampling parameter (1 disables). */
	typical_p?: number;
	/** Dynamic temperature range (0 disables). Final temp in [t-d; t+d]. */
	dynatemp_range?: number;
	/** Dynamic temperature exponent. */
	dynatemp_exponent?: number;

	// === Repetition Penalties ===
	/** Consider last N tokens for repetition penalty (0 disables; -1 = ctx size). */
	repeat_last_n?: number;
	/** Repetition penalty (1 disables). */
	repeat_penalty?: number;

	// === DRY (Don't Repeat Yourself) Sampling ===
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

	// === XTC Sampling ===
	/** XTC token removal probability (0 disables). */
	xtc_probability?: number;
	/** XTC probability threshold (>0.5 disables XTC). */
	xtc_threshold?: number;

	// === Mirostat ===
	/** Mirostat mode (0 off, 1, 2). */
	mirostat?: 0 | 1 | 2;
	/** Mirostat target entropy (tau). */
	mirostat_tau?: number;
	/** Mirostat learning rate (eta). */
	mirostat_eta?: number;

	// === Grammar-Based Sampling ===
	/** Grammar string for grammar-based sampling. */
	grammar?: string;
	/** JSON schema for grammar-based sampling. */
	json_schema?: any;

	// === Probability/Token Return ===
	/** If >0, return top-N token probabilities for each generated token. */
	n_probs?: number;
	/** Force samplers to return at least N tokens. */
	min_keep?: number;
	/** Return token ids in `tokens` field (otherwise empty). */
	return_tokens?: boolean;
	/** Return probabilities after applying sampling chain. */
	post_sampling_probs?: boolean;

	// === Cache & Slot Control ===
	/** Enable KV reuse by shifting if possible (server default: true). */
	cache_prompt?: boolean;
	/** Min chunk size to attempt reusing from cache via KV shifting (0 disables). */
	n_cache_reuse?: number;
	/** Assign request to specific slot (-1 auto). */
	id_slot?: number;

	// === Timing & Progress ===
	/** Time limit (ms) for generation phase (0 disables). */
	t_max_predict_ms?: number;
	/** Include prompt+gen speed per token in response. */
	timings_per_token?: boolean;
	/** In stream mode: include prompt processing progress in `prompt_progress`. */
	return_progress?: boolean;

	// === Advanced Configuration ===
	/** Sampling chain order (array of sampler names). */
	samplers?: string[];
	/** Select response fields (paths) to include. */
	response_fields?: string[];
	/** Per-request LoRA configuration. */
	lora?: Array<{ id: number; scale: number }>;
}

/**
 * Extended completion response that includes llama-server specific fields.
 */
export interface CompletionResponse extends Completion {
	/** Llama-server specific timing information. */
	timings?: Record<string, any>;
	/** Llama-server specific cached tokens info. */
	tokens_cached?: number;
	tokens_evaluated?: number;
	truncated?: boolean;
	/** Token probabilities if requested. */
	probs?: any;
	/** Prompt processing progress in stream mode. */
	prompt_progress?: {
		total: number;
		cache: number;
		processed: number;
		time_ms: number;
	};
}

const DEFAULT_BASE_URL = 'http://localhost:8080/v1';

/**
 * Create an OpenAI client configured for llama-server.
 */
function createClient(baseUrl?: string): OpenAI {
	return new OpenAI({
		baseURL: baseUrl || DEFAULT_BASE_URL,
		apiKey: 'not-needed',
		dangerouslyAllowBrowser: true
	});
}

/**
 * Split OpenAI CompletionCreateParams and llama-specific extra fields.
 */
function splitParams(params: CompletionCreateParams & Partial<LlamaExtraBody>): {
	openaiParams: Partial<CompletionCreateParams>;
	extraBody: LlamaExtraBody;
} {
	// Standard OpenAI fields
	const openaiParams: Partial<CompletionCreateParams> = {
		model: params.model,
		prompt: params.prompt,
		max_tokens: params.max_tokens,
		temperature: params.temperature,
		top_p: params.top_p,
		frequency_penalty: params.frequency_penalty,
		presence_penalty: params.presence_penalty,
		stop: params.stop,
		seed: params.seed,
		logit_bias: params.logit_bias,
		echo: params.echo,
		n: params.n,
		suffix: params.suffix,
		user: params.user
	};

	// Remove undefined values
	Object.keys(openaiParams).forEach((key) => {
		if (openaiParams[key as keyof typeof openaiParams] === undefined) {
			delete openaiParams[key as keyof typeof openaiParams];
		}
	});

	// Llama-server specific fields
	const extraBody: LlamaExtraBody = {
		system_prompt: params.system_prompt,
		n_indent: params.n_indent,
		n_keep: params.n_keep,
		n_cmpl: params.n_cmpl,
		ignore_eos: params.ignore_eos,
		top_k: params.top_k,
		min_p: params.min_p,
		typical_p: params.typical_p,
		dynatemp_range: params.dynatemp_range,
		dynatemp_exponent: params.dynatemp_exponent,
		repeat_last_n: params.repeat_last_n,
		repeat_penalty: params.repeat_penalty,
		dry_multiplier: params.dry_multiplier,
		dry_base: params.dry_base,
		dry_allowed_length: params.dry_allowed_length,
		dry_penalty_last_n: params.dry_penalty_last_n,
		dry_sequence_breakers: params.dry_sequence_breakers,
		xtc_probability: params.xtc_probability,
		xtc_threshold: params.xtc_threshold,
		mirostat: params.mirostat,
		mirostat_tau: params.mirostat_tau,
		mirostat_eta: params.mirostat_eta,
		grammar: params.grammar,
		json_schema: params.json_schema,
		n_probs: params.n_probs,
		min_keep: params.min_keep,
		return_tokens: params.return_tokens,
		post_sampling_probs: params.post_sampling_probs,
		cache_prompt: params.cache_prompt,
		n_cache_reuse: params.n_cache_reuse,
		id_slot: params.id_slot,
		t_max_predict_ms: params.t_max_predict_ms,
		timings_per_token: params.timings_per_token,
		return_progress: params.return_progress,
		samplers: params.samplers,
		response_fields: params.response_fields,
		lora: params.lora as any
	};

	// Remove undefined values from extraBody
	Object.keys(extraBody).forEach((key) => {
		if (extraBody[key as keyof LlamaExtraBody] === undefined) {
			delete extraBody[key as keyof LlamaExtraBody];
		}
	});

	return { openaiParams, extraBody };
}

export interface CompletionOptions {
	/** AbortSignal for request cancellation. */
	signal?: AbortSignal;
	/** Additional headers to send with the request. */
	headers?: Record<string, string>;
}

/**
 * Call llama-server using OpenAI TypeScript library with native CompletionCreateParams.
 *
 * @param params OpenAI CompletionCreateParams plus llama-server extensions
 * @param baseUrl e.g. "http://localhost:8080/v1"
 * @param onToken optional callback invoked for each streamed token when stream=true
 * @param options optional configuration (signal, headers)
 */
export async function completion(
	params: CompletionCreateParams & Partial<LlamaExtraBody>,
	baseUrl: string = DEFAULT_BASE_URL,
	onToken?: (tokenText: string) => void,
	options?: CompletionOptions
): Promise<CompletionResponse> {
	const client = createClient(baseUrl);
	const streamEnabled = params.stream === true || typeof onToken === 'function';

	const { openaiParams, extraBody } = splitParams(params);

	console.log('Completion called with params:', { openaiParams, extraBody });

	if (!streamEnabled) {
		const response = (await client.completions.create(
			{
				...openaiParams,
				stream: false,
				...extraBody
			} as any,
			{
				signal: options?.signal,
				headers: options?.headers
			}
		)) as CompletionResponse;

		return response;
	}

	// Streaming mode
	const stream = await client.completions.create(
		{
			...openaiParams,
			stream: true,
			...extraBody
		} as CompletionCreateParams & { stream: true } & LlamaExtraBody,
		{
			signal: options?.signal,
			headers: options?.headers
		}
	);

	let aggregated = '';
	let lastChunk: CompletionResponse | null = null;

	for await (const chunk of stream as AsyncIterable<CompletionResponse>) {
		if (options?.signal?.aborted) break;
		// console.log('Received chunk:', chunk);
		const text = chunk.content ?? '';
		if (text) {
			aggregated += text;
			onToken?.(text);
		}

		lastChunk = chunk;
	}

	return {
		id: lastChunk?.id ?? '',
		object: 'text_completion',
		created: lastChunk?.created ?? Math.floor(Date.now() / 1000),
		model: lastChunk?.model ?? openaiParams.model ?? '',
		choices: [
			{
				text: aggregated,
				index: 0,
				finish_reason: lastChunk?.choices?.[0]?.finish_reason ?? null,
				logprobs: null
			}
		],
		usage: lastChunk?.usage
	} as CompletionResponse;
}
