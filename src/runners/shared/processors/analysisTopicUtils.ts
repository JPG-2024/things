import type { TopicSection } from './types';

export const MAX_SUMMARIES_PER_CLUSTER_CHARS = 1500;

const NO_MENTION_RE = /^\s*no specific mention\.?\s*$/i;

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

export function cosineSimilarity(a: number[], b: number[]): number {
	let dot = 0;
	let normA = 0;
	let normB = 0;
	const length = Math.min(a.length, b.length);
	for (let i = 0; i < length; i++) {
		dot += a[i] * b[i];
		normA += a[i] * a[i];
		normB += b[i] * b[i];
	}
	if (normA === 0 || normB === 0) return 0;
	return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export function tokenize(value: string): string[] {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9\u00c0-\u024f\u4e00-\u9fff\s]/gi, ' ')
		.split(/\s+/)
		.filter(Boolean);
}

export function tokenOverlap(a: string, b: string): number {
	const tokensA = new Set(tokenize(a));
	const tokensB = new Set(tokenize(b));
	if (tokensA.size === 0 || tokensB.size === 0) return 0;
	let inter = 0;
	for (const t of tokensA) if (tokensB.has(t)) inter++;
	return inter / Math.max(tokensA.size, tokensB.size);
}

export function levenshtein(a: string, b: string): number {
	if (a === b) return 0;
	if (a.length === 0) return b.length;
	if (b.length === 0) return a.length;
	const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
	for (let i = 1; i <= a.length; i++) {
		let carry = prev[0];
		prev[0] = i;
		for (let j = 1; j <= b.length; j++) {
			const next = prev[j];
			prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, carry + (a[i - 1] === b[j - 1] ? 0 : 1));
			carry = next;
		}
	}
	return prev[b.length];
}

/** Lowercase, strip trailing punctuation/period, collapse whitespace. */
export function normalizeForMatch(raw: string): string {
	return raw
		.trim()
		.toLowerCase()
		.replace(/^[-*•\d.)\s]+/, '')
		.replace(/^["'`]+|["'`]+$/g, '')
		.replace(/\s+/g, ' ')
		.replace(/[.;:!?,]+$/, '')
		.trim();
}

export function stripHeaderPeriod(topic: string): string {
	return topic.trim().replace(/[.]+$/, '');
}

/**
 * Idempotent code guarantee that a topic data value ends with a single dot.
 * Only trailing dots/whitespace are collapsed; other punctuation is preserved
 * (e.g. "What?" becomes "What?."). Empty or dot-only input returns ''.
 */
export function ensureTopicPeriod(topic: string): string {
	const trimmed = topic.trim();
	if (!trimmed) return '';
	const core = trimmed.replace(/[.\s]+$/, '');
	if (!core) return '';
	return `${core}.`;
}

export function isNoMention(summary: string): boolean {
	return NO_MENTION_RE.test(summary.trim());
}

/**
 * Scale requested item counts to chunk length so short chunks don't force
 * filler topics/keywords out of small models.
 */
export function clampCountForChunk(chunk: string, requested: number, charsPerItem: number): number {
	const text = chunk.trim();
	if (!text) return 0;
	const capped = Math.max(1, Math.trunc(requested));
	const byLength = Math.max(1, Math.ceil(text.length / Math.max(200, charsPerItem)));
	return Math.min(capped, byLength);
}

export function firstSentenceFallback(chunk: string, maxWords: number): string {
	const first = chunk
		.trim()
		.split(/(?<=[.!?])\s+|\n+/)[0]
		?.trim()
		.replace(/\s+/g, ' ');
	if (!first) return '';
	return normalizeTopicLabel(first, maxWords);
}

export type TopicCluster = {
	label: string;
	labels: string[];
	embedding: number[];
	members: number;
	summaries: string[];
};

export function averageInto(centroid: number[], members: number, next: number[]): number[] {
	if (centroid.length !== next.length || centroid.length === 0) return [...next];
	return centroid.map((v, i) => (v * members + next[i]) / (members + 1));
}

export function pickBestLabel(labels: string[]): string {
	if (labels.length === 0) return '';
	if (labels.length === 1) return ensureTopicPeriod(labels[0]);
	let best = labels[0];
	let bestScore = -1;
	for (const candidate of labels) {
		let total = 0;
		for (const other of labels) {
			if (other === candidate) continue;
			total += tokenOverlap(candidate, other);
		}
		const avg = total / (labels.length - 1);
		const score = avg - candidate.length / 1000;
		if (score > bestScore) {
			bestScore = score;
			best = candidate;
		}
	}
	return ensureTopicPeriod(best);
}

export function clusterByEmbedding(
	sections: TopicSection[],
	embeddings: number[][],
	threshold: number
): TopicCluster[] {
	const clusters: TopicCluster[] = [];
	for (let i = 0; i < sections.length; i++) {
		const section = sections[i];
		const embedding = embeddings[i] ?? [];
		let target: TopicCluster | null = null;
		let bestScore = threshold;
		for (const cluster of clusters) {
			const score = cosineSimilarity(embedding, cluster.embedding);
			if (score >= bestScore) {
				bestScore = score;
				target = cluster;
			}
		}
		if (target) {
			target.summaries.push(section.summary);
			target.labels.push(ensureTopicPeriod(section.topic));
			target.embedding = averageInto(target.embedding, target.members, embedding);
			target.members += 1;
			target.label = pickBestLabel(target.labels);
		} else {
			clusters.push({
				label: ensureTopicPeriod(section.topic),
				labels: [ensureTopicPeriod(section.topic)],
				embedding,
				members: 1,
				summaries: [section.summary]
			});
		}
	}
	return clusters;
}

/**
 * Deterministic fallback when embeddings are unavailable. Merges on normalized
 * form first, then token overlap / small edit distance for paraphrases.
 */
export function clusterFuzzyByLabel(sections: TopicSection[]): TopicCluster[] {
	const clusters: TopicCluster[] = [];
	for (const section of sections) {
		const key = normalizeForMatch(section.topic);
		if (!key) continue;
		let target: TopicCluster | null = null;
		for (const cluster of clusters) {
			const clusterKey = normalizeForMatch(cluster.label);
			if (clusterKey === key) {
				target = cluster;
				break;
			}
			if (tokenOverlap(key, clusterKey) >= 0.6) {
				target = cluster;
				break;
			}
			const distance = levenshtein(key, clusterKey);
			const longest = Math.max(key.length, clusterKey.length);
			if (longest > 0 && longest <= 48 && distance <= 2) {
				target = cluster;
				break;
			}
		}
		if (target) {
			target.summaries.push(section.summary);
			target.labels.push(ensureTopicPeriod(section.topic));
			target.label = pickBestLabel(target.labels);
		} else {
			clusters.push({
				label: ensureTopicPeriod(section.topic),
				labels: [ensureTopicPeriod(section.topic)],
				embedding: [],
				members: 1,
				summaries: [section.summary]
			});
		}
	}
	return clusters;
}

/**
 * Shrinks a raw topic label to a short, sentence-safe form.
 *
 * The LLM is asked for short labels, but nothing guarantees it, so this is the
 * deterministic backstop: strip leading bullets/quotes, keep only the first
 * clause, cap words and characters, and end with a single period.
 */
export function normalizeTopicLabel(raw: string, maxWords: number): string {
	let label = raw
		.trim()
		.replace(/^[-*•\d.)\s]+/, '')
		.replace(/^["'`]+|["'`]+$/g, '')
		.replace(/\s+/g, ' ')
		.replace(/[.;:!?,]+$/, '');

	label = label.split(/\s+[–—-]\s+|\s*:\s+/)[0].trim();

	const words = label.split(' ');
	if (words.length > maxWords) {
		label = words.slice(0, maxWords).join(' ');
	}

	// Characters are a language-safe backstop (CJK has no word spaces).
	const maxChars = Math.max(24, maxWords * 10);
	if (label.length > maxChars) {
		const clipped = label.slice(0, maxChars);
		const lastSpace = clipped.lastIndexOf(' ');
		label = (lastSpace > 0 ? clipped.slice(0, lastSpace) : clipped).trim();
	}

	return ensureTopicPeriod(label);
}

export function mergeSummaries(summaries: string[]): string {
	const cleaned = uniqueStrings(
		summaries.map((s) => s.trim()).filter((s) => s && !isNoMention(s)),
		(value) => value.toLowerCase()
	);
	const kept: string[] = [];
	for (const candidate of cleaned) {
		let duplicate = false;
		for (const existing of kept) {
			if (tokenOverlap(candidate, existing) >= 0.85) {
				duplicate = true;
				break;
			}
			if (existing.includes(candidate) && candidate.length < 80) {
				duplicate = true;
				break;
			}
		}
		if (!duplicate) kept.push(candidate);
	}
	let joined = kept.join('\n\n');
	if (joined.length > MAX_SUMMARIES_PER_CLUSTER_CHARS) {
		const clipped = joined.slice(0, MAX_SUMMARIES_PER_CLUSTER_CHARS);
		const lastBreak = Math.max(clipped.lastIndexOf('\n\n'), clipped.lastIndexOf('. '));
		joined = (lastBreak > 200 ? clipped.slice(0, lastBreak + 1) : clipped).trim();
	}
	return joined;
}

export function buildEmbeddingInput(section: TopicSection): string {
	const label = stripHeaderPeriod(section.topic);
	const snippet = section.summary.trim().slice(0, 200);
	return snippet ? `${label}: ${snippet}` : label;
}

export function buildBlog(clusters: TopicCluster[]): {
	markdown: string;
	sections: TopicSection[];
} {
	const sections: TopicSection[] = clusters.map((cluster) => ({
		topic: ensureTopicPeriod(cluster.label),
		summary: mergeSummaries(cluster.summaries)
	}));
	const markdown = sections
		.filter((section) => section.summary)
		.map((section) => `## ${ensureTopicPeriod(section.topic)}\n\n${section.summary}`)
		.join('\n\n');
	return { markdown, sections };
}
