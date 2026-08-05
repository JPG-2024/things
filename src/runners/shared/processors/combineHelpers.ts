import type { CombineMode } from './types';

export type CombineOptions = {
	mode: CombineMode;
	separator?: string;
};

export function combineResults(results: string[], options: CombineOptions): string {
	const sep = options.separator ?? '\n\n';
	if (options.mode === 'dedupe') {
		return [...new Set(results)].join(sep);
	}
	return results.join(sep);
}

export function parseAndFlattenJsonArrays(results: string[]): string[] {
	const flat: string[] = [];
	for (const r of results) {
		try {
			const parsed = JSON.parse(r);
			if (Array.isArray(parsed)) {
				flat.push(...parsed);
			} else {
				flat.push(r);
			}
		} catch {
			flat.push(r);
		}
	}
	return flat;
}
