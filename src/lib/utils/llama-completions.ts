/* eslint-disable @typescript-eslint/no-explicit-any */

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export interface JsonObject {
	[key: string]: JsonValue;
}

export type LlamaResponseFormat =
	| { type: "text" }
	| { type: "json_object" }
	| {
			type: "json_schema";
			json_schema: {
				name: string;
				description?: string;
				schema?: JsonObject;
				strict?: boolean;
			};
	  };

export type LlamaToolChoice =
	| "none"
	| "auto"
	| "required"
	| {
			type: "function";
			function: {
				name: string;
			};
	  };

export interface LlamaTool {
	type: "function";
	function: {
		name: string;
		description?: string;
		parameters?: JsonObject;
		strict?: boolean;
	};
}

export type LlamaChatMessageContentPart =
	| {
			type: "text";
			text: string;
	  }
	| {
			type: "image_url";
			image_url: {
				url: string;
				detail?: "auto" | "low" | "high";
			};
	  }
	| {
			type: "input_text";
			text: string;
	  }
	| {
			type: "input_image";
			image_url?: string;
			image_base64?: string;
	  };

export interface LlamaChatToolCall {
	id?: string | null;
	type?: "function";
	index?: number;
	function: {
		name: string;
		arguments: string;
	};
}

export interface LlamaChatMessage {
	role: "system" | "user" | "assistant" | "tool";
	content?: string | LlamaChatMessageContentPart[] | null;
	name?: string;
	tool_call_id?: string;
	tool_calls?: LlamaChatToolCall[];
	function_call?: {
		name: string;
		arguments: string;
	};
	reasoning_content?: string; // <- add
}

export interface LlamaChatCompletionsRequest {
	model: string; // Model identifier to run the completion with.
	messages: LlamaChatMessage[]; // Conversation history sent to the model.

	tools?: LlamaTool[]; // Tool definitions the model may call.
	tool_choice?: LlamaToolChoice; // Strategy for whether the model should call tools.
	parallel_tool_calls?: boolean; // Allows multiple tool calls in the same turn.

	stream?: boolean; // Enables streaming partial tokens/events.
	stream_options?: LlamaStreamOptions; // Extra settings for streamed responses.

	response_format?: LlamaResponseFormat; // Constrains the shape of the model output.

	temperature?: number; // Controls randomness of token sampling.
	top_p?: number; // Uses nucleus sampling instead of full distribution.
	n?: number; // Number of completion choices to generate.
	stop?: string | string[]; // One or more sequences that stop generation.
	max_tokens?: number; // Legacy cap for generated tokens.
	max_completion_tokens?: number; // Maximum number of tokens the model may generate.
	presence_penalty?: number; // Penalizes introducing already-seen concepts less or more.
	frequency_penalty?: number; // Penalizes repeated token usage.
	logit_bias?: Record<string, number>; // Adjusts token selection probabilities.
	user?: string; // End-user identifier for tracing or abuse monitoring.
	seed?: number; // Seed for more repeatable sampling.

	// DashScope / compatible-mode options
	enable_thinking?: boolean; // Includes reasoning output when supported.
	enable_search?: boolean; // Allows the model to use search when supported.

	// llama-server extensions frequently accepted by OAI route
	top_k?: number; // Limits sampling to the top-k most likely tokens.
	min_p?: number; // Filters out tokens below the minimum probability threshold.
	typical_p?: number; // Enables typical sampling based on token surprise.
	repeat_penalty?: number; // Penalizes recently repeated tokens.
	repeat_last_n?: number; // Number of recent tokens considered for repetition penalty.
	mirostat?: 0 | 1 | 2; // Selects the Mirostat sampling mode.
	mirostat_tau?: number; // Target entropy used by Mirostat.
	mirostat_eta?: number; // Learning rate used by Mirostat.
	grammar?: string; // Grammar constraint applied to generation.
	json_schema?: JsonObject; // JSON schema used to constrain structured output.
	cache_prompt?: boolean; // Reuses prompt cache when supported by the server.
	n_keep?: number; // Number of initial prompt tokens to always retain.
	n_predict?: number; // llama.cpp-style alias for generated token count.
	timings_per_token?: boolean; // Requests per-token timing metadata.
	return_tokens?: boolean; // Requests raw generated tokens in the response.
	return_progress?: boolean; // Requests intermediate progress events.
	response_fields?: string[]; // Selects optional extra fields to include in the response.

	[key: string]: unknown; // Allows provider-specific extra request fields.
}

export interface LlamaChatCompletionsUsage {
	prompt_tokens: number;
	completion_tokens: number;
	total_tokens: number;
}

export interface LlamaChatCompletionsChoice {
	index: number;
	message: LlamaChatMessage;
	finish_reason:
		| "stop"
		| "length"
		| "content_filter"
		| "tool_calls"
		| "tool"
		| null;
	logprobs?: unknown;
}

export interface LlamaChatCompletionsResponse {
	id: string;
	object: "chat.completion";
	created: number;
	model: string;
	choices: LlamaChatCompletionsChoice[];
	usage?: LlamaChatCompletionsUsage;

	// llama-server can include additional fields (e.g. timings, reasoning)
	[key: string]: unknown;
}

export interface LlamaChatCompletionsDelta {
	role?: "assistant";
	content?: string | null;
	reasoning_content?: string | null; // <- add
	tool_calls?: LlamaChatToolCall[];
	function_call?: {
		name?: string;
		arguments?: string;
	};
	[key: string]: unknown;
}

export interface LlamaChatCompletionsChunkChoice {
	index: number;
	delta: LlamaChatCompletionsDelta;
	finish_reason:
		| "stop"
		| "length"
		| "content_filter"
		| "tool_calls"
		| "tool"
		| null;
	logprobs?: unknown;
}

export interface LlamaChatCompletionsChunk {
	id: string;
	object: "chat.completion.chunk";
	created: number;
	model: string;
	choices: LlamaChatCompletionsChunkChoice[];
	usage?: LlamaChatCompletionsUsage;
	[key: string]: unknown;
}

export interface LlamaChatCompletionOptions {
	headers?: HeadersInit;
	signal?: AbortSignal;
	onToken?: (tokenText: string, chunk: LlamaChatCompletionsChunk) => void;
	onChunk?: (chunk: LlamaChatCompletionsChunk) => void;
	onReasoningToken?: (
		tokenText: string,
		chunk: LlamaChatCompletionsChunk
	) => void; // <- add
}

export class LlamaChatCompletionError extends Error {
	constructor(
		message: string,
		public status?: number,
		public payload?: unknown
	) {
		super(message);
		this.name = "LlamaChatCompletionError";
	}
}

function joinUrl(baseUrl: string, path: string): string {
	return `${baseUrl.replace(/\/+$/, "")}${path.startsWith("/") ? "" : "/"}${path}`;
}

function extractSseDataLines(eventBlock: string): string[] {
	return eventBlock
		.split(/\r?\n/)
		.map((line) => line.trimEnd())
		.filter((line) => line.startsWith("data:"))
		.map((line) => line.slice("data:".length).trimStart())
		.filter(Boolean);
}

function findSseSeparator(
	buffer: string
): { index: number; length: number } | null {
	const index = buffer.search(/\r?\n\r?\n/);
	if (index === -1) return null;
	const match = buffer.slice(index).match(/^\r?\n\r?\n/);
	return { index, length: match?.[0].length ?? 2 };
}

async function parseSse(
	res: Response,
	onChunk: (chunk: LlamaChatCompletionsChunk) => void,
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
				// ignore cancellation errors
			}
			return;
		}

		const { value, done } = await reader.read();
		if (done) break;

		buffer += decoder.decode(value, { stream: true });

		while (true) {
			const sep = findSseSeparator(buffer);
			if (!sep) break;

			const rawEvent = buffer.slice(0, sep.index);
			buffer = buffer.slice(sep.index + sep.length);

			for (const data of extractSseDataLines(rawEvent)) {
				if (data === "[DONE]") continue;
				onChunk(JSON.parse(data) as LlamaChatCompletionsChunk);
			}
		}
	}

	const trailing = buffer.trim();
	if (!trailing) return;

	for (const data of extractSseDataLines(trailing)) {
		if (data === "[DONE]") continue;
		onChunk(JSON.parse(data) as LlamaChatCompletionsChunk);
	}
}

function mergeToolCallDelta(
	target: LlamaChatToolCall,
	delta: LlamaChatToolCall
): LlamaChatToolCall {
	return {
		id: delta.id ?? target.id,
		type: delta.type ?? target.type,
		index: delta.index ?? target.index,
		function: {
			name: delta.function?.name ?? target.function?.name ?? "",
			arguments: `${target.function?.arguments ?? ""}${delta.function?.arguments ?? ""}`,
		},
	};
}

function normalizeToolCalls(
	toolCalls: Record<number, LlamaChatToolCall>
): LlamaChatToolCall[] {
	return Object.keys(toolCalls)
		.map((i) => Number(i))
		.sort((a, b) => a - b)
		.map((i) => toolCalls[i]);
}

interface ChoiceAccumulator {
	role?: "assistant";
	content: string;
	reasoningContent: string; // <- add
	finish_reason: LlamaChatCompletionsChoice["finish_reason"];
	toolCalls: Record<number, LlamaChatToolCall>;
	functionCallName: string;
	functionCallArguments: string;
	logprobs?: unknown;
}

function toMessage(acc: ChoiceAccumulator): LlamaChatMessage {
	const toolCalls = normalizeToolCalls(acc.toolCalls);
	const hasFunctionCall = acc.functionCallName || acc.functionCallArguments;

	return {
		role: acc.role ?? "assistant",
		content: acc.content || null,
		...(acc.reasoningContent
			? { reasoning_content: acc.reasoningContent }
			: {}), // <- add
		...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
		...(hasFunctionCall
			? {
					function_call: {
						name: acc.functionCallName,
						arguments: acc.functionCallArguments,
					},
				}
			: {}),
	};
}

export async function chatCompletions(
	request: LlamaChatCompletionsRequest,
	options?: LlamaChatCompletionOptions
): Promise<LlamaChatCompletionsResponse> {
	const baseUrl = import.meta.env.VITE_LLAMA_URL ?? "http://localhost:8083";
	const url = joinUrl(baseUrl, "/v1/chat/completions");
	const streamEnabled =
		request.stream === true ||
		typeof options?.onToken === "function" ||
		typeof options?.onReasoningToken === "function"; // <- update
	const body: LlamaChatCompletionsRequest = {
		...request,
		stream: streamEnabled,
	};

	const res = await fetch(url, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			...(options?.headers ?? {}),
		},
		body: JSON.stringify(body),
		signal: options?.signal,
	});

	if (!res.ok) {
		const text = await res.text().catch(() => "");
		let payload: unknown;
		try {
			payload = text ? JSON.parse(text) : undefined;
		} catch {
			payload = text || undefined;
		}

		const message =
			typeof payload === "object" && payload !== null && "error" in payload
				? `${res.status} ${res.statusText} - ${JSON.stringify((payload as Record<string, unknown>).error)}`
				: `${res.status} ${res.statusText}${text ? ` - ${text}` : ""}`;

		throw new LlamaChatCompletionError(
			`llama-server /v1/chat/completions failed: ${message}`,
			res.status,
			payload
		);
	}

	if (!streamEnabled) {
		return (await res.json()) as LlamaChatCompletionsResponse;
	}

	const accumulators = new Map<number, ChoiceAccumulator>();
	let lastChunk: LlamaChatCompletionsChunk | null = null;
	let usage: LlamaChatCompletionsUsage | undefined;

	await parseSse(
		res,
		(chunk) => {
			lastChunk = chunk;
			if (chunk.usage) usage = chunk.usage;

			options?.onChunk?.(chunk);

			for (const choice of chunk.choices ?? []) {
				const index = choice.index ?? 0;
				const delta = choice.delta ?? {};

				const current =
					accumulators.get(index) ??
					({
						role: undefined,
						content: "",
						reasoningContent: "", // <- add
						finish_reason: null,
						toolCalls: {},
						functionCallName: "",
						functionCallArguments: "",
					} satisfies ChoiceAccumulator);

				if (delta.role) current.role = delta.role;

				const reasoningToken =
					typeof delta.reasoning_content === "string"
						? delta.reasoning_content
						: "";
				if (reasoningToken) {
					current.reasoningContent += reasoningToken;
					options?.onReasoningToken?.(reasoningToken, chunk);
				}

				const token = typeof delta.content === "string" ? delta.content : "";
				if (token) {
					current.content += token;
					options?.onToken?.(token, chunk);
				}

				if (delta.function_call) {
					if (delta.function_call.name)
						current.functionCallName = delta.function_call.name;
					if (delta.function_call.arguments) {
						current.functionCallArguments += delta.function_call.arguments;
					}
				}

				if (delta.tool_calls?.length) {
					for (const deltaTc of delta.tool_calls) {
						const tcIndex = deltaTc.index ?? 0;
						const prev =
							current.toolCalls[tcIndex] ??
							({
								id: deltaTc.id ?? null,
								type: deltaTc.type ?? "function",
								index: tcIndex,
								function: {
									name: deltaTc.function?.name ?? "",
									arguments: "",
								},
							} satisfies LlamaChatToolCall);

						current.toolCalls[tcIndex] = mergeToolCallDelta(prev, {
							...deltaTc,
							index: tcIndex,
							function: {
								name: deltaTc.function?.name ?? "",
								arguments: deltaTc.function?.arguments ?? "",
							},
						});
					}
				}

				if (
					choice.finish_reason !== null &&
					choice.finish_reason !== undefined
				) {
					current.finish_reason = choice.finish_reason;
				}

				if (choice.logprobs !== undefined) current.logprobs = choice.logprobs;

				accumulators.set(index, current);
			}
		},
		options?.signal
	);

	const created =
		(lastChunk as LlamaChatCompletionsChunk | null)?.created ??
		Math.floor(Date.now() / 1000);
	const model =
		(lastChunk as LlamaChatCompletionsChunk | null)?.model ?? request.model;
	const id =
		(lastChunk as LlamaChatCompletionsChunk | null)?.id ??
		`chatcmpl-local-${created}`;

	const choices: LlamaChatCompletionsChoice[] = Array.from(
		accumulators.entries()
	)
		.sort(([a], [b]) => a - b)
		.map(([index, acc]) => ({
			index,
			message: toMessage(acc),
			finish_reason: acc.finish_reason,
			...(acc.logprobs !== undefined ? { logprobs: acc.logprobs } : {}),
		}));

	return {
		id,
		object: "chat.completion",
		created,
		model,
		choices,
		...(usage ? { usage } : {}),
	};
}
