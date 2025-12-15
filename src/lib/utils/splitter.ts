import { invoke } from '@tauri-apps/api/core';

export interface SplitTextParams {
  /** The splitting mode: markdown for documents, podcast for audio transcripts, code_ts for TypeScript code */
  mode: "markdown" | "podcast" | "code_ts";
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
    const result = await invoke<string[]>("split_text_command", {
      mode: params.mode,
      text: params.text,
      capacityChars: params.capacityChars || 1500,
      overlapChars: params.overlapChars || 150,
    });
    return result;
  } catch (error) {
    throw new Error(`Failed to split text: ${error}`);
  }
}
