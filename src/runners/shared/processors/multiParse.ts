import type { MultiFieldSpec } from '@/lib/utils/gbnf';
import type { MultiChunkData } from './types';

const EMPTY_MULTI_DATA: MultiChunkData = { summary: [''], keywords: [], topics: [] };

function isJsonObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseJsonObject(raw: string): Record<string, unknown> | null {
	try {
		const parsed = JSON.parse(raw) as unknown;
		if (isJsonObject(parsed)) return parsed;
	} catch {
		// fall through to fence/prose salvage
	}

	const start = raw.indexOf('{');
	const end = raw.lastIndexOf('}');
	if (start === -1 || end <= start) return null;

	try {
		const parsed = JSON.parse(raw.slice(start, end + 1)) as unknown;
		return isJsonObject(parsed) ? parsed : null;
	} catch {
		return null;
	}
}

/**
 * Parse the model's multi-field JSON reply into chunk data.
 *
 * The llama-server path is grammar-constrained, but reasoner models may still
 * wrap the object in a fence or prose, and OpenRouter strips the grammar
 * entirely, so strict parsing first then the outermost `{...}` span.
 */
export function parseMultiFieldResponse(content: string, fields: MultiFieldSpec[]): MultiChunkData {
	const raw = content.trim();
	if (!raw) return { ...EMPTY_MULTI_DATA };

	const parsed = parseJsonObject(raw);
	if (!parsed) {
		console.warn('[multi] Failed to parse LLM response as JSON');
		return { ...EMPTY_MULTI_DATA };
	}

	const result: MultiChunkData = { summary: [], keywords: [], topics: [] };
	for (const field of fields) {
		const value = parsed[field.key];
		if (field.kind === 'string') {
			result[field.key as 'summary'] = [typeof value === 'string' ? value : ''];
		} else {
			const arr = Array.isArray(value)
				? [...new Set(value.map((v: unknown) => String(v).trim()))].filter(Boolean)
				: [];
			result[field.key as 'keywords' | 'topics'] = arr;
		}
	}
	return result;
}
