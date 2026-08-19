import type { Segment, TurnPlan, TurnPrompts, TurnPromptBuildInput } from './types';
import {
	formatTranscript,
	interviewHookSystemPrompt,
	interviewQuestionSystemPrompt,
	interviewAnswerSystemPrompt,
	interviewUserPrompt
} from './prompts';

/**
 * Builds a turn plan array for an interview segment.
 *
 * Generates a sequence of hook, question, and answer turns based on the segment's
 * questions and the configured interaction count.
 *
 * @param segment - The segment containing topic and questions.
 * @param hookEnabled - Whether to include an opening hook turn.
 * @param fallbackInteractions - Default number of Q&A pairs when segment has no questions.
 * @returns Array of TurnPlan objects describing each turn's role and speaker.
 */
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

/**
 * Constructs the system prompt for the LLM based on the current turn role.
 *
 * @param role - The type of turn: 'hook', 'question', or 'answer'.
 * @param plan - The turn plan containing role and optional question.
 * @param ctx - The podcast prompt context with host names and context text.
 * @returns The formatted system prompt string.
 */
function buildSystemPrompt(
	role: 'hook' | 'question' | 'answer',
	plan: TurnPlan,
	ctx: { hostAName: string; hostBName: string; contextText?: string; hookSummary?: string }
): string {
	if (role === 'hook') {
		return interviewHookSystemPrompt(ctx.hostAName, ctx.hostBName, ctx.hookSummary);
	}

	if (role === 'question') {
		return interviewQuestionSystemPrompt(
			ctx.hostAName,
			ctx.hostBName,
			ctx.contextText,
			plan.question
		);
	}

	return interviewAnswerSystemPrompt(ctx.hostAName, ctx.hostBName, ctx.contextText);
}

/**
 * Constructs the user prompt with conversation history for the LLM.
 *
 * @param role - The current turn role: 'hook', 'question', or 'answer'.
 * @param previousExchanges - Array of prior dialog exchanges for context.
 * @returns The formatted user prompt string with transcript and turn instruction.
 */
function buildUserPrompt(
	role: 'hook' | 'question' | 'answer',
	previousExchanges: { speaker: string; text: string }[]
): string {
	const transcript = previousExchanges.length > 0 ? formatTranscript(previousExchanges) : undefined;
	return interviewUserPrompt(role, transcript);
}

/**
 * Main entry point for building interview prompts.
 *
 * Combines system and user prompts for the current turn based on the plan,
 * context, and conversation history.
 *
 * @param input - The turn prompt build input containing plan, segment, context, and history.
 * @returns Object with systemPrompt and userPrompt strings.
 */
export function buildInterviewPrompts(input: TurnPromptBuildInput): TurnPrompts {
	const { plan, ctx, previousExchanges } = input;
	const role = plan.role as 'hook' | 'question' | 'answer';
	return {
		systemPrompt: buildSystemPrompt(role, plan, ctx),
		userPrompt: buildUserPrompt(role, previousExchanges)
	};
}
