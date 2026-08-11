import { chatCompletions } from '@/lib/utils/inference/chat-completions-provider';
import { DEFAULT_TITLE_COMPLETION_OPTIONS } from '@/lib/utils/inference/constants';
import { viewState } from '@/stores/viewStore.svelte';

export async function inferenceTitle(
	content: string,
	options: { emoji: boolean; words: number }
): Promise<string> {
	const emojiInstruction = options.emoji ? 'Start with an emoji.' : '';

	const response = await chatCompletions({
		model: viewState.aiModel,
		...DEFAULT_TITLE_COMPLETION_OPTIONS,
		messages: [
			{ role: 'system', content: 'Avoid Markdown. You are a prompt intention extractor' },
			{
				role: 'user',
				content: `Extract the prompt intention. No more than ${options.words} words. ${emojiInstruction} \n\n prompt: ${content}`
			}
		]
	});

	return response.choices?.[0]?.message?.content?.toString()?.trim() ?? '';
}
