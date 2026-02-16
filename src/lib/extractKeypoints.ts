import { type JsonObject, type LlamaChatCompletionsRequest, chatCompletions } from '@/lib/utils/llama-completions';

const TRANSCRIPT_CHAR_LIMIT = 12_000;

const KEYWORDS_SCHEMA: JsonObject = {
	type: 'object',
	properties: {
		keywords: {
			type: 'array',
			items: { type: 'string' },
			minItems: 3,
			maxItems: 12,
		},
	},
	required: ['keywords'],
	additionalProperties: false,
};

const KEYWORDS_RESPONSE_FORMAT = {
	type: 'json_schema',
	json_schema: {
		name: 'keywords_response',
		strict: true,
		schema: KEYWORDS_SCHEMA,
	},
};

const KEYWORDS_SYSTEM_PROMPT =
	'You are a concise analyst whose only job is to return JSON with keywords derived from the transcript. Do not add any explanations.';

export async function extractKeypoints(
	transcript: string,
	baseUrl: string = 'http://localhost:8080',
): Promise<string[]> {
	const trimmedTranscript = transcript.trim();
	if (!trimmedTranscript) {
		return [];
	}


	const completionRequest: LlamaChatCompletionsRequest = {
		model: 'gpt-3.5-turbo',
		messages: [
			{ role: 'system', content: KEYWORDS_SYSTEM_PROMPT },
			{
				role: 'user',
				content: `Transcript:\n${trimmedTranscript}\n\nReturn the keywords array defined in the schema.`,
			},
		],
		temperature: 0.2,
		max_completion_tokens: 400,
		response_format: KEYWORDS_RESPONSE_FORMAT,
	};

	const response = await chatCompletions(completionRequest, baseUrl);
	const rawContent = response.choices[0]?.message?.content;
	if (!rawContent || typeof rawContent !== 'string') {
		return [];
	}

	let parsed: { keywords?: unknown };
	try {
		parsed = JSON.parse(rawContent);
	} catch (err) {
		throw new Error(`Failed to parse keywords response: ${(err as Error).message}`);
	}

	if (!Array.isArray(parsed?.keywords)) {
		return [];
	}

	return parsed.keywords
		.map((keyword) => String(keyword).trim())
		.filter((keyword) => keyword);
}