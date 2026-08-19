import { chatCompletions } from '@/lib/utils/inference/chat-completions-provider';
import {
	extractTopicsSystemPrompt,
	extractTopicsUserPrompt,
	freeTopicsSystemPrompt,
	freeTopicsUserPrompt
} from './prompts';

export async function extractTopics(
	content: string,
	count: number,
	signal?: AbortSignal
): Promise<string[]> {
	const response = await chatCompletions(
		{
			messages: [
				{
					role: 'system',
					content: extractTopicsSystemPrompt(count)
				},
				{
					role: 'user',
					content: extractTopicsUserPrompt(content, count)
				}
			],
			response_format: {
				type: 'json_schema',
				json_schema: {
					name: 'topics',
					strict: true,
					schema: {
						type: 'object',
						properties: {
							topics: {
								type: 'array',
								items: { type: 'string' },
								minItems: count,
								maxItems: count
							}
						},
						required: ['topics'],
						additionalProperties: false
					}
				}
			},
			stream: false,
			temperature: 0.7
		},
		{ signal }
	);

	const text = response.choices?.[0]?.message?.content ?? '';
	const parsed = JSON.parse(text);
	if (!Array.isArray(parsed.topics)) {
		throw new Error('Invalid topics response: missing topics array');
	}
	return parsed.topics.map((t: unknown) => String(t).trim()).filter(Boolean);
}

export async function generateFreeTopics(count: number, signal?: AbortSignal): Promise<string[]> {
	const response = await chatCompletions(
		{
			messages: [
				{
					role: 'system',
					content: freeTopicsSystemPrompt(count)
				},
				{
					role: 'user',
					content: freeTopicsUserPrompt(count)
				}
			],
			response_format: {
				type: 'json_schema',
				json_schema: {
					name: 'topics',
					strict: true,
					schema: {
						type: 'object',
						properties: {
							topics: {
								type: 'array',
								items: { type: 'string' },
								minItems: count,
								maxItems: count
							}
						},
						required: ['topics'],
						additionalProperties: false
					}
				}
			},
			stream: false,
			temperature: 0.9
		},
		{ signal }
	);

	const text = response.choices?.[0]?.message?.content ?? '';
	const parsed = JSON.parse(text);
	if (!Array.isArray(parsed.topics)) {
		throw new Error('Invalid topics response: missing topics array');
	}
	return parsed.topics.map((t: unknown) => String(t).trim()).filter(Boolean);
}
