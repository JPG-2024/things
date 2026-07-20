import { chatCompletions } from '@/lib/utils/inference/chat-completions-provider';
import { arrayToGbnf } from '@/lib/utils/gbnf';
import { parseStructuredArrayResponses } from '@/lib/utils/helpers/tasks';
import { viewState } from '@/stores/viewStore.svelte';

interface IaCategorizerOptions {
	data: string;
	choices: string[];
	numberResults: number | null;
}

const structuredOutputOptions = {
	temperature: 0.1,
	top_k: 40,
	min_p: 0.05,
	presence_penalty: 0,
	n_predict: 256,
	stream: false
} as const;

export async function iaCategorizer(options: IaCategorizerOptions): Promise<string[]> {
	const { data, choices, numberResults } = options;
	const count = numberResults ?? 1;

	const response = await chatCompletions({
		model: viewState.aiModel,
		...structuredOutputOptions,
		grammar: arrayToGbnf(choices, { minItems: count, maxItems: count }),
		messages: [
			{
				role: 'system',
				content:
					'You are a data extraction assistant. Return only a JSON array with the selected items. No markdown, no explanations.'
			},
			{ role: 'user', content: data }
		]
	});

	const rawContent = response.choices?.[0]?.message?.content ?? '';
	const content = typeof rawContent === 'string' ? rawContent : '';
	return parseStructuredArrayResponses(content);
}
