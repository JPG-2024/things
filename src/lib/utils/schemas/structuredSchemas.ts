import type { LlamaResponseFormat } from '@/lib/utils/inference/llama-completions';

/**
 * Schema for the per-window questions call: exactly `count` questions the
 * window answers (bigger windows answer more). Sent as `response_format`,
 * which reaches every provider (llama converts it to a grammar internally;
 * OpenRouter/OpenCode forward it through the OpenAI SDK) and is backed by a
 * defensive parser either way.
 */
export function windowQuestionsSchema(count: number): LlamaResponseFormat {
	const safeCount = Math.max(1, Math.floor(count));
	return {
		type: 'json_schema',
		json_schema: {
			name: 'window_questions',
			strict: true,
			schema: {
				type: 'object',
				properties: {
					questions: {
						type: 'array',
						items: { type: 'string' },
						minItems: safeCount,
						maxItems: safeCount
					}
				},
				required: ['questions'],
				additionalProperties: false
			}
		}
	};
}

export const CONTENT_EXTRACTION_SCHEMA = {
	type: 'json_schema',
	json_schema: {
		name: 'info',
		schema: {
			properties: {
				dates: {
					title: 'Dates',
					type: 'string',
					description: 'Fechas relevantes del contenido.'
				},
				keywords: {
					title: 'Keywords',
					type: 'array',
					description: 'Keywords principales del contenido.'
				},
				category: {
					title: 'Category',
					type: 'string',
					description: 'La categoría a la que pertenece el contenido.',
					enum: ['Artificial Intelligence', 'Healthy', 'Programming', 'Games']
				}
			},
			required: ['keywords', 'category']
		}
	}
};
