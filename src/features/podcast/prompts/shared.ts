import type { HostPersona } from '../types';

export const CONTEXT_CAP = 6000;

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
 * Returns a persona block describing the host's character traits.
 *
 * Renders only non-empty fields. Returns empty string if all fields are empty.
 *
 * @param persona - The host persona with optional personality, humor, catchphrases, and quirks.
 * @returns Formatted block string, or empty if all fields are empty.
 */
export function hostPersonaBlock(persona: HostPersona | undefined): string {
	if (!persona) return '';
	const lines: string[] = [];
	if (persona.personality.trim()) lines.push(`Host personality: ${persona.personality.trim()}`);
	if (persona.humorStyle.trim()) lines.push(`Host humor style: ${persona.humorStyle.trim()}`);
	if (persona.catchphrases.trim()) lines.push(`Host catchphrases: ${persona.catchphrases.trim()}`);
	if (persona.speechQuirks.trim()) lines.push(`Host speech quirks: ${persona.speechQuirks.trim()}`);
	if (lines.length === 0) return '';
	return `\n\n${lines.join('\n')}`;
}
