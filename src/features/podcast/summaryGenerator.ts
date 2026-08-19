import { chatCompletions } from '@/lib/utils/inference/chat-completions-provider';
import {
	topicSummarySystemPrompt,
	topicSummaryUserPrompt,
	chunkSummarySystemPrompt,
	chunkSummaryUserPrompt
} from './prompts';

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
					content: topicSummarySystemPrompt()
				},
				{
					role: 'user',
					content: topicSummaryUserPrompt(topic, capped)
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

export async function generateChunkSummary(content: string, signal?: AbortSignal): Promise<string> {
	const response = await chatCompletions(
		{
			messages: [
				{
					role: 'system',
					content: chunkSummarySystemPrompt()
				},
				{
					role: 'user',
					content: chunkSummaryUserPrompt(content)
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
