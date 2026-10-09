import type { AnalysisTopicChunkData } from './types';

/**
 * Pure helpers for the analysisTopic processor: the tolerant LLM-output parse
 * and the deterministic fallback shaping. Kept apart from `analysisTopic.ts`
 * (which drags stores and LLM transports) so bun tests can import them.
 */

/**
 * Tolerant parse of the LLM response for the OpenRouter path, where the GBNF
 * grammar is stripped and the reply may be wrapped in a code fence or prose.
 * Transport errors are never caught here; only unusable output falls back to
 * the empty shape (no retries, matching `parseMultiFieldResponse`).
 */
export function parseAnalysisTopicResponse(text: string): AnalysisTopicChunkData {
	const empty: AnalysisTopicChunkData = {
		title: '',
		summary: '',
		topics: [],
		keywords: [],
		sections: []
	};

	let raw = text.trim();
	if (!raw) return empty;

	try {
		const parsed = JSON.parse(raw) as unknown;
		const result = toChunkData(parsed);
		if (result) return result;
	} catch {
		// fall through to fence/prose salvage
	}

	const start = raw.indexOf('{');
	const end = raw.lastIndexOf('}');
	if (start === -1 || end <= start) return empty;
	raw = raw.slice(start, end + 1);

	try {
		const parsed = JSON.parse(raw) as unknown;
		const result = toChunkData(parsed);
		if (result) return result;
	} catch {
		console.warn('[analysisTopic] Failed to parse LLM response as JSON');
	}
	return empty;
}

function toChunkData(parsed: unknown): AnalysisTopicChunkData | null {
	if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
	const record = parsed as Record<string, unknown>;

	const title = typeof record.title === 'string' ? record.title : '';
	const summary = typeof record.summary === 'string' ? record.summary : '';

	const topics: { topic: string; summary: string }[] = [];
	if (Array.isArray(record.topics)) {
		for (const entry of record.topics) {
			if (typeof entry !== 'object' || entry === null) continue;
			const { label, summary } = entry as Record<string, unknown>;
			if (typeof label !== 'string' || typeof summary !== 'string') continue;
			topics.push({ topic: label, summary });
		}
	}

	const uniqueKeywords = Array.isArray(record.keywords)
		? uniqueStrings(record.keywords.filter((k): k is string => typeof k === 'string'))
		: [];

	return {
		title,
		summary,
		topics: topics.map((t: { topic: string }) => t.topic),
		keywords: uniqueKeywords,
		sections: topics
	};
}

export function uniqueStrings(values: string[], key?: (value: string) => string): string[] {
	const seen = new Set<string>();
	const result: string[] = [];
	for (const raw of values) {
		const value = raw.trim();
		if (!value) continue;
		const lookup = key ? key(value) : value.toLowerCase();
		if (seen.has(lookup)) continue;
		seen.add(lookup);
		result.push(value);
	}
	return result;
}

/**
 * Heading-safe window title: strips markdown hashes, leading bullets and
 * quotes, keeps the first clause and caps length. Unlike `normalizeTopicLabel`
 * it does not append a trailing period, and an unusable value yields '' (the
 * fallback renders the window block without a heading).
 */
export function normalizeWindowTitle(raw: string): string {
	let title = raw
		.trim()
		.replace(/^#{1,6}\s*/, '')
		// Strip list markers only when the digits are followed by a delimiter,
		// so numbered titles ("5 Key Ideas", "2024 Election") survive intact.
		.replace(/^(?:[-*•]\s+|\d+[.)]\s+)+/, '')
		.replace(/^["'`]+|["'`]+$/g, '')
		.replace(/\s+/g, ' ')
		.replace(/[.;:!?,]+$/, '');

	title = title.split(/\s+[–—-]\s+/)[0].trim();

	const words = title.split(' ');
	if (words.length > 8) {
		title = words.slice(0, 8).join(' ');
	}
	if (title.length > 64) {
		title = title.slice(0, 64).trim();
	}
	return title;
}

export function mergeSummaries(summaries: string[]): string {
	const unique = uniqueStrings(summaries, (value) => value);
	return unique
		.filter((summary) => !unique.some((other) => other !== summary && other.includes(summary)))
		.join('\n\n');
}

/**
 * Builds the final summary as one block per window: `## title` above the
 * window's one-paragraph summary. A window with a summary but no title
 * renders as a bare paragraph, and a window with neither (legacy chunks or a
 * field-omitting model) falls back to its stitched topic summaries — also
 * heading-less, per the deterministic-fallback decision.
 */
export function buildWindowBlocks(results: AnalysisTopicChunkData[]): string {
	const blocks = results
		.map((result) => {
			const title = normalizeWindowTitle(result.title ?? '');
			let text = (result.summary ?? '').trim();
			if (!text) {
				text = mergeSummaries(result.sections.map((section) => section.summary)).trim();
			}
			if (!text) return '';
			return title ? `## ${title}\n\n${text}` : text;
		})
		.filter((block) => block);
	return blocks.join('\n\n');
}
