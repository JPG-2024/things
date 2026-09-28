import {
	chatCompletions,
	type LlamaChatMessage,
	type LlamaChatCompletionsResponse
} from '@/lib/utils/inference/chat-completions-provider';
import {
	scriptSystemPrompt,
	scriptUserPrompt,
	scriptRetryUserPrompt,
	type ScriptPromptInput
} from './prompts';
import type { DialogExchange } from './types';

export interface GenerateTopicScriptParams extends ScriptPromptInput {
	temperature: number;
	reasoning?: boolean;
	systemPromptOverride?: string;
	signal?: AbortSignal;
}

/**
 * Parses raw LLM script output into dialogue exchanges.
 *
 * Accepts lines labelled "A:", "B:", "Host A:", "Host B:" or the actual host
 * names. Merges consecutive same-speaker lines into a single turn so the TTS
 * pipeline gets coherent speaking units.
 *
 * @param raw - The raw response string from the LLM.
 * @param hostAName - The display name of Host A.
 * @param hostBName - The display name of Host B.
 * @returns The parsed exchanges, in script order.
 */
export function parseScript(raw: string, hostAName: string, hostBName: string): DialogExchange[] {
	let text = raw.trim();
	text = text
		.replace(/^```(?:\w+)?\s*/i, '')
		.replace(/\s*```$/i, '')
		.trim();

	const aLabels = new Set(['a', 'host a', hostAName.toLowerCase()]);
	const bLabels = new Set(['b', 'host b', hostBName.toLowerCase()]);

	const turns: DialogExchange[] = [];
	for (const line of text.split('\n')) {
		const match = line.match(/^\s*(.+?)\s*[:\-–]\s+(.+)$/);
		if (!match) continue;

		const label = match[1].trim().toLowerCase();
		const content = match[2]
			.trim()
			.replace(/^["']+|["']+$/g, '')
			.trim();
		if (!content) continue;

		let speaker: 'A' | 'B' | null = null;
		if (aLabels.has(label)) speaker = 'A';
		else if (bLabels.has(label)) speaker = 'B';
		if (!speaker) continue;

		const last = turns[turns.length - 1];
		if (last && last.speaker === speaker) {
			last.text = `${last.text} ${content}`;
		} else {
			turns.push({ speaker, text: content });
		}
	}
	return turns;
}

function extractRawContent(response: LlamaChatCompletionsResponse): string {
	const content = response.choices?.[0]?.message?.content;
	return typeof content === 'string' ? content : '';
}

/**
 * Generates a complete dialogue script for one topic in a single LLM call.
 *
 * Retries once with a stricter correction message when the first response
 * cannot be parsed into at least two turns.
 *
 * @param params - The script generation parameters.
 * @returns The parsed dialogue exchanges for the topic.
 * @throws {Error} If both attempts fail to produce a parseable script.
 */
export async function generateTopicScript(
	params: GenerateTopicScriptParams
): Promise<DialogExchange[]> {
	const { temperature, reasoning, systemPromptOverride, signal, hostAName, hostBName } = params;

	const system = systemPromptOverride?.trim()
		? systemPromptOverride
				.trim()
				.replaceAll('__HOST_A_NAME__', hostAName)
				.replaceAll('__HOST_B_NAME__', hostBName)
		: scriptSystemPrompt(params);

	// reasoning_effort reaches both providers; chat_template_kwargs is the
	// llama-server switch (stripped on the OpenRouter path by the provider).
	const reasoningExtras = reasoning
		? { reasoning_effort: 'low', chat_template_kwargs: { enable_thinking: true } }
		: {};

	const messages: LlamaChatMessage[] = [
		{ role: 'system', content: system },
		{ role: 'user', content: scriptUserPrompt(params.topic, params.turnCount) }
	];

	let response = await chatCompletions(
		{ messages, stream: false, temperature, ...reasoningExtras },
		{ signal }
	);
	let raw = extractRawContent(response);
	let script = parseScript(raw, hostAName, hostBName);
	if (script.length >= 2) return script;

	messages.push(
		{ role: 'assistant', content: raw },
		{ role: 'user', content: scriptRetryUserPrompt(params.turnCount) }
	);
	response = await chatCompletions(
		{ messages, stream: false, temperature, ...reasoningExtras },
		{ signal }
	);
	raw = extractRawContent(response);
	script = parseScript(raw, hostAName, hostBName);

	if (script.length < 2) {
		throw new Error('Could not generate a valid dialog script for this topic');
	}
	return script;
}
