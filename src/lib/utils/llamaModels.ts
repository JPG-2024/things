export interface LlamaModelEntry {
	name: string;
	sizeBytes: number;
	modified: number;
}

export interface LlamaServerStatus {
	name: string;
	port: number;
	running: boolean;
	healthy: boolean;
	pid: number | null;
	error: string | null;
}

/**
 * Liveness of the llama-server processes the app itself spawned, as reported
 * by the `llama_servers_runtime` Tauri command. Servers started outside the
 * app never appear here.
 */
export interface LlamaServerRuntime {
	name: string;
	running: boolean;
	pid: number | null;
}

/** Names of the llama-server slots managed by the backend, in fixed order. */
export const SERVER_NAMES = ['inference', 'embeddings'] as const;
export type ServerName = (typeof SERVER_NAMES)[number];

/**
 * Case-insensitive filename fragments used to guess whether a `.gguf` file is
 * an embedding model. The guess only drives the Settings dropdowns; the
 * "Show all models" toggle lets the user override it.
 */
const EMBEDDING_KEYWORDS = ['embed', 'embeddings', 'bge', 'e5', 'nomic', 'gte'];

export function isEmbeddingModelName(name: string): boolean {
	const lower = name.toLowerCase();
	return EMBEDDING_KEYWORDS.some((keyword) => lower.includes(keyword));
}

export interface PartitionedModels {
	embedding: LlamaModelEntry[];
	chat: LlamaModelEntry[];
}

export function partitionModels(models: LlamaModelEntry[]): PartitionedModels {
	const embedding: LlamaModelEntry[] = [];
	const chat: LlamaModelEntry[] = [];
	for (const model of models) {
		if (isEmbeddingModelName(model.name)) {
			embedding.push(model);
		} else {
			chat.push(model);
		}
	}
	return { embedding, chat };
}
