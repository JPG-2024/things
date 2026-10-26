import OpenAI from 'openai';
import {
	chatCompletions as llamaChatCompletions,
	LlamaChatCompletionError,
	type LlamaChatCompletionOptions,
	type LlamaChatCompletionsRequest,
	type LlamaChatCompletionsResponse
} from './llama-completions';
import {
	applyOpenAICompatibleThinking,
	openAICompatibleChatCompletions
} from './openai-compatible';
import { opencodeChatCompletions } from './opencode-completions';
import { viewState } from '@/stores/viewStore.svelte';

export type {
	LlamaChatCompletionsRequest,
	LlamaChatCompletionsResponse,
	LlamaChatCompletionsChoice,
	LlamaChatCompletionsUsage,
	LlamaChatMessage,
	LlamaChatCompletionOptions
} from './llama-completions';

export { LlamaChatCompletionError } from './llama-completions';

export { DEFAULT_OPENCODE_MODEL } from './opencode-completions';

export const DEFAULT_OPENROUTER_MODEL = 'openai/gpt-4o';

const LANGUAGE_MAP: Record<string, string> = {
	en: 'English',
	es: 'Spanish',
	fr: 'French',
	de: 'German',
	pt: 'Portuguese',
	it: 'Italian',
	ja: 'Japanese'
};

/**
 * Resolves the display name of the language currently selected in viewState.
 *
 * @returns The language name (e.g. 'Spanish'), or undefined if unmapped.
 */
export function getResponseLanguageName(): string | undefined {
	return LANGUAGE_MAP[viewState.language];
}

/**
 * Returns true when the request explicitly asks to disable thinking/reasoning.
 * @param request - The incoming chat completion request.
 * @returns Whether thinking should be disabled for this request.
 */
function wantsThinkingDisabled(request: LlamaChatCompletionsRequest): boolean {
	if (request.reasoning_effort === 'none') return true;
	if (request.reasoning?.enabled === false) return true;
	if (request.reasoning?.effort === 'none') return true;
	return request.think === false || request.enable_thinking === false;
}

/**
 * Drop the provider-agnostic thinking intent fields before sending upstream.
 * @param request - The request to clean.
 * @returns A shallow copy without the intent-only fields.
 */
function stripThinkingIntent(request: LlamaChatCompletionsRequest): LlamaChatCompletionsRequest {
	const rest: LlamaChatCompletionsRequest = { ...request };
	delete rest.think;
	delete rest.enable_thinking;
	return rest;
}

/**
 * Apply llama-server's documented per-request thinking switch.
 * @param request - The request to translate.
 * @returns The request with llama-server reasoning fields set.
 */
function applyLlamaThinking(request: LlamaChatCompletionsRequest): LlamaChatCompletionsRequest {
	if (wantsThinkingDisabled(request)) {
		return {
			...stripThinkingIntent(request),
			reasoning_effort: 'none',
			chat_template_kwargs: {
				...(request.chat_template_kwargs ?? {}),
				enable_thinking: false
			}
		};
	}

	// Forward effort levels into llama-server's template kwargs, where
	// thinking templates (e.g. gpt-oss) actually read them from; the top-level
	// `reasoning_effort` field is not reliably mapped by every server version.
	const effort = request.reasoning_effort;
	if (
		effort &&
		effort !== 'none' &&
		!('reasoning_effort' in (request.chat_template_kwargs ?? {}))
	) {
		return {
			...stripThinkingIntent(request),
			chat_template_kwargs: {
				...(request.chat_template_kwargs ?? {}),
				reasoning_effort: effort
			}
		};
	}
	return request;
}

let openrouterClient: OpenAI | null = null;

function getOpenRouterClient(): OpenAI {
	if (openrouterClient) return openrouterClient;

	const apiKey = import.meta.env.VITE_OPENROUTER_API_KEY;
	if (!apiKey) {
		throw new LlamaChatCompletionError(
			'OpenRouter API key is not set. Add VITE_OPENROUTER_API_KEY to your .env file.',
			undefined,
			undefined
		);
	}

	const siteUrl = import.meta.env.VITE_OPENROUTER_SITE_URL;
	const siteName = import.meta.env.VITE_OPENROUTER_SITE_NAME;

	openrouterClient = new OpenAI({
		baseURL: 'https://openrouter.ai/api/v1',
		apiKey,
		dangerouslyAllowBrowser: true,
		defaultHeaders: {
			...(siteUrl ? { 'HTTP-Referer': siteUrl } : {}),
			...(siteName ? { 'X-OpenRouter-Title': siteName } : {})
		}
	});

	return openrouterClient;
}

async function openrouterChatCompletions(
	request: LlamaChatCompletionsRequest,
	options?: LlamaChatCompletionOptions
): Promise<LlamaChatCompletionsResponse> {
	const model = viewState.aiModel || DEFAULT_OPENROUTER_MODEL;
	return openAICompatibleChatCompletions(
		() => getOpenRouterClient(),
		model,
		'OpenRouter',
		request,
		options
	);
}

export async function chatCompletions(
	request: LlamaChatCompletionsRequest,
	options?: LlamaChatCompletionOptions
): Promise<LlamaChatCompletionsResponse> {
	const context = typeof request.context === 'string' ? request.context.trim() : '';

	// Locate the last user message so we can build the final user message from
	// the decoupled `context` + `userMessage`.
	const messages = request.messages;
	let lastUserIndex = -1;
	for (let i = messages.length - 1; i >= 0; i--) {
		const msg = messages[i];
		if (msg.role === 'user' && typeof msg.content === 'string') {
			lastUserIndex = i;
			break;
		}
	}

	if (lastUserIndex >= 0) {
		const msg = messages[lastUserIndex];
		if (typeof msg.content === 'string') {
			if (context) {
				msg.content = `context: ${context} ${msg.content}`;
			}

			const langName = LANGUAGE_MAP[viewState.language];
			if (langName) {
				msg.content += `\n\nRespond in ${langName}.`;
			}
		}
	}

	// `context` is a local-only field; never send it upstream.
	delete request.context;

	if (viewState.aiProvider === 'opencode') {
		return opencodeChatCompletions(applyOpenAICompatibleThinking(request), options);
	}
	if (viewState.aiProvider === 'openrouter') {
		return openrouterChatCompletions(applyOpenAICompatibleThinking(request), options);
	}
	return llamaChatCompletions(applyLlamaThinking(request), options);
}
