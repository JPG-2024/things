import { chatCompletions } from '@/lib/utils/inference/chat-completions-provider';

const SUMMARY_CAP = 8000;

export async function generateTopicSummary(
	topic: string,
	content: string,
	signal?: AbortSignal
): Promise<string> {
	const capped = content.length > SUMMARY_CAP ? content.slice(0, SUMMARY_CAP) + '…' : content;

	const response = await chatCompletions(
		{
			messages: [
				{
					role: 'system',
					content: `You are a research assistant preparing briefing notes for a podcast. Given the source content and a specific topic, write a concise factual summary of the source material that is relevant to the topic. Include key facts, figures, context, and viewpoints the hosts can reference. Keep it focused and under 400 words. Respond with plain text only, no headings or markdown.`
				},
				{
					role: 'user',
					content: `Topic: ${topic}\n\nSource content:\n${capped}`
				}
			],
			stream: false,
			temperature: 0.3
		},
		{ signal }
	);

	const rawContent = response.choices?.[0]?.message?.content;
	const text = typeof rawContent === 'string' ? rawContent : '';
	return text.trim();
}
