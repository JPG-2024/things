export function buildExtractionSystemMessage(count: number, description: string): string {
	return `You are a data extraction assistant. Return only a JSON array of exactly ${count} ${description}. No markdown, no explanations.`;
}

export function buildExtractionUserMessage(count: number, description: string): string {
	return `Extract ${count} ${description}. Respond in JSON format.`;
}

export const RECURSIVE_EXTRACTION_USER_MESSAGE = 'Extract items from this content.';

export const RECURSIVE_EXTRACTION_FINAL_USER_MESSAGE =
	'From this list of extracted items, pick the most relevant ones. Return a JSON array.';
