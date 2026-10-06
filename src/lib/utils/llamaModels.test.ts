import { describe, expect, test } from 'bun:test';
import {
	isEmbeddingModelName,
	partitionModels,
	type LlamaModelEntry
} from '@/lib/utils/llamaModels';

function entry(name: string): LlamaModelEntry {
	return { name, sizeBytes: 0, modified: 0 };
}

describe('isEmbeddingModelName', () => {
	test('matches common embedding model names', () => {
		expect(isEmbeddingModelName('bge-m3-Q8_0.gguf')).toBe(true);
		expect(isEmbeddingModelName('nomic-embed-text-v1.5.gguf')).toBe(true);
		expect(isEmbeddingModelName('multilingual-E5-large.gguf')).toBe(true);
		expect(isEmbeddingModelName('gte-Qwen2.gguf')).toBe(true);
		expect(isEmbeddingModelName('my-embeddings-model.gguf')).toBe(true);
	});

	test('treats chat models as non-embedding', () => {
		expect(isEmbeddingModelName('LFM2.5-2.6B-Q4_K_M.gguf')).toBe(false);
		expect(isEmbeddingModelName('qwen2.5-7b-instruct.gguf')).toBe(false);
	});
});

describe('partitionModels', () => {
	test('splits embedding and chat models', () => {
		const { embedding, chat } = partitionModels([
			entry('bge-m3-Q8_0.gguf'),
			entry('LFM2.5-2.6B-Q4_K_M.gguf'),
			entry('nomic-embed-text.gguf')
		]);
		expect(embedding.map((model) => model.name)).toEqual([
			'bge-m3-Q8_0.gguf',
			'nomic-embed-text.gguf'
		]);
		expect(chat.map((model) => model.name)).toEqual(['LFM2.5-2.6B-Q4_K_M.gguf']);
	});
});
