import type { DialogExchange, PodcastPromptContext, Segment, TurnPlan } from './types';

// ─── Shared constants ────────────────────────────────────────────────

export const CONTEXT_CAP = 6000;

// ─── Shared helpers ──────────────────────────────────────────────────

/**
 * Truncates a context string to a maximum length, appending an ellipsis if truncated.
 *
 * @param context - The context string to cap.
 * @returns The original string if within limit, or a truncated version with ellipsis.
 */
export function capContext(context: string): string {
	if (context.length <= CONTEXT_CAP) return context;
	return context.slice(0, CONTEXT_CAP) + '…';
}

/**
 * Returns singular-speaking rules for the co-host name usage.
 *
 * @param otherName - The name of the co-host to reference in the rules.
 * @returns Formatted rules text instructing singular form and optional name usage.
 */
export function singularRules(otherName: string): string {
	return `
- Speak in singular form: address only your co-host directly, never "you all", "we", "everyone", or "guys". Avoid plural audience references.
- Optionally, you may naturally address the other host by name once in a while (e.g., "What do you think, ${otherName}?") to make it feel like a real two-person conversation, but do not overdo it.`;
}

/**
 * Formats an array of dialog exchanges into a transcript string.
 *
 * @param exchanges - Array of objects with speaker and text properties.
 * @returns Formatted transcript with each exchange on its own line.
 */
export function formatTranscript(exchanges: { speaker: string; text: string }[]): string {
	return exchanges.map((e) => `Host ${e.speaker}: ${e.text}`).join('\n');
}

// ─── Prompt blocks (reusable fragments) ──────────────────────────────

/**
 * Returns a reference material block for grounding responses in source content.
 *
 * @param context - The source content to include.
 * @returns Formatted block string, or empty if context is falsy.
 */
export function referenceMaterialBlock(context: string | undefined): string {
	if (!context) return '';
	return `\n\nReference material:\n${capContext(context)}\n\nUse this material to ground your response. Draw specific facts or ideas from it, but stay conversational.`;
}

/**
 * Returns an intro block for the opening exchange of a new topic.
 *
 * @param topic - The topic name to introduce.
 * @returns Formatted block string, or empty if topic is falsy.
 */
export function introTopicBlock(topic: string | undefined): string {
	if (!topic) return '';
	return `\n\nThis is the opening exchange of a new topic: "${topic}". Open by briefly introducing the topic with a natural phrase like "Now let's talk about ${topic}" as part of your spoken line, then continue the conversation. Keep the introduction to 1-2 short sentences and do not use labels or stage directions. avoid questions.`;
}

/**
 * Returns a new chunk announcement block for guided mode.
 *
 * @returns Formatted block string.
 */
export function newChunkAnnouncementBlock(): string {
	return `\n\nbriefly announce the new topic or section in 1 sentence, drawing it from the reference material above. Do not use labels or stage directions.`;
}

/**
 * Returns a forced question block for guided mode.
 *
 * @param question - The specific question the host must pose.
 * @returns Formatted block string.
 */
export function guidedForcedQuestionBlock(question: string): string {
	return `\n\nYou must pose this specific question to your co-host (you may rephrase it naturally but keep its meaning): "${question}". Ground your lead-in in the reference material, then ask the question.`;
}

/**
 * Returns a conclusion block for the final exchange of a topic.
 *
 * @returns Formatted block string.
 */
export function topicConclusionBlock(): string {
	return `\n\nThis is the final exchange of this topic. Do NOT ask a question and do NOT introduce new information or answers. Briefly summarize the key points discussed in this topic and end with a short, concise conclusion. Keep it to 2-3 sentences. Ignore any earlier instructions to ask questions or provide answers.`;
}

/**
 * Returns a hook summary block for grounding introductions.
 *
 * @param summary - The hook summary text.
 * @returns Formatted block string, or empty if summary is falsy.
 */
export function hookSummaryBlock(summary: string | undefined): string {
	if (!summary) return '';
	return `\n\nSegment overview (use to ground the introduction):\n${summary}`;
}

/**
 * Returns a reference material block for interview questions.
 *
 * @param context - The source content to include.
 * @returns Formatted block string, or empty if context is falsy.
 */
export function interviewQuestionContextBlock(context: string | undefined): string {
	if (!context) return '';
	return `\n\nReference material (ground your question in it; do not quote verbatim):\n${capContext(context)}`;
}

/**
 * Returns a reference material block for interview answers.
 *
 * @param context - The source content to include.
 * @returns Formatted block string, or empty if context is falsy.
 */
export function interviewAnswerContextBlock(context: string | undefined): string {
	if (!context) return '';
	return `\n\nReference material (draw specific facts from it, but stay conversational):\n${capContext(context)}`;
}

/**
 * Returns a forced question block for interview questions.
 *
 * @param question - The specific question to pose.
 * @returns Formatted block string, or empty if question is falsy.
 */
export function interviewForcedQuestionBlock(question: string | undefined): string {
	if (!question) return '';
	return `\n\nYou must pose this specific question to your co-host (you may rephrase it naturally but keep its meaning): "${question}".`;
}

/**
 * Returns a casual reference material block for smalltalk.
 *
 * @param context - The source content to include.
 * @returns Formatted block string, or empty if context is falsy.
 */
export function smalltalkContextBlock(context: string | undefined): string {
	if (!context) return '';
	return `\n\nReference material (you may draw on it lightly, but stay casual):\n${capContext(context)}`;
}

/**
 * Returns a segment overview block for smalltalk hooks.
 *
 * @param summary - The hook summary text.
 * @returns Formatted block string, or empty if summary is falsy.
 */
export function smalltalkHookSummaryBlock(summary: string | undefined): string {
	if (!summary) return '';
	return `\n\nSegment overview:\n${summary}`;
}

// ─── Dialog generator prompts ────────────────────────────────────────

/**
 * Returns the default system prompt template for episode hooks.
 *
 * @param kind - The hook type: 'initial' for opening or 'final' for closing.
 * @returns Prompt template string with __NAME__ and __SPEAKER__ placeholders.
 */
export function hookSystemPrompt(kind: 'initial' | 'final'): string {
	if (kind === 'final') {
		return `You are closing a podcast episode.
You are ${'__NAME__'} (Host ${'__SPEAKER__'}).
Rules:
- Respond with ONLY the spoken line for ${'__NAME__'}. No name labels, no quotes, no JSON, no stage directions.
- Keep it to 2-3 sentences maximum.
- Warmly wrap up the episode, thank the audience, and hint at what comes next. Do not introduce new topics.
- Do not ask any questions. Deliver a statement, never a question.`;
	}
	return `You are opening a podcast episode.
You are ${'__NAME__'} (Host ${'__SPEAKER__'}).
Rules:
- Respond with ONLY the spoken line for ${'__NAME__'}. No name labels, no quotes, no JSON, no stage directions.
- Keep it to 2-3 sentences maximum.
- Welcome the audience and set expectations for the episode. Do not ask a question yet.`;
}

/**
 * Returns the system prompt for interview or guided mode.
 *
 * @param topic - The podcast topic.
 * @param currentName - The display name of the current speaker.
 * @param speaker - The speaker identifier ('A' or 'B').
 * @param otherName - The display name of the co-host.
 * @param blocks - Pre-built prompt blocks to append.
 * @returns The formatted system prompt string.
 */
export function interviewModeSystemPrompt(
	topic: string,
	currentName: string,
	speaker: string,
	otherName: string,
	blocks: {
		singularRules: string;
		contextBlock: string;
		introBlock: string;
		newChunkBlock: string;
		forcedQuestionBlock: string;
		conclusionBlock: string;
	}
): string {
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
- Build on what the other host just said.${blocks.singularRules}${blocks.contextBlock}${blocks.introBlock}${blocks.newChunkBlock}${blocks.forcedQuestionBlock}${blocks.conclusionBlock}`;
}

/**
 * Returns the system prompt for smalltalk mode.
 *
 * @param topic - The podcast topic.
 * @param currentName - The display name of the current speaker.
 * @param speaker - The speaker identifier ('A' or 'B').
 * @param otherName - The display name of the co-host.
 * @param blocks - Pre-built prompt blocks to append.
 * @returns The formatted system prompt string.
 */
export function smalltalkModeSystemPrompt(
	topic: string,
	currentName: string,
	speaker: string,
	otherName: string,
	blocks: {
		singularRules: string;
		contextBlock: string;
		introBlock: string;
		conclusionBlock: string;
	}
): string {
	return `You are hosting a casual podcast discussion about "${topic}".
You are ${currentName} (Host ${speaker}). The other host is ${otherName}.
Rules:
- Respond with ONLY the spoken line for ${currentName}. No name labels, no quotes, no JSON, no stage directions.
- Keep it to 2-3 sentences maximum.
- Be conversational and natural, like two friends chatting.
- Build on what the other host said.
- End your turn with a question, thought, or prompt for the other host.
- Keep it energetic and engaging.${blocks.singularRules}${blocks.contextBlock}${blocks.introBlock}${blocks.conclusionBlock}`;
}

/**
 * Returns the user message for an initial hook.
 *
 * @returns The user message string.
 */
export function initialHookUserMessage(): string {
	return 'Deliver your opening intro for the podcast episode.';
}

/**
 * Returns the user message for a final hook.
 *
 * @returns The user message string.
 */
export function finalHookUserMessage(): string {
	return 'Deliver your closing remarks to wrap up the podcast episode.';
}

/**
 * Returns the user message for opening a conversation.
 *
 * @returns The user message string.
 */
export function openingConversationUserMessage(): string {
	return 'Start the conversation with your opening line.';
}

/**
 * Returns the user message with conversation history and optional forced question.
 *
 * @param transcript - The formatted transcript of previous exchanges.
 * @param question - Optional forced question to answer.
 * @param speaker - The current speaker identifier ('A' or 'B').
 * @returns The user message string.
 */
export function transcriptUserMessage(
	transcript: string,
	question?: string,
	speaker?: string
): string {
	let base = `Previous conversation:\n${transcript}\n\nIt is your turn now. Continue the conversation briefly and naturally.`;

	if (question && speaker === 'B') {
		base += `\n\nThe interviewer asked this exact question — answer it directly:\n"${question}"`;
	}

	return base;
}

// ─── Topic extractor prompts ─────────────────────────────────────────

/**
 * Returns the system prompt for extracting topics from content.
 *
 * @param count - The number of topics to extract.
 * @returns The system prompt string.
 */
export function extractTopicsSystemPrompt(count: number): string {
	return `You are a content analyst. Extract exactly ${count} distinct discussion topics from the provided content. Topics should be specific enough for a brief podcast discussion. Each topic should be a concise phrase (5-10 words). Return only valid JSON matching the schema.`;
}

/**
 * Returns the user prompt for extracting topics from content.
 *
 * @param content - The source content to analyze.
 * @param count - The number of topics to extract.
 * @returns The user prompt string.
 */
export function extractTopicsUserPrompt(content: string, count: number): string {
	return `Content:\n${content}\n\nExtract exactly ${count} topics.`;
}

/**
 * Returns the system prompt for generating free-form topics.
 *
 * @param count - The number of topics to generate.
 * @returns The system prompt string.
 */
export function freeTopicsSystemPrompt(count: number): string {
	return `You are a creative podcast producer. Suggest exactly ${count} interesting, specific discussion topics for a podcast episode. Each topic should be a concise phrase (5-10 words). Return only valid JSON matching the schema.`;
}

/**
 * Returns the user prompt for generating free-form topics.
 *
 * @param count - The number of topics to generate.
 * @returns The user prompt string.
 */
export function freeTopicsUserPrompt(count: number): string {
	return `Suggest exactly ${count} interesting podcast topics.`;
}

// ─── Summary prompts ─────────────────────────────────────────────────

/**
 * Returns the system prompt for generating a topic summary.
 *
 * @returns The system prompt string.
 */
export function topicSummarySystemPrompt(): string {
	return `You are a research assistant preparing briefing notes for a podcast. Given the source content and a specific topic, write a concise factual summary of the source material that is relevant to the topic. Include key facts, figures, context, and viewpoints the hosts can reference. Keep it focused and under 400 words. Respond with plain text only, no headings or markdown.`;
}

/**
 * Returns the user prompt for generating a topic summary.
 *
 * @param topic - The topic to summarize.
 * @param content - The source content to summarize from.
 * @returns The user prompt string.
 */
export function topicSummaryUserPrompt(topic: string, content: string): string {
	return `Topic: ${topic}\n\nSource content:\n${content}`;
}

/**
 * Returns the system prompt for generating a chunk summary label.
 *
 * @returns The system prompt string.
 */
export function chunkSummarySystemPrompt(): string {
	return `You are preparing topic labels for a podcast. Given a segment of source material, summary that captures its main subject. Respond with plain text only, no headings or markdown. Maximum 10 words.`;
}

/**
 * Returns the user prompt for generating a chunk summary label.
 *
 * @param content - The source segment content.
 * @returns The user prompt string.
 */
export function chunkSummaryUserPrompt(content: string): string {
	return `Source segment:\n${content}. maximum 10 words.`;
}

// ─── Interview generator prompts (standalone module) ─────────────────

/**
 * Returns the system prompt for an interview hook turn.
 *
 * @param hostAName - The display name of Host A (interviewer).
 * @param hostBName - The display name of Host B (expert).
 * @param hookSummary - Optional summary for grounding the introduction.
 * @returns The formatted system prompt string.
 */
export function interviewHookSystemPrompt(
	hostAName: string,
	hostBName: string,
	hookSummary?: string
): string {
	const contextBlock = hookSummary
		? `\n\nSegment overview (use to ground the introduction):\n${hookSummary}`
		: '';
	return `You are hosting a podcast interview.
You are ${hostAName} (Host A), the interviewer. Your co-host is ${hostBName} (Host B).
Rules:
- Respond with ONLY the spoken line for ${hostAName}. No name labels, no quotes, no JSON, no stage directions.
- This is the HOOK turn for a brand-new topic. Briefly introduce the topic in 1-2 short sentences, conversational and inviting, without quoting the segment overview verbatim.
- Do not ask a question in this turn; the interviewer's first question follows in the next turn.${singularRules(hostBName)}${contextBlock}`;
}

/**
 * Returns the system prompt for an interview question turn.
 *
 * @param hostAName - The display name of Host A (interviewer).
 * @param hostBName - The display name of Host B (expert).
 * @param contextText - Optional reference material for grounding the question.
 * @param question - Optional forced question to pose.
 * @returns The formatted system prompt string.
 */
export function interviewQuestionSystemPrompt(
	hostAName: string,
	hostBName: string,
	contextText?: string,
	question?: string
): string {
	const forced = interviewForcedQuestionBlock(question);
	const contextBlock = interviewQuestionContextBlock(contextText);
	return `You are hosting a podcast interview.
You are ${hostAName} (Host A), the interviewer. Your co-host is ${hostBName} (Host B), the expert.
Rules:
- Respond with ONLY the spoken line for ${hostAName}. No name labels, no quotes, no JSON, no stage directions.
- Keep it to 2-3 sentences maximum.
- Ask a focused, insightful question that advances the discussion.${singularRules(hostBName)}${contextBlock}${forced}
- Always end with the question.
`;
}

/**
 * Returns the system prompt for an interview answer turn.
 *
 * @param hostAName - The display name of Host A (interviewer).
 * @param hostBName - The display name of Host B (expert).
 * @param contextText - Optional reference material for grounding the answer.
 * @returns The formatted system prompt string.
 */
export function interviewAnswerSystemPrompt(
	hostAName: string,
	hostBName: string,
	contextText?: string
): string {
	const contextBlock = interviewAnswerContextBlock(contextText);
	return `You are hosting a podcast interview.
You are ${hostBName} (Host B), the expert. Your co-host is ${hostAName} (Host A), the interviewer.
Rules:
- Respond with ONLY the spoken line for ${hostBName}. No name labels, no quotes, no JSON, no stage directions.
- Keep it to 2-3 sentences maximum.
- Answer the interviewer's most recent question with a clear, engaging reply grounded in the reference material.${singularRules(hostAName)}${contextBlock}`;
}

/**
 * Returns the user prompt for an interview turn.
 *
 * @param role - The current turn role: 'hook', 'question', or 'answer'.
 * @param transcript - Optional formatted transcript of previous exchanges.
 * @returns The user prompt string.
 */
export function interviewUserPrompt(
	role: 'hook' | 'question' | 'answer',
	transcript?: string
): string {
	if (!transcript) {
		if (role === 'hook') return 'Deliver your hook introducing the new topic.';
		if (role === 'question') return 'Open with your first interview question.';
		return 'Open with your first answer.';
	}
	if (role === 'hook') {
		return `Previous conversation:\n${transcript}\n\nDeliver your hook introducing the next topic.`;
	}
	return `Previous conversation:\n${transcript}\n\nIt is your turn now. Continue the conversation briefly and naturally.`;
}

// ─── Smalltalk generator prompts (standalone module) ─────────────────

/**
 * Returns the system prompt for a smalltalk hook turn.
 *
 * @param hostAName - The display name of Host A.
 * @param hostBName - The display name of Host B.
 * @param hookSummary - Optional summary for grounding the introduction.
 * @returns The formatted system prompt string.
 */
export function smalltalkHookSystemPrompt(
	hostAName: string,
	hostBName: string,
	hookSummary?: string
): string {
	const contextBlock = smalltalkHookSummaryBlock(hookSummary);
	return `You are hosting a casual podcast.
You are ${hostAName} (Host A). The other host is ${hostBName} (Host B).
Rules:
- Respond with ONLY the spoken line for ${hostAName}. No name labels, no quotes, no JSON, no stage directions.
- This is the HOOK for a new topic. Open casually in 1-2 short sentences, like a friend inviting your co-host to chat. Do not ask a question; that comes next.${contextBlock}`;
}

/**
 * Returns the system prompt for a smalltalk casual turn.
 *
 * @param hostAName - The display name of Host A.
 * @param hostBName - The display name of Host B.
 * @param contextText - Optional reference material.
 * @returns The formatted system prompt string.
 */
export function smalltalkCasualSystemPrompt(
	hostAName: string,
	hostBName: string,
	contextText?: string
): string {
	const contextBlock = smalltalkContextBlock(contextText);
	return `You are hosting a casual podcast.
You are one of the hosts (Host A is ${hostAName}, Host B is ${hostBName}).
Rules:
- Respond with ONLY your spoken line. No name labels, no quotes, no JSON, no stage directions.
- Keep it to 2-3 sentences maximum.
- Be conversational and natural, like two friends chatting.
- Build on what the other host just said.
- End your turn with a question, thought, or prompt for the other host to keep the conversation flowing.
- Keep it energetic and engaging.${contextBlock}`;
}

/**
 * Returns the user prompt for a smalltalk turn.
 *
 * @param role - The current turn role: 'hook' or 'casual'.
 * @param transcript - Optional formatted transcript of previous exchanges.
 * @returns The user prompt string.
 */
export function smalltalkUserPrompt(role: 'hook' | 'casual', transcript?: string): string {
	if (!transcript) {
		if (role === 'hook') return 'Deliver your hook introducing the new topic.';
		return 'Open the conversation with your opening line.';
	}
	if (role === 'hook') {
		return `Previous conversation:\n${transcript}\n\nDeliver your hook introducing the next topic.`;
	}
	return `Previous conversation:\n${transcript}\n\nContinue the conversation briefly and naturally.`;
}
