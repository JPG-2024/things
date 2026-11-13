/**
 * Window QA — one question over a body too big for the model context.
 *
 * The full body is tried first: a single window *is* the whole article, and
 * its answer streams directly. When the model rejects the call for context
 * size, the run climbs the window-divisor ladder (`1 → 2 → 4 → 8 → 16`, the
 * same one `analyzeWindows` climbs): every window answers the question on its
 * own (cold calls, no streaming) and a final merge call combines the partial
 * answers into the streamed reply.
 */
import {
	MAX_WINDOW_DIVISOR,
	nextWindowDivisor,
	splitArticleIntoWindows,
	WINDOW_DIVISOR_LADDER
} from './windowAnalysis';
import { isContextSizeError } from '@/runners/shared/contextSizeError';
import { splitThoughtTags } from '@/lib/utils/reasoningTags';

/** Message shape accepted by a completion call. */
export interface QuestionMessage {
	role: 'system' | 'user' | 'assistant';
	content: string;
}

/** Call options of one completion: streaming callbacks matter on the final call. */
export interface QuestionCompletionOptions {
	signal?: AbortSignal;
	onToken?: (token: string) => void;
	onReasoningToken?: (token: string) => void;
}

/** One completion call, returning the full answer text. */
export type QuestionCompletionFn = (
	messages: QuestionMessage[],
	options: QuestionCompletionOptions
) => Promise<string>;

export interface AnswerWindowsOptions {
	/** Divisor to start from — the one a previous turn remembered. */
	startDivisor?: number;
	/** Conversation system prompt, reused by every call of the run. */
	systemPrompt?: string;
	/** Prior turns of the conversation, so follow-up questions keep their referents. */
	history?: QuestionMessage[];
	signal?: AbortSignal;
	/** Completion function; defaults to the app provider (imported lazily). */
	complete?: QuestionCompletionFn;
	/** Called once per attempt, before its first window call. */
	onAttempt?: (total: number) => void;
	/** Called after each window answers, to report progress. */
	onWindow?: (index: number, total: number) => void;
	/** Streaming of the final answer (the merge call, or the single window). */
	onToken?: (token: string) => void;
	onReasoningToken?: (token: string) => void;
}

export interface AnswerWindowsResult {
	answer: string;
	/** The divisor that was actually executed, so the caller can remember it. */
	divisor: number;
}

/**
 * Per-window question: the excerpt travels with the question, self-contained,
 * and a partial that has nothing to contribute says so instead of guessing.
 */
function windowUserContent(
	slice: { text: string },
	position: number,
	total: number,
	question: string
): string {
	return (
		`The text below is excerpt ${position + 1} of ${total} of a longer article. ` +
		'Answer the question from the excerpt; if it does not contain the answer, say so briefly.\n\n' +
		`Excerpt:\n${slice.text}\n\nQuestion: ${question}`
	);
}

/** Merge prompt: the partial answers travel labeled, in window order. */
function mergeUserContent(partials: string[], question: string): string {
	const blocks = partials
		.map((partial, i) => `[Part ${i + 1}/${partials.length}]\n${partial}`)
		.join('\n\n');
	return (
		'An article was searched in parts to answer a question; each part produced a partial answer.\n\n' +
		`${blocks}\n\nQuestion: ${question}\n\n` +
		'Merge the partial answers into one answer to the question; skip the parts that had nothing to contribute.'
	);
}

function buildMessages(
	systemPrompt: string,
	history: QuestionMessage[],
	userContent: string
): QuestionMessage[] {
	return [
		...(systemPrompt ? [{ role: 'system' as const, content: systemPrompt }] : []),
		...history,
		{ role: 'user', content: userContent }
	];
}

/** Clamps a remembered divisor onto the ladder: the first rung that fits it. */
function resolveStartDivisor(start: number | undefined): number {
	if (start === undefined || !Number.isFinite(start)) return WINDOW_DIVISOR_LADDER[0];
	return WINDOW_DIVISOR_LADDER.find((rung) => rung >= start) ?? MAX_WINDOW_DIVISOR;
}

function throwIfAborted(signal: AbortSignal | undefined): void {
	if (signal?.aborted) {
		throw new DOMException('Aborted', 'AbortError');
	}
}

/**
 * The app completion call, wired to the conversation preferences. The imports
 * are lazy so this module stays importable without the inference stack (the
 * tests inject their own completion function).
 */
async function defaultCompletion(
	messages: QuestionMessage[],
	options: QuestionCompletionOptions
): Promise<string> {
	const { chatCompletions } = await import('@/lib/utils/inference/chat-completions-provider');
	const { viewState } = await import('@/stores/viewStore.svelte');
	const response = await chatCompletions(
		{
			model: 'llama-server',
			messages,
			temperature: viewState.conversationTemperature,
			max_completion_tokens: viewState.conversationMaxTokens,
			top_p: viewState.conversationTopP,
			frequency_penalty: viewState.conversationFrequencyPenalty,
			presence_penalty: viewState.conversationPresencePenalty,
			reasoning_effort: viewState.chatReasoningEffort
		},
		options
	);
	const content = response.choices?.[0]?.message?.content;
	return typeof content === 'string' ? content : '';
}

/** One window, one answer. Thought tags are stripped so a partial never leaks reasoning into the merge prompt. */
async function askWindow(
	complete: QuestionCompletionFn,
	slice: { text: string },
	position: number,
	total: number,
	question: string,
	systemPrompt: string,
	history: QuestionMessage[],
	options: QuestionCompletionOptions
): Promise<string> {
	const text = await complete(
		buildMessages(systemPrompt, history, windowUserContent(slice, position, total, question)),
		options
	);
	return splitThoughtTags(text).content.trim();
}

/**
 * Answers one question over the body, climbing the divisor ladder on context
 * overflow. A single-window attempt streams directly; a multi-window attempt
 * answers per window (cold) and streams only the merge call.
 */
export async function answerWindows(
	content: string,
	question: string,
	options: AnswerWindowsOptions = {}
): Promise<AnswerWindowsResult> {
	const complete = options.complete ?? defaultCompletion;
	const systemPrompt = options.systemPrompt ?? '';
	const history = options.history ?? [];
	let divisor = resolveStartDivisor(options.startDivisor);

	while (true) {
		try {
			const slices = splitArticleIntoWindows(content, { divisor });
			if (slices.length === 0) return { answer: '', divisor };

			throwIfAborted(options.signal);
			options.onAttempt?.(slices.length);

			if (slices.length === 1) {
				// One window is the whole body: its answer *is* the final one,
				// streamed directly — there is no merge call to re-ask it.
				const answer = await askWindow(complete, slices[0], 0, 1, question, systemPrompt, history, {
					signal: options.signal,
					onToken: options.onToken,
					onReasoningToken: options.onReasoningToken
				});
				return { answer, divisor };
			}

			const partials: string[] = [];
			for (const [index, slice] of slices.entries()) {
				throwIfAborted(options.signal);
				const partial = await askWindow(
					complete,
					slice,
					index,
					slices.length,
					question,
					systemPrompt,
					history,
					{ signal: options.signal }
				);
				partials.push(partial);
				options.onWindow?.(index, slices.length);
			}

			const answer = await complete(
				buildMessages(systemPrompt, history, mergeUserContent(partials, question)),
				{
					signal: options.signal,
					onToken: options.onToken,
					onReasoningToken: options.onReasoningToken
				}
			);
			return { answer, divisor };
		} catch (error) {
			// An abort is not an overflow: rethrow it untouched.
			if (error instanceof Error && error.name === 'AbortError') throw error;

			if (!isContextSizeError(error)) throw error;
			const next = nextWindowDivisor(divisor);
			if (next === undefined) throw error;
			divisor = next;
		}
	}
}
