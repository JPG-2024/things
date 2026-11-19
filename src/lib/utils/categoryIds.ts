/** Helpers for the user-typed category ids of the auto-analysis exclusion list. */

/** Normalizes a list of ids: trims, drops empties and deduplicates. */
export function normalizeCategoryIds(ids: string[]): string[] {
	return [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
}

/**
 * Parses the free-text field from Settings. Accepts `2,34`, `2, 34` and the
 * bracketed form `[2, 34]`, so a user can paste a list straight from a note.
 */
export function parseCategoryIds(text: string): string[] {
	const unbracketed = text.trim().replace(/^\[/, '').replace(/\]$/, '');
	return normalizeCategoryIds(unbracketed.split(','));
}

/** True when a profile carries at least one of the excluded category ids. */
export function hasExcludedCategory(
	profileCategoryIds: string[],
	excludedCategoryIds: string[]
): boolean {
	return profileCategoryIds.some((id) => excludedCategoryIds.includes(id));
}
