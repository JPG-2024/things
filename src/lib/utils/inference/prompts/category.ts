export function buildCategorySystemMessage(maxItems: number): string {
	const countPhrase = maxItems === 1 ? 'a single category name' : `${maxItems} category names`;
	return `You are a data extraction assistant. Return only a JSON array with exactly ${countPhrase}. No markdown, no explanations.`;
}

export function buildCategoryUserMessage(maxItems: number, listedNames: string[]): string {
	const countPhrase = maxItems === 1 ? 'a category' : `${maxItems} categories`;
	return `Give ${countPhrase} from this ones: ${listedNames.join(', ')}.`;
}
