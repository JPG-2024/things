import type { HostPersona, SpeakerDynamics } from '../types';
import { capContext } from './shared';

const PREVIOUS_SCRIPT_CAP = 2000;

export interface ScriptPromptInput {
	topic: string;
	hostAName: string;
	hostBName: string;
	hostAPersona?: HostPersona;
	hostBPersona?: HostPersona;
	turnCount: number;
	turnLengthSentences: number;
	speakerDynamics: SpeakerDynamics;
	language?: string;
	context?: string;
	relatedContext?: string;
	previousScript?: string;
}

/**
 * Renders a character sheet block for one host in the script prompt.
 *
 * @param hostName - The display name of the host.
 * @param persona - The host persona fields.
 * @returns Formatted character sheet, or empty string if all fields are empty.
 */
function characterSheetBlock(hostName: string, persona: HostPersona | undefined): string {
	if (!persona) return '';
	const lines: string[] = [];
	if (persona.personality.trim()) lines.push(`  - Personality: ${persona.personality.trim()}`);
	if (persona.humorStyle.trim()) lines.push(`  - Humor: ${persona.humorStyle.trim()}`);
	if (persona.catchphrases.trim()) lines.push(`  - Catchphrases: ${persona.catchphrases.trim()}`);
	if (persona.speechQuirks.trim()) lines.push(`  - Speech quirks: ${persona.speechQuirks.trim()}`);
	if (lines.length === 0) return '';
	return `\n${hostName}'s character:\n${lines.join('\n')}`;
}

/**
 * Returns the system prompt for generating a full topic dialog script.
 *
 * Frames the LLM as a scriptwriter producing an entire multi-turn dialogue
 * in one response, with both host personas as character sheets.
 *
 * @param input - The script prompt parameters.
 * @returns The formatted system prompt string.
 */
export function scriptSystemPrompt(input: ScriptPromptInput): string {
	const {
		topic,
		hostAName,
		hostBName,
		hostAPersona,
		hostBPersona,
		turnCount,
		turnLengthSentences,
		speakerDynamics,
		language,
		context,
		relatedContext,
		previousScript
	} = input;

	const sheetA = characterSheetBlock(hostAName, hostAPersona);
	const sheetB = characterSheetBlock(hostBName, hostBPersona);

	const dynamicsRule =
		speakerDynamics === 'alternate'
			? '- Strictly alternate speakers, starting with Host A.'
			: '- Assign each turn to whichever host fits the flow best; do not force strict alternation.';

	const languageRule = language
		? `\n- Write ALL dialogue in ${language}, regardless of the language of the reference material, this prompt, or the style example.`
		: '';

	const styleExample =
		language === 'Spanish'
			? `A: A ver, explicame esto como si no supiera nada: ¿qué gano con una batería que dura más?
B: Simple: menos ansiedad. Dejás de mirar el porcentaje cada diez minutos.
A: Jaja, está bien, eso es verdad. ¿Pero no es solo marketing para venderte el modelo caro?
B: Un poco sí. Pero la diferencia existe: hoy una batería aguanta el doble de ciclos que hace cinco años.
A: O sea que no es humo. Me convenciste a medias.
B: Me conformo. El punto es que la tecnología maduró, aunque el marketing exagere.`
			: `A: Okay, explain this like I know nothing: what do I gain from a longer-lasting battery?
B: Simple: less anxiety. You stop checking the percentage every ten minutes.
A: Ha, fair, that's true. But isn't it just marketing to sell me the expensive model?
B: A little, yes. But the difference is real: today a battery handles twice the charge cycles of five years ago.
A: So it's not smoke. You half convinced me.
B: I'll take it. The point is the tech matured, even if the marketing exaggerates.`;

	const contextBlock = context
		? `\n\nReference material:\n${capContext(context)}\n\nGround the dialogue in this material: draw specific facts and ideas from it, but keep the conversation natural.`
		: '';

	const relatedBlock = relatedContext
		? `\n\nRelated material from another article (the hosts may bring it up as a contrasting viewpoint to debate):\n${capContext(relatedContext)}`
		: '';

	const previousBlock = previousScript
		? `\n\nA previous version of this script was rejected. Write a clearly different take on the same topic: new angles, new wording, no reused lines. Rejected script:\n${previousScript.length > PREVIOUS_SCRIPT_CAP ? previousScript.slice(0, PREVIOUS_SCRIPT_CAP) + '…' : previousScript}`
		: '';

	return `You are writing the script for one segment of a two-host podcast${language ? `, entirely in ${language}` : ''}.

Segment topic: "${topic}"

Host A is ${hostAName}.${sheetA}
Host B is ${hostBName}.${sheetB}

Rules:
- Write exactly ${turnCount} turns of dialogue.
- Each turn is about ${turnLengthSentences} sentences long.
${dynamicsRule}
- Format: one turn per line. Start every line with "A: " or "B: ". No quotes, no markdown, no stage directions, no narration.${languageRule}
- The reference material is SOURCE, not a script. Convert it into spoken dialogue. NEVER narrate, summarize or describe the material in third person (no "X claims that…", "the text highlights…", "this sets the stage…"). The hosts discuss the ideas directly, in first person.
- Write lines people would actually say out loud: natural reactions, spoken rhythm, interruptions like "wait, but…". Not written prose.
- Stay on the segment topic; never wander into unrelated subjects.
- Open the segment by introducing the topic naturally; close it with a brief takeaway.
- The hosts must sound DISTINCT from each other: different vocabulary, different energy, different opinions. Let their characters show in every turn.
- The hosts speak directly to each other (singular "you"), occasionally using each other's name. Never address the audience.

Style example (different subject, for tone only):
${styleExample}${contextBlock}${relatedBlock}${previousBlock}`;
}

/**
 * Returns the user message requesting the topic script.
 *
 * @param topic - The segment topic.
 * @param turnCount - Number of dialogue turns to write.
 * @returns The user prompt string.
 */
export function scriptUserPrompt(topic: string, turnCount: number): string {
	return `Write the ${turnCount}-turn script for the segment about "${topic}" now.`;
}

/**
 * Returns the correction message used when the first script attempt is unparseable.
 *
 * @param turnCount - Number of dialogue turns expected.
 * @returns The retry user prompt string.
 */
export function scriptRetryUserPrompt(turnCount: number): string {
	return `That was not a valid script. Respond with ONLY the dialogue lines, one turn per line, each line starting with "A: " or "B: ". Exactly ${turnCount} turns. No other text.`;
}
