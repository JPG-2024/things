/**
 * Returns the default system prompt template for episode hooks.
 *
 * @param kind - The hook type: 'initial' for opening or 'final' for closing.
 * @param personaBlock - Optional persona block to inject.
 * @returns Prompt template string with __NAME__ and __SPEAKER__ placeholders.
 */
export function hookSystemPrompt(kind: 'initial' | 'final', personaBlock?: string): string {
	if (kind === 'final') {
		return `You are closing a podcast episode.
You are ${'__NAME__'} (Host ${'__SPEAKER__'}).${personaBlock ?? ''}
Rules:
- Respond with ONLY the spoken line for ${'__NAME__'}. No name labels, no quotes, no JSON, no stage directions.
- Keep it to 2-3 sentences maximum.
- Warmly wrap up the episode, thank the audience, and hint at what comes next. Do not introduce new topics.
- Do not ask any questions. Deliver a statement, never a question.`;
	}
	return `You are opening a podcast episode.
You are ${'__NAME__'} (Host ${'__SPEAKER__'}).${personaBlock ?? ''}
Rules:
- Respond with ONLY the spoken line for ${'__NAME__'}. No name labels, no quotes, no JSON, no stage directions.
- Keep it to 2-3 sentences maximum.
- Welcome the audience and set expectations for the episode. Do not ask a question yet.`;
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
	return 'Deliver your closing remarks to wrap up the episode.';
}
