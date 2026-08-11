const MIN_CHUNK_CHARS = 50;

export type EmbeddingChunk = {
	text: string;
	index: number;
	startOffset: number;
	endOffset: number;
};

export type SplitForEmbeddingsOptions = {
	windowSize: number;
	overlap: number;
	respectBoundaries?: boolean;
};

export function splitTextIntoChunks(text: string, level = 0): string[] {
	const trimmed = text.trim();
	if (!trimmed) return [];

	const paragraphs = splitByParagraphs(trimmed);

	if (level === 0) {
		if (paragraphs.length > 1) {
			return mergeSmallChunks(paragraphs);
		}

		const sentences = splitBySentences(trimmed);
		if (sentences.length > 1) {
			return mergeSmallChunks(sentences);
		}

		return [trimmed];
	}

	const allChunks: string[] = [];
	for (const para of paragraphs) {
		allChunks.push(...splitByDots(para));
	}

	if (level === 1) {
		return mergeSmallChunks(allChunks);
	}

	let pieces = allChunks.flatMap((chunk) => splitByClauses(chunk));

	if (level >= 3) {
		pieces = pieces.flatMap((chunk) => splitBySoftBreaks(chunk));
	}

	return mergeSmallChunks(pieces);
}

function splitByParagraphs(text: string): string[] {
	return text
		.split(/\n\s*\n/)
		.map((p) => p.trim())
		.filter((p) => p.length > 0);
}

function splitBySentences(text: string): string[] {
	const parts: string[] = [];
	const regex = /(?<=[.!?。！？])\s+/;
	const segments = text.split(regex);

	let current = '';
	for (const seg of segments) {
		if (current) {
			current += ' ' + seg;
		} else {
			current = seg;
		}
		if (current.length >= MIN_CHUNK_CHARS) {
			parts.push(current.trim());
			current = '';
		}
	}
	if (current.trim()) {
		parts.push(current.trim());
	}
	return parts;
}

function splitByDots(text: string): string[] {
	return text
		.split(/(?<=[.!?。！？])\s+/)
		.map((s) => s.trim())
		.filter((s) => s.length > 0);
}

function splitByClauses(text: string): string[] {
	return text
		.split(/(?<=[,;:])\s+/)
		.map((s) => s.trim())
		.filter((s) => s.length > 0);
}

function splitBySoftBreaks(text: string): string[] {
	return text
		.split(/(?<=\s[—–-])\s+/)
		.map((s) => s.trim())
		.filter((s) => s.length > 0);
}

function mergeSmallChunks(chunks: string[]): string[] {
	const merged: string[] = [];
	let buffer = '';

	for (const chunk of chunks) {
		if (buffer) {
			buffer += ' ' + chunk;
			if (buffer.length >= MIN_CHUNK_CHARS) {
				merged.push(buffer);
				buffer = '';
			}
		} else if (chunk.length < MIN_CHUNK_CHARS) {
			buffer = chunk;
		} else {
			merged.push(chunk);
		}
	}

	if (buffer) {
		if (merged.length > 0) {
			merged[merged.length - 1] += ' ' + buffer;
		} else {
			merged.push(buffer);
		}
	}

	return merged;
}

export function splitForEmbeddings(
	text: string,
	options: SplitForEmbeddingsOptions
): EmbeddingChunk[] {
	const trimmed = text.trim();
	if (!trimmed) return [];

	const trimOffset = text.indexOf(trimmed);
	const { windowSize, overlap, respectBoundaries = true } = options;

	if (windowSize <= 0) {
		throw new Error('windowSize must be greater than 0');
	}
	if (overlap < 0) {
		throw new Error('overlap must be non-negative');
	}
	if (overlap >= windowSize) {
		throw new Error('overlap must be less than windowSize');
	}

	if (trimmed.length <= windowSize) {
		return [
			{
				text: trimmed,
				index: 0,
				startOffset: trimOffset,
				endOffset: trimOffset + trimmed.length
			}
		];
	}

	const chunks: EmbeddingChunk[] = [];
	const step = windowSize - overlap;
	let position = 0;
	let index = 0;

	while (position < trimmed.length) {
		let end = Math.min(position + windowSize, trimmed.length);

		if (respectBoundaries && end < trimmed.length) {
			const boundary = findSentenceBoundary(trimmed, position, end, windowSize);
			if (boundary > position) {
				end = boundary;
			}
		}

		const chunkText = trimmed.slice(position, end).trim();
		if (chunkText) {
			chunks.push({
				text: chunkText,
				index,
				startOffset: position + trimOffset,
				endOffset: end + trimOffset
			});
			index++;
		}

		if (end >= trimmed.length) break;
		const nextPosition = end - overlap;
		position = nextPosition > position ? nextPosition : position + step;
	}

	return chunks;
}

export function splitByString(text: string, delimiter: string): EmbeddingChunk[] {
	const trimmed = text.trim();
	if (!trimmed || !delimiter) return [];

	const trimOffset = text.indexOf(trimmed);
	const indices: number[] = [];
	let searchStart = 0;

	while (searchStart < trimmed.length) {
		const idx = trimmed.indexOf(delimiter, searchStart);
		if (idx === -1) break;
		indices.push(idx);
		searchStart = idx + delimiter.length;
	}

	if (indices.length === 0) {
		return [
			{
				text: trimmed,
				index: 0,
				startOffset: trimOffset,
				endOffset: trimOffset + trimmed.length
			}
		];
	}

	const rawPieces: string[] = [];

	if (indices[0] > 0) {
		rawPieces.push(trimmed.slice(0, indices[0]));
	}

	for (let i = 0; i < indices.length; i++) {
		const start = indices[i];
		const end = i + 1 < indices.length ? indices[i + 1] : trimmed.length;
		rawPieces.push(trimmed.slice(start, end));
	}

	const merged = mergeSmallChunks(rawPieces);

	const chunks: EmbeddingChunk[] = [];
	let index = 0;

	for (const piece of merged) {
		const startIdx = trimmed.indexOf(piece);
		if (startIdx === -1) continue;
		chunks.push({
			text: piece,
			index,
			startOffset: startIdx + trimOffset,
			endOffset: startIdx + piece.length + trimOffset
		});
		index++;
	}

	return chunks;
}

function findSentenceBoundary(
	text: string,
	start: number,
	end: number,
	windowSize: number
): number {
	const tolerance = Math.max(50, Math.floor(windowSize * 0.1));
	const minEnd = Math.max(start + 1, end - tolerance);
	const maxEnd = Math.min(text.length, end + tolerance);

	const searchRegion = text.slice(minEnd, maxEnd);

	const sentenceMatch = searchRegion.match(/[.!?。！？]\s/);
	if (sentenceMatch && sentenceMatch.index !== undefined) {
		return minEnd + sentenceMatch.index + 1;
	}

	const relativeEnd = end - minEnd;

	for (let i = relativeEnd; i >= 0; i--) {
		if (/\s/.test(searchRegion[i])) {
			return minEnd + i + 1;
		}
	}

	for (let i = relativeEnd + 1; i < searchRegion.length; i++) {
		if (/\s/.test(searchRegion[i])) {
			return minEnd + i + 1;
		}
	}

	return end;
}
