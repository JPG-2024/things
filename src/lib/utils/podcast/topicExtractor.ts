import { chatCompletions } from '@/lib/utils/inference/chat-completions-provider';

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
					content: `You are a content analyst. Extract exactly ${count} distinct discussion topics from the provided content. Topics should be specific enough for a brief podcast discussion. Each topic should be a concise phrase (5-10 words). Return only valid JSON matching the schema.`
				},
				{
					role: 'user',
					content: `Content:\n${content}\n\nExtract exactly ${count} topics.`
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
