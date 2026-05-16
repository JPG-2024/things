import { invoke } from '@tauri-apps/api/core';

export interface SplitTextParams {
	/** The splitting mode: markdown for documents, podcast for audio transcripts, code_ts for TypeScript code */
	mode: 'markdown' | 'podcast' | 'code_ts';
	/** The text content to split */
	text: string;
	/** Maximum number of characters per chunk */
	capacityChars?: number;
	/** Number of overlapping characters between chunks (optional) */
	overlapChars?: number;
}

/**
 * Splits the given text into smaller chunks based on the provided parameters.
 * @param params - The parameters for splitting the text.
 * @returns A promise that resolves to an array of text chunks.
 * @throws An error if the text splitting fails.
 */
export async function splitText(params: SplitTextParams): Promise<string[]> {
	try {
		const result = await invoke<string[]>('split_text_command', {
			mode: params.mode,
			text: params.text,
			capacityChars: params.capacityChars || 512,
			overlapChars: params.overlapChars || 64
		});
		return result;
	} catch (error) {
		throw new Error(`Failed to split text: ${error}`);
	}
}

export function compactMarkdown(md: string): string {
	// 1. Protege los bloques de código con un marcador temporal
	const codeBlocks: string[] = [];
	md = md.replace(/```[\s\S]*?```/g, (match) => {
		codeBlocks.push(match);
		return `__CODE_BLOCK_${codeBlocks.length - 1}__`;
	});

	// 2. Limpia espacios y saltos fuera de los bloques
	md = md
		// Colapsa espacios múltiples y tabs en uno solo
		.replace(/[ \t]+/g, ' ')
		// Reemplaza más de 2 saltos de línea seguidos por 2
		.replace(/\n{3,}/g, '\n\n')
		// Quita espacios al inicio y fin del texto
		.trim();

	// 3. Restaura los bloques de código originales
	md = md.replace(/__CODE_BLOCK_(\d+)__/g, (_, i) => codeBlocks[i]);

	return md;
}
