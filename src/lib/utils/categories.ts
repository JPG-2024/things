import type { WebStoreCategoryRecord } from '@/stores/webStore';

export function slugifyCategoryId(name: string): string {
	return name.trim().toLowerCase().replace(/\s+/g, '-');
}

export function resolveCategoryId(
	name: string,
	categories: WebStoreCategoryRecord[]
): string | null {
	const slug = slugifyCategoryId(name);
	if (!slug) return null;
	const match = categories.find((category) => category.id.toLowerCase() === slug);
	return match?.id ?? null;
}
