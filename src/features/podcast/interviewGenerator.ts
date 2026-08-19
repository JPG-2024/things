import type {
	DialogExchange,
	Segment,
	TurnPlan,
	TurnPrompts,
	TurnPromptBuildInput,
	PodcastPromptContext
} from './types';

const CONTEXT_CAP = 6000;

function capContext(context: string): string {
	if (context.length <= CONTEXT_CAP) return context;
	return context.slice(0, CONTEXT_CAP) + '…';
}

export function planInterviewTopic(
	segment: Segment,
	hookEnabled: boolean,
	fallbackInteractions: number
): TurnPlan[] {
	const plans: TurnPlan[] = [];
	if (hookEnabled) {
		plans.push({ role: 'hook', speaker: 'A' });
	}
	const questionCount =
		segment.questions.length > 0 ? segment.questions.length : Math.max(0, fallbackInteractions);
	const pairs =
		segment.questions.length > 0
			? Math.min(segment.questions.length, fallbackInteractions || segment.questions.length)
			: questionCount;
	for (let i = 0; i < pairs; i++) {
		const question = segment.questions[i];
		plans.push({ role: 'question', speaker: 'A', question });
		plans.push({ role: 'answer', speaker: 'B' });
	}
	return plans;
}

function singularRules(otherName: string): string {
	return `
- Speak in singular form: address only your co-host directly, never "you all", "we", "everyone", or "guys". Avoid plural audience references.
- Optionally, you may naturally address the other host by name once in a while (e.g., "What do you think, ${otherName}?") to make it feel like a real two-person conversation, but do not overdo it.`;
}

function buildSystemPrompt(
	role: 'hook' | 'question' | 'answer',
	plan: TurnPlan,
	segment: Segment,
	ctx: PodcastPromptContext
): string {
	if (role === 'hook') {
		const contextBlock = ctx.hookSummary
			? `\n\nSegment overview (use to ground the introduction):\n${ctx.hookSummary}`
			: '';
		return `You are hosting a podcast interview.
You are ${ctx.hostAName} (Host A), the interviewer. Your co-host is ${ctx.hostBName} (Host B).
Rules:
- Respond with ONLY the spoken line for ${ctx.hostAName}. No name labels, no quotes, no JSON, no stage directions.
- This is the HOOK turn for a brand-new topic. Briefly introduce the topic in 1-2 short sentences, conversational and inviting, without quoting the segment overview verbatim.
- Do not ask a question in this turn; the interviewer's first question follows in the next turn.${singularRules(ctx.hostBName)}${contextBlock}`;
	}

	if (role === 'question') {
		const forced =
			plan.question !== undefined
				? `\n\nYou must pose this specific question to your co-host (you may rephrase it naturally but keep its meaning): "${plan.question}".`
				: '';
		const contextBlock = ctx.contextText
			? `\n\nReference material (ground your question in it; do not quote verbatim):\n${capContext(ctx.contextText)}`
			: '';
		return `You are hosting a podcast interview.
You are ${ctx.hostAName} (Host A), the interviewer. Your co-host is ${ctx.hostBName} (Host B), the expert.
Rules:
- Respond with ONLY the spoken line for ${ctx.hostAName}. No name labels, no quotes, no JSON, no stage directions.
- Keep it to 2-3 sentences maximum.
- Ask a focused, insightful question that advances the discussion.${singularRules(ctx.hostBName)}${contextBlock}${forced}
- Always end with the question.
`;
	}

	const contextBlock = ctx.contextText
		? `\n\nReference material (draw specific facts from it, but stay conversational):\n${capContext(ctx.contextText)}`
		: '';

	return `You are hosting a podcast interview.
You are ${ctx.hostBName} (Host B), the expert. Your co-host is ${ctx.hostAName} (Host A), the interviewer.
Rules:
- Respond with ONLY the spoken line for ${ctx.hostBName}. No name labels, no quotes, no JSON, no stage directions.
- Keep it to 2-3 sentences maximum.
- Answer the interviewer's most recent question with a clear, engaging reply grounded in the reference material.${singularRules(ctx.hostAName)}${contextBlock}`;
}

function buildUserPrompt(
	role: 'hook' | 'question' | 'answer',
	previousExchanges: DialogExchange[]
): string {
	if (previousExchanges.length === 0) {
		if (role === 'hook') return 'Deliver your hook introducing the new topic.';
		if (role === 'question') return 'Open with your first interview question.';
		return 'Open with your first answer.';
	}
	const transcript = previousExchanges.map((e) => `Host ${e.speaker}: ${e.text}`).join('\n');
	if (role === 'hook') {
		return `Previous conversation:\n${transcript}\n\nDeliver your hook introducing the next topic.`;
	}
	return `Previous conversation:\n${transcript}\n\nIt is your turn now. Continue the conversation briefly and naturally.`;
}

export function buildInterviewPrompts(input: TurnPromptBuildInput): TurnPrompts {
	const { plan, ctx, previousExchanges, segment } = input;
	const role = plan.role as 'hook' | 'question' | 'answer';
	return {
		systemPrompt: buildSystemPrompt(role, plan, segment, ctx),
		userPrompt: buildUserPrompt(role, previousExchanges)
	};
}
