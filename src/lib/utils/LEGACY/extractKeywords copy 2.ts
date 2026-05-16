import ollama from 'ollama';
import z from 'zod';

export async function extractKeywords(
	content: string,
	config: { maxKeywords?: number } = { maxKeywords: 10 }
): Promise<any> {
	const schema = z.object({
		keywords: z.array(z.string()),
		summary: z.string().optional()
	});

	const response = await ollama.chat({
		model: 'gpt-oss',
		format: 'json',
		messages: [
			{
				role: 'system',
				content: `You must respond using the following JSON schema.

{
  "response_format": {
    "type": "json",
    "schema": {
      "type": "object",
      "properties": {
        "keywords": {
          "type": "array",
          "description": "Lista de palabras clave extraídas del mensaje del usuario.",
          "items": {
            "type": "string",
            "description": "Una palabra clave individual."
          }
        },
        "summary": {
          "type": "string",
          "description": "Un resumen breve del contenido del mensaje del usuario."
        }
      },
      "required": ["keywords", "summary"]
    }
  }
}`
			},
			{
				role: 'user',
				content: `make a summary and extract keywords: \n\n${content}`
			}
		]
	});

	const parsed = schema.safeParse(JSON.parse(response.message.content));
	if (!parsed.success) {
		return [];
	}
	// const keywords = parsed.data.keywords.slice(0, config.maxKeywords ?? 10);
	return parsed;
}
