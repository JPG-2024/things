export interface TopicWithOffset {
	text: string;
	startOffset: number;
	endOffset: number;
}

interface AnalysisChunkLike {
	key?: { startOffset?: number; endOffset?: number };
	data?: unknown;
}

interface AnalysisChunkData {
	topics?: unknown;
}

export function extractTopicsFromAnalysis(data: unknown): TopicWithOffset[] {
	if (!data || typeof data !== 'object') return [];

	const chunks = (data as { chunks?: AnalysisChunkLike[] }).chunks;
	if (!Array.isArray(chunks)) return [];

	const result: TopicWithOffset[] = [];

	for (const chunk of chunks) {
		const key = chunk.key;
		if (!key || typeof key.startOffset !== 'number' || typeof key.endOffset !== 'number') {
			continue;
		}

		const chunkData = chunk.data as AnalysisChunkData | undefined;
		const topics = chunkData?.topics;
		if (!Array.isArray(topics)) continue;

		for (const topic of topics) {
			const text = String(topic).trim();
			if (!text) continue;
			result.push({
				text,
				startOffset: key.startOffset,
				endOffset: key.endOffset
			});
		}
	}

	return result;
}
