import { fetch } from '@tauri-apps/plugin-http';

export type LocalStreamCallback = (chunk: string) => void;

/**
 * Configuration options for running a local Llama language model inference.
 * 
 * @interface RunLocalLlamaOptions
 * 
 * @property {string} [baseUrl] - The base URL of the local inference server endpoint.
 * @property {string} [model] - The specific model identifier to use for inference.
 * @property {string} [systemPrompt] - The system-level prompt that sets the behavior and context for the model.
 * @property {number} [temperature] - Controls randomness in generation. Higher values (e.g., 1.0) make output more random, lower values (e.g., 0.1) make it more deterministic.
 * @property {number} [maxTokens] - The maximum number of tokens to generate in the response.
 * @property {number} [topP] - Nucleus sampling parameter. Controls diversity via cumulative probability. Value between 0 and 1.
 * @property {LocalStreamCallback} [onChunk] - Callback function invoked for each streamed chunk of the response.
 * @property {AbortSignal} [signal] - An AbortSignal to cancel the inference request.
 * @property {Record<string, unknown>} [extraBody] - Additional custom parameters to include in the request body.
 * @property {Array<{role: string; content: string}>} [messages] - Additional messages to include in the conversation (e.g., chat history).
 */
export interface RunLocalLlamaOptions {
	baseUrl?: string;
	model?: string;
	systemPrompt?: string;
	temperature?: number;
	maxTokens?: number;
	topP?: number;
	onChunk?: LocalStreamCallback;
	signal?: AbortSignal;
	extraBody?: Record<string, unknown>;
	messages?: Array<{ role: string; content: string }>;
}

const DEFAULT_BASE_URL = 'http://127.0.0.1:8080';
const DEFAULT_MODEL = 'llama';

export async function runLocalLlamaPrompt(
	prompt: string,
	options: RunLocalLlamaOptions = {}
): Promise<string> {
	const {
		baseUrl = DEFAULT_BASE_URL,
		model = DEFAULT_MODEL,
		systemPrompt,
		temperature,
		maxTokens,
		topP,
		onChunk,
		signal,
		extraBody,
		messages: additionalMessages,
	} = options;

	const messages: Array<Record<string, unknown>> = [];

	if (systemPrompt) {
		messages.push({ role: 'system', content: systemPrompt });
	}

	if (additionalMessages && Array.isArray(additionalMessages)) {
		messages.push(...additionalMessages);
	}

	messages.push({ role: 'user', content: prompt });

	const requestBody: Record<string, unknown> = {
		model,
		messages,
		stream: true,
	};

	if (typeof temperature === 'number') {
		requestBody.temperature = temperature;
	}

	if (typeof maxTokens === 'number') {
		requestBody.max_tokens = maxTokens;
	}

	if (typeof topP === 'number') {
		requestBody.top_p = topP;
	}

	if (extraBody && typeof extraBody === 'object') {
		Object.assign(requestBody, extraBody);
	}

	const response = await fetch(`${baseUrl}/v1/chat/completions`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
		},
		body: JSON.stringify(requestBody),
		signal,
	});

	if (!response.ok) {
		const errorText = await response.text().catch(() => '');
		throw new Error(
			`llama-server returned ${response.status} ${response.statusText} ${errorText}`.trim()
		);
	}

	const reader = response.body?.getReader();

	if (!reader) {
		throw new Error('llama-server response does not support streaming');
	}

	const decoder = new TextDecoder();
	const aggregatedChunks: string[] = [];
	let buffer = '';

	const flushEvent = (rawEvent: string) => {
		const lines = rawEvent
			.split('\n')
			.map((line) => line.trim())
			.filter(Boolean);

		for (const line of lines) {
			if (!line.startsWith('data:')) {
				continue;
			}

			const payloadText = line.slice(5).trim();

			if (!payloadText || payloadText === '[DONE]') {
				continue;
			}

			let payload: unknown;

			try {
				payload = JSON.parse(payloadText);
			} catch {
				continue;
			}

			const { chunkText, metadata } = extractFromChatChunk(payload);

			if (!chunkText) {
				continue;
			}

			aggregatedChunks.push(chunkText);

			if (onChunk) {
				onChunk(chunkText);
			}
		}
	};

	while (true) {
		const { value, done } = await reader.read();

		if (done) {
			break;
		}

		buffer += decoder.decode(value, { stream: true });

		let boundary = buffer.indexOf('\n\n');

		while (boundary !== -1) {
			const rawEvent = buffer.slice(0, boundary);
			buffer = buffer.slice(boundary + 2);
			flushEvent(rawEvent);
			boundary = buffer.indexOf('\n\n');
		}
	}

	buffer += decoder.decode();

	if (buffer.trim()) {
		flushEvent(buffer);
	}

	return aggregatedChunks.join('');
}

function extractFromChatChunk(payload: unknown): {
	chunkText: string;
	metadata: unknown;
} {
	if (!payload || typeof payload !== 'object') {
		return { chunkText: '', metadata: null };
	}

	const value = payload as Record<string, unknown>;
	const choices = Array.isArray(value.choices) ? value.choices : [];
	const firstChoice = choices[0] as Record<string, unknown> | undefined;
	const delta = firstChoice?.delta as Record<string, unknown> | undefined;
	const content = delta?.content;
	const chunkText = typeof content === 'string' ? content : '';

	return {
		chunkText,
		metadata: value,
	};
}
