import { SIMPLE_SUMMARY_SYSTEM_PROMPT_EN, SIMPLE_SUMMARY_SYSTEM_PROMPT_ES } from '@/constants';
import { chatCompletions } from '@/lib/utils/llama-completions';
import type { ChapterCaption } from './joinCaptionsByChapters';

export type ChapterSummaryItem = {
	title: string;
	startTime: ChapterCaption['startTime'];
	summary: string;
};

export async function summarizeChapters(
	chapterCaptions: ChapterCaption[],
	language: string
): Promise<ChapterSummaryItem[]> {
	const summaries: ChapterSummaryItem[] = [];

	for (const chapter of chapterCaptions) {
		const systemPrompt =
			language === 'es' ? SIMPLE_SUMMARY_SYSTEM_PROMPT_ES : SIMPLE_SUMMARY_SYSTEM_PROMPT_EN;

		const summaryPrompt =
			language === 'es'
				? `Resume este capitulo de manera concisa y clara:\n\n${chapter.content}`
				: `Summarize this chapter concisely and clearly:\n\n${chapter.content}`;

		const response = await chatCompletions({
			model: 'gpt-3.5-turbo',
			messages: [
				{ role: 'system', content: systemPrompt },
				{ role: 'user', content: summaryPrompt }
			],
			temperature: 0.7,
			stream: false
		});

		const summary = String(response.choices[0]?.message?.content || '');
		summaries.push({
			title: chapter.title,
			startTime: chapter.startTime,
			summary
		});
	}

	return summaries;
}
