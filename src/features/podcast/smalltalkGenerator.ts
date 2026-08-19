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

export function planSmalltalkTopic(
	segment: Segment,
	hookEnabled: boolean,
	interactions: number
): TurnPlan[] {
	const plans: TurnPlan[] = [];
	if (hookEnabled) {
		plans.push({ role: 'hook', speaker: 'A' });
	}
	const pairs = Math.max(0, interactions);
	for (let i = 0; i < pairs; i++) {
		const speaker: 'A' | 'B' = i % 2 === 0 ? (hookEnabled ? 'B' : 'A') : hookEnabled ? 'A' : 'B';
		plans.push({ role: 'casual', speaker });
	}
	return plans;
}

function buildSystemPrompt(
	role: 'hook' | 'casual',
	segment: Segment,
	ctx: PodcastPromptContext
): string {
	if (role === 'hook') {
		const contextBlock = ctx.hookSummary ? `\n\nSegment overview:\n${ctx.hookSummary}` : '';
		return `You are hosting a casual podcast.
You are ${ctx.hostAName} (Host A). The other host is ${ctx.hostBName} (Host B).
Rules:
- Respond with ONLY the spoken line for ${ctx.hostAName}. No name labels, no quotes, no JSON, no stage directions.
- This is the HOOK for a new topic. Open casually in 1-2 short sentences, like a friend inviting your co-host to chat. Do not ask a question; that comes next.${contextBlock}`;
	}

	const contextBlock = ctx.contextText
		? `\n\nReference material (you may draw on it lightly, but stay casual):\n${capContext(ctx.contextText)}`
		: '';

	return `You are hosting a casual podcast.
You are one of the hosts (Host A is ${ctx.hostAName}, Host B is ${ctx.hostBName}).
Rules:
- Respond with ONLY your spoken line. No name labels, no quotes, no JSON, no stage directions.
- Keep it to 2-3 sentences maximum.
- Be conversational and natural, like two friends chatting.
- Build on what the other host just said.
- End your turn with a question, thought, or prompt for the other host to keep the conversation flowing.
- Keep it energetic and engaging.${contextBlock}`;
}

function buildUserPrompt(role: 'hook' | 'casual', previousExchanges: DialogExchange[]): string {
	if (previousExchanges.length === 0) {
		if (role === 'hook') return 'Deliver your hook introducing the new topic.';
		return 'Open the conversation with your opening line.';
	}
	const transcript = previousExchanges.map((e) => `Host ${e.speaker}: ${e.text}`).join('\n');
	if (role === 'hook') {
		return `Previous conversation:\n${transcript}\n\nDeliver your hook introducing the next topic.`;
	}
	return `Previous conversation:\n${transcript}\n\nContinue the conversation briefly and naturally.`;
}

export function buildSmalltalkPrompts(input: TurnPromptBuildInput): TurnPrompts {
	const { plan, ctx, previousExchanges, segment } = input;
	const role = plan.role as 'hook' | 'casual';
	return {
		systemPrompt: buildSystemPrompt(role, segment, ctx),
		userPrompt: buildUserPrompt(role, previousExchanges)
	};
}
