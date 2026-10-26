import OpenAI from 'openai';
import { openAICompatibleChatCompletions } from './openai-compatible';
import {
	LlamaChatCompletionError,
	type LlamaChatCompletionOptions,
	type LlamaChatCompletionsRequest,
	type LlamaChatCompletionsResponse
} from './llama-completions';
import { getOpencodeApiKey } from '@/lib/utils/opencodeAuth';
import { httpFetch } from '@/lib/utils/tauriFetch';
import { viewState } from '@/stores/viewStore.svelte';

/**
 * Adapter for OpenCode's inference API (https://opencode.ai/inference).
 * Exposes the same request/response surface as llama-completions so callers
 * don't care which provider is selected in the settings.
 */

export const DEFAULT_OPENCODE_MODEL = 'deepseek-v4.1-flash';
export const OPENCODE_BASE_URL = 'https://opencode.ai/inference/openai/v1';

let opencodeClient: OpenAI | null = null;

/**
 * Build (once) the OpenAI SDK client pointed at OpenCode's
 * OpenAI-compatible chat completions endpoint. The key is read lazily from
 * the local store, so a key saved in Settings is picked up on the next call
 * even after the client cache existed without one.
 */
async function getOpencodeClient(): Promise<OpenAI> {
	const apiKey = await getOpencodeApiKey();
	if (!apiKey) {
		throw new LlamaChatCompletionError(
			'OpenCode API key is not set. Paste it in Settings → AI Provider (OpenCode Go).',
			undefined,
			undefined
		);
	}

	if (!opencodeClient) {
		opencodeClient = new OpenAI({
			baseURL: OPENCODE_BASE_URL,
			apiKey,
			dangerouslyAllowBrowser: true,
			fetch: httpFetch
		});
	} else if (opencodeClient.apiKey !== apiKey) {
		opencodeClient = new OpenAI({
			baseURL: OPENCODE_BASE_URL,
			apiKey,
			dangerouslyAllowBrowser: true,
			fetch: httpFetch
		});
	}

	return opencodeClient;
}

export async function opencodeChatCompletions(
	request: LlamaChatCompletionsRequest,
	options?: LlamaChatCompletionOptions
): Promise<LlamaChatCompletionsResponse> {
	const model = viewState.opencodeModel || DEFAULT_OPENCODE_MODEL;
	return openAICompatibleChatCompletions(
		() => getOpencodeClient(),
		model,
		'OpenCode',
		request,
		options
	);
}
