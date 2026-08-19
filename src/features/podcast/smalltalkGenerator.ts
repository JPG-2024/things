import type { Segment, TurnPlan, TurnPrompts, TurnPromptBuildInput } from './types';
import {
	formatTranscript,
	smalltalkHookSystemPrompt,
	smalltalkCasualSystemPrompt,
	smalltalkUserPrompt
} from './prompts';

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

/**
 * Constructs the system prompt for the LLM based on the current turn role.
 *
 * @param role - The type of turn: 'hook' or 'casual'.
 * @param ctx - The podcast prompt context with host names and context text.
 * @returns The formatted system prompt string.
 */
function buildSystemPrompt(
	role: 'hook' | 'casual',
	ctx: { hostAName: string; hostBName: string; contextText?: string; hookSummary?: string }
): string {
	if (role === 'hook') {
		return smalltalkHookSystemPrompt(ctx.hostAName, ctx.hostBName, ctx.hookSummary);
	}
	return smalltalkCasualSystemPrompt(ctx.hostAName, ctx.hostBName, ctx.contextText);
}

/**
 * Constructs the user prompt with conversation history for the LLM.
 *
 * @param role - The current turn role: 'hook' or 'casual'.
 * @param previousExchanges - Array of prior dialog exchanges for context.
 * @returns The formatted user prompt string.
 */
function buildUserPrompt(
	role: 'hook' | 'casual',
	previousExchanges: { speaker: string; text: string }[]
): string {
	const transcript = previousExchanges.length > 0 ? formatTranscript(previousExchanges) : undefined;
	return smalltalkUserPrompt(role, transcript);
}

/**
 * Main entry point for building smalltalk prompts.
 *
 * Combines system and user prompts for the current turn based on the plan,
 * context, and conversation history.
 *
 * @param input - The turn prompt build input containing plan, segment, context, and history.
 * @returns Object with systemPrompt and userPrompt strings.
 */
export function buildSmalltalkPrompts(input: TurnPromptBuildInput): TurnPrompts {
	const { plan, ctx, previousExchanges } = input;
	const role = plan.role as 'hook' | 'casual';
	return {
		systemPrompt: buildSystemPrompt(role, ctx),
		userPrompt: buildUserPrompt(role, previousExchanges)
	};
}
