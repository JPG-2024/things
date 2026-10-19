import { uniqueStrings } from './analysisParse';
import type { TopicSection } from './types';

/**
 * Pure helpers for the analysisTopicSplit processor: tolerant parses of the
 * three LLM responses (topics+keywords, window summary, label consolidation).
 * Kept apart from `analysisTopicSplit.ts` (which drags stores and LLM
 * transports) so bun tests can import them, mirroring `analysisParse.ts`.
 */

export type SplitTopicsChunkData = {
	topics: TopicSection[];
	keywords: string[];
};

export type SplitSummaryChunkData = {
	title: string;
	summary: string;
};

/**
 * Salvages the first parseable JSON value from an LLM reply. Handles the
 * OpenRouter path, where the GBNF grammar is stripped and the reply may be
 * wrapped in a code fence or prose. Tries the whole text first, then the
 * outermost `{...}` / `[...]` spans (object payloads and bare arrays).
 */
function salvageJson(text: string): unknown {
	const raw = text.trim();
	if (!raw) return null;

	try {
		return JSON.parse(raw);
	} catch {
		// fall through to fence/prose salvage
	}

	const spans: [string, string][] = [
		['{', '}'],
		['[', ']']
	];
	for (const [open, close] of spans) {
		const start = raw.indexOf(open);
		const end = raw.lastIndexOf(close);
		if (start === -1 || end <= start) continue;
		try {
			return JSON.parse(raw.slice(start, end + 1));
		} catch {
			// try the next span candidate
		}
	}
	return null;
}

function toTopicsData(parsed: unknown): SplitTopicsChunkData {
	const empty: SplitTopicsChunkData = { topics: [], keywords: [] };
	if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return empty;
	const record = parsed as Record<string, unknown>;

	const topics: TopicSection[] = [];
	if (Array.isArray(record.topics)) {
		for (const entry of record.topics) {
			if (typeof entry !== 'object' || entry === null) continue;
			const { label, summary } = entry as Record<string, unknown>;
			if (typeof label !== 'string' || typeof summary !== 'string') continue;
			topics.push({ topic: label, summary });
		}
	}

	const keywords = Array.isArray(record.keywords)
		? uniqueStrings(record.keywords.filter((k): k is string => typeof k === 'string'))
		: [];

	return { topics, keywords };
}

function toSummaryData(parsed: unknown): SplitSummaryChunkData {
	const empty: SplitSummaryChunkData = { title: '', summary: '' };
	if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return empty;
	const record = parsed as Record<string, unknown>;

	return {
		title: typeof record.title === 'string' ? record.title : '',
		summary: typeof record.summary === 'string' ? record.summary : ''
	};
}

/**
 * Tolerant parse of the topics+keywords response. Transport errors are never
 * caught here; only unusable output falls back to the empty shape (no
 * retries, matching `parseAnalysisTopicResponse`).
 */
export function parseSplitTopicsResponse(text: string): SplitTopicsChunkData {
	return toTopicsData(salvageJson(text));
}

/**
 * Tolerant parse of the window summary response; unusable output yields the
 * empty shape so the other half of the chunk survives (per-side degradation).
 */
export function parseSplitSummaryResponse(text: string): SplitSummaryChunkData {
	return toSummaryData(salvageJson(text));
}

/**
 * Tolerant parse of the label-consolidation response: a bare JSON array with
 * exactly `count` labels, positionally aligned with the cluster list. Returns
 * null when the shape does not line up so the caller keeps the clustered
 * labels instead of shifting labels across clusters.
 */
export function parseSplitConsolidateResponse(text: string, count: number): string[] | null {
	const parsed = salvageJson(text);
	if (!Array.isArray(parsed)) return null;
	if (parsed.length !== count) return null;

	const labels: string[] = [];
	for (const entry of parsed) {
		if (typeof entry !== 'string') return null;
		labels.push(entry.trim());
	}
	return labels;
}
