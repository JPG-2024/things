const MIN_CHUNK_CHARS = 50;

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
