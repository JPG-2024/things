import { chatCompletions } from '@/lib/utils/inference/chat-completions-provider';
import {
	formatTranscript,
	referenceMaterialBlock,
	introTopicBlock,
	newChunkAnnouncementBlock,
	guidedForcedQuestionBlock,
	topicConclusionBlock,
	regenerationBlock,
	singularRules,
	hookSystemPrompt,
	interviewModeSystemPrompt,
	smalltalkModeSystemPrompt,
	initialHookUserMessage,
	finalHookUserMessage,
	openingConversationUserMessage,
	transcriptUserMessage
} from './prompts';

export interface DialogExchange {
	speaker: 'A' | 'B';
	text: string;
	role?: 'hook' | 'question' | 'answer' | 'casual';
	direct?: boolean;
}

export interface GenerateExchangeParams {
	topic: string;
	mode: 'interview' | 'smalltalk' | 'guided';
	previousExchanges: DialogExchange[];
	speaker: 'A' | 'B';
	hostAName: string;
	hostBName: string;
	context?: string;
	signal?: AbortSignal;
	isFirstInteractionOfTopic?: boolean;
	isLastInteractionOfTopic?: boolean;
	isNewChunkAfterFirst?: boolean;
	question?: string;
	hookKind?: 'initial' | 'final';
	customSystemPrompt?: string;
	regeneration?: { previousText: string };
}

/**
 * Constructs the system message for the LLM based on the current conversation state.
 *
 * Builds role-specific instructions for interview, guided, or smalltalk modes,
 * including context blocks, intro/outro hooks, and singular-speaking rules.
 *
 * @param params - The generation parameters including topic, mode, speaker, and context.
 * @returns The formatted system message string.
 */
function buildSystemMessage(params: GenerateExchangeParams): string {
	const {
		topic,
		mode,
		speaker,
		hostAName,
		hostBName,
		context,
		isLastInteractionOfTopic,
		isFirstInteractionOfTopic,
		isNewChunkAfterFirst,
		question,
		hookKind,
		customSystemPrompt,
		regeneration
	} = params;
	const currentName = speaker === 'A' ? hostAName : hostBName;
	const otherName = speaker === 'A' ? hostBName : hostAName;

	if (hookKind) {
		const base = (customSystemPrompt?.trim() || hookSystemPrompt(hookKind))
			.replace('__NAME__', currentName)
			.replace('__SPEAKER__', speaker);
		return base + '\n- Do not ask any questions. Deliver a statement, never a question.';
	}

	const contextBlock = referenceMaterialBlock(context);

	const introBlock = isFirstInteractionOfTopic ? introTopicBlock(topic) : '';

	const newChunkBlock =
		mode === 'guided' && speaker === 'A' && isNewChunkAfterFirst ? newChunkAnnouncementBlock() : '';

	const forcedQuestionBlock =
		mode === 'guided' && speaker === 'A' && question ? guidedForcedQuestionBlock(question) : '';

	const conclusionBlock = isLastInteractionOfTopic ? topicConclusionBlock() : '';

	const sRules = singularRules(otherName);

	const regenBlock = regeneration ? regenerationBlock(regeneration.previousText) : '';

	if (mode === 'interview' || mode === 'guided') {
		return (
			interviewModeSystemPrompt(topic, currentName, speaker, otherName, {
				singularRules: sRules,
				contextBlock,
				introBlock,
				newChunkBlock,
				forcedQuestionBlock,
				conclusionBlock
			}) + regenBlock
		);
	}

	return (
		smalltalkModeSystemPrompt(topic, currentName, speaker, otherName, {
			singularRules: sRules,
			contextBlock,
			introBlock,
			conclusionBlock
		}) + regenBlock
	);
}

/**
 * Constructs the user message with conversation history for the LLM.
 *
 * Includes the full transcript of previous exchanges and instructions
 * for the current turn, including any forced question to answer.
 *
 * @param params - The generation parameters with previous exchanges and speaker info.
 * @returns The formatted user message string.
 */
function buildUserMessage(params: GenerateExchangeParams): string {
	const { previousExchanges, question, speaker, hookKind } = params;

	if (hookKind === 'initial') {
		return initialHookUserMessage();
	}

	if (hookKind === 'final') {
		return finalHookUserMessage();
	}

	if (previousExchanges.length === 0) {
		return openingConversationUserMessage();
	}

	const transcript = formatTranscript(previousExchanges);

	return transcriptUserMessage(transcript, question, speaker);
}

/**
 * Strips formatting artifacts from raw LLM output.
 *
 * Removes code fences, surrounding quotes, and host name prefixes
 * to extract the clean spoken dialogue text.
 *
 * @param raw - The raw response string from the LLM.
 * @param speaker - The speaker identifier ('A' or 'B').
 * @param hostAName - The display name of Host A.
 * @param hostBName - The display name of Host B.
 * @returns The cleaned dialogue text without labels or formatting.
 */
function cleanExchangeText(
	raw: string,
	speaker: 'A' | 'B',
	hostAName: string,
	hostBName: string
): string {
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

	const name = speaker === 'A' ? hostAName : hostBName;
	const otherName = speaker === 'A' ? hostBName : hostAName;
	const prefixes = [
		`Host ${speaker}:`,
		`Host ${speaker} -`,
		`${name}:`,
		`${name} -`,
		`${otherName}:`,
		`${otherName} -`
	];

	for (const prefix of prefixes) {
		if (text.startsWith(prefix)) {
			text = text.slice(prefix.length).trim();
			break;
		}
	}

	return text;
}

/**
 * Generates a single dialog exchange by calling the LLM.
 *
 * Builds system and user messages, sends them to the chat completions API,
 * and returns a cleaned DialogExchange with the speaker's line.
 *
 * @param params - The generation parameters including topic, mode, speaker, and history.
 * @returns A DialogExchange with the speaker identifier and cleaned text.
 * @throws {Error} If the generated exchange text is empty.
 */
export async function generateExchange(params: GenerateExchangeParams): Promise<DialogExchange> {
	const { speaker, hostAName, hostBName, signal } = params;

	const response = await chatCompletions(
		{
			messages: [
				{ role: 'system', content: buildSystemMessage(params) },
				{ role: 'user', content: buildUserMessage(params) }
			],
			stream: false,
			temperature: params.regeneration ? 0.9 : 0.1
		},
		{ signal }
	);

	const rawContent = response.choices?.[0]?.message?.content;
	const raw = typeof rawContent === 'string' ? rawContent : '';
	const text = cleanExchangeText(raw, speaker, hostAName, hostBName);

	if (!text) {
		throw new Error('Generated exchange has empty text');
	}

	return { speaker, text };
}
