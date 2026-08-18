import { chatCompletions } from '@/lib/utils/inference/chat-completions-provider';

export interface DialogExchange {
	speaker: 'A' | 'B';
	text: string;
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
}

const CONTEXT_CAP = 6000;

function capContext(context: string): string {
	if (context.length <= CONTEXT_CAP) return context;
	return context.slice(0, CONTEXT_CAP) + '…';
}

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
		question
	} = params;
	const currentName = speaker === 'A' ? hostAName : hostBName;
	const otherName = speaker === 'A' ? hostBName : hostAName;

	const contextBlock = context
		? `\n\nReference material:\n${capContext(context)}\n\nUse this material to ground your response. Draw specific facts or ideas from it, but stay conversational.`
		: '';

	const introBlock = isFirstInteractionOfTopic
		? `\n\nThis is the opening exchange of a new topic: "${topic}". Open by briefly introducing the topic with a natural phrase like "Now let's talk about ${topic}" as part of your spoken line, then continue the conversation. Keep the introduction to 1-2 short sentences and do not use labels or stage directions.`
		: '';

	const newChunkBlock =
		mode === 'guided' && speaker === 'A' && isNewChunkAfterFirst
			? `\n\nThis is a NEW segment based on a different part of the source material. Before asking your question, briefly announce the new topic or section in 1 sentence, drawing it from the reference material above. Then continue into your question. Do not use labels or stage directions.`
			: '';

	const forcedQuestionBlock =
		mode === 'guided' && speaker === 'A' && question
			? `\n\nYou must pose this specific question to your co-host (you may rephrase it naturally but keep its meaning): "${question}". Ground your lead-in in the reference material, then ask the question.`
			: '';

	const conclusionBlock = isLastInteractionOfTopic
		? `\n\nThis is the final exchange of this topic. Do NOT ask a question and do NOT introduce new information or answers. Briefly summarize the key points discussed in this topic and end with a short, concise conclusion. Keep it to 2-3 sentences. Ignore any earlier instructions to ask questions or provide answers.`
		: '';

	const singularRules = `
- Speak in singular form: address only your co-host directly, never "you all", "we", "everyone", or "guys". Avoid plural audience references.
- Optionally, you may naturally address the other host by name once in a while (e.g., "What do you think, ${otherName}?") to make it feel like a real two-person conversation, but do not overdo it.`;

	if (mode === 'interview' || mode === 'guided') {
		const role =
			speaker === 'A'
				? 'the interviewer who asks insightful questions'
				: 'the expert who provides informative answers';
		return `You are hosting a podcast interview about "${topic}".
You are ${currentName} (Host ${speaker}), ${role}.
The other host is ${otherName} (Host ${speaker === 'A' ? 'B' : 'A'}).
Rules:
- Respond with ONLY the spoken line for ${currentName}. No name labels, no quotes, no JSON, no stage directions.
- Keep it to 2-3 sentences maximum.
- Be conversational and natural.
- If you are the interviewer, ask a focused question. If you are the expert, give a clear, engaging answer.
- Build on what the other host just said.${singularRules}${contextBlock}${introBlock}${newChunkBlock}${forcedQuestionBlock}${conclusionBlock}`;
	}

	return `You are hosting a casual podcast discussion about "${topic}".
You are ${currentName} (Host ${speaker}). The other host is ${otherName}.
Rules:
- Respond with ONLY the spoken line for ${currentName}. No name labels, no quotes, no JSON, no stage directions.
- Keep it to 2-3 sentences maximum.
- Be conversational and natural, like two friends chatting.
- Build on what the other host said.
- End your turn with a question, thought, or prompt for the other host.
- Keep it energetic and engaging.${singularRules}${contextBlock}${introBlock}${conclusionBlock}`;
}

function buildUserMessage(params: GenerateExchangeParams): string {
	const { previousExchanges } = params;

	if (previousExchanges.length === 0) {
		return 'Start the conversation with your opening line.';
	}

	const transcript = previousExchanges.map((e) => `Host ${e.speaker}: ${e.text}`).join('\n');

	return `Previous conversation:\n${transcript}\n\nIt is your turn now. Continue the conversation briefly and naturally.`;
}

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

export async function generateExchange(params: GenerateExchangeParams): Promise<DialogExchange> {
	const { speaker, hostAName, hostBName, signal } = params;

	const response = await chatCompletions(
		{
			messages: [
				{ role: 'system', content: buildSystemMessage(params) },
				{ role: 'user', content: buildUserMessage(params) }
			],
			stream: false,
			temperature: 0.8
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
