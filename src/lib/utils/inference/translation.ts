import { chatCompletions } from '@/lib/utils/inference/chat-completions-provider';
import { viewState } from '@/stores/viewStore.svelte';
import { LANG_NAMES } from '@/constants';

export async function translateText(text: string, targetLang: string): Promise<string> {
	const langName = LANG_NAMES[targetLang] ?? targetLang;
	const response = await chatCompletions({
		model: viewState.aiModel,
		stream: false,
		messages: [
			{
				role: 'system',
				content: `Translate the following text to ${langName}. Return only the translated text, nothing else.`
			},
			{ role: 'user', content: text }
		]
	});
	const rawContent = response.choices?.[0]?.message?.content ?? text;
	return typeof rawContent === 'string' ? rawContent : text;
}
