export function recomputeChunkOffsets(
	decodedChunks: (AudioBuffer | null)[],
	pauseAfter: (index: number) => number
): number[] {
	const offsets: number[] = [];
	let cumulative = 0;
	const count = decodedChunks.length;
	for (let i = 0; i < count; i++) {
		offsets.push(cumulative);
		cumulative += decodedChunks[i]?.duration ?? 0;
		if (i < count - 1) {
			cumulative += pauseAfter(i);
		}
	}
	return offsets;
}

export function computeTotalDuration(
	decodedChunks: (AudioBuffer | null)[],
	pauseAfter: (index: number) => number
): number {
	let total = 0;
	const count = decodedChunks.length;
	for (let i = 0; i < count; i++) {
		total += decodedChunks[i]?.duration ?? 0;
		if (i < count - 1) {
			total += pauseAfter(i);
		}
	}
	return total;
}

export function findChunkAtTime(
	chunkOffsets: number[],
	globalTime: number
): { chunkIndex: number; offsetInChunk: number } {
	for (let i = chunkOffsets.length - 1; i >= 0; i--) {
		if (chunkOffsets[i] <= globalTime) {
			return { chunkIndex: i, offsetInChunk: globalTime - chunkOffsets[i] };
		}
	}
	return { chunkIndex: 0, offsetInChunk: 0 };
}

export function formatTime(seconds: number): string {
	const m = Math.floor(seconds / 60);
	const s = seconds % 60;
	return `${m}:${s.toString().padStart(2, '0')}`;
}
