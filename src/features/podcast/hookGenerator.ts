import {
	chatCompletions,
	type LlamaChatMessage
} from '@/lib/utils/inference/chat-completions-provider';
import {
	hookSystemPrompt,
	initialHookUserMessage,
	finalHookUserMessage,
	hostPersonaBlock
} from './prompts';
import type { DialogExchange, HookSlot, HostPersona } from './types';

export interface GenerateHookParams {
	kind: HookSlot;
	hostName: string;
	persona?: HostPersona;
	customPrompt?: string;
	temperature: number;
	signal?: AbortSignal;
}

/**
 * Strips formatting artifacts from a raw hook line.
 *
 * @param raw - The raw response string from the LLM.
 * @param hostName - The display name of the speaking host.
 * @returns The cleaned spoken text without labels or quotes.
 */
function cleanHookText(raw: string, hostName: string): string {
	let text = raw.trim();

	text = text
		.replace(/^```(?:json|text)?\s*/i, '')
		.replace(/\s*```$/i, '')
		.trim();

	if (
		(text.startsWith('"') && text.endsWith('"')) ||
		(text.startsWith("'") && text.endsWith("'"))
	) {
		text = text.slice(1, -1).trim();
	}

	for (const prefix of ['Host A:', `Host A -`, `${hostName}:`, `${hostName} -`]) {
		if (text.startsWith(prefix)) {
			text = text.slice(prefix.length).trim();
			break;
		}
	}

	return text;
}

/**
 * Generates a single-episode hook line (opening or closing) for Host A.
 *
 * @param params - The hook generation parameters.
 * @returns A DialogExchange spoken by Host A.
 * @throws {Error} If the generated hook text is empty.
 */
export async function generateHook(params: GenerateHookParams): Promise<DialogExchange> {
	const { kind, hostName, persona, customPrompt, temperature, signal } = params;

	const base = customPrompt?.trim() || hookSystemPrompt(kind, hostPersonaBlock(persona));
	const system =
		base.replaceAll('__NAME__', hostName).replaceAll('__SPEAKER__', 'A') +
		'\n- Do not ask any questions. Deliver a statement, never a question.';

	const messages: LlamaChatMessage[] = [
		{ role: 'system', content: system },
		{
			role: 'user',
			content: kind === 'initial' ? initialHookUserMessage() : finalHookUserMessage()
		}
	];

	const response = await chatCompletions({ messages, stream: false, temperature }, { signal });
	const rawContent = response.choices?.[0]?.message?.content;
	const text = cleanHookText(typeof rawContent === 'string' ? rawContent : '', hostName);

	if (!text) {
		throw new Error('Generated hook has empty text');
	}

	return { speaker: 'A', text };
}
