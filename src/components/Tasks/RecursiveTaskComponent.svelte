<script lang="ts">
	import type { Task, TaskComponentProps } from '@/types/taskRunner.types';
	import type { RecursiveContentResult, ChunkOffset } from '@/runners/shared/taskFactories';
	import MarkdownRenderer from '@/components/MarkdownRenderer.svelte';
	import Keywords from '@/components/Keywords.svelte';
	import ChunkList, { type ChunkEntry } from '@/components/ChunkList.svelte';
	import SimilarEmbeddingsComponent from '@/components/Tasks/SimilarEmbeddingsComponent.svelte';

	type Props = {
		runId?: string;
		task: Task;
		componentProps?: TaskComponentProps;
	};

	let { runId = undefined, task, componentProps = {} }: Props = $props();

	void runId;
	void componentProps;

	let showRaw = $state(false);

	const recursiveData = $derived.by((): RecursiveContentResult | null => {
		const data = task.data as Record<string, unknown> | undefined;
		if (!data || typeof data !== 'object') return null;
		const chunks = data.chunks;
		const rawChunks = data.rawChunks;
		const chunkOffsets = data.chunkOffsets;
		const finalResponse = data.finalResponse;
		if (!Array.isArray(chunks) || !Array.isArray(rawChunks)) return null;
		if (!Array.isArray(chunkOffsets)) return null;
		if (typeof finalResponse !== 'string' && !Array.isArray(finalResponse)) return null;
		return { chunks, rawChunks, chunkOffsets, finalResponse };
	});

	const chunks = $derived(recursiveData?.chunks ?? []);
	const rawChunks = $derived(recursiveData?.rawChunks ?? []);
	const chunkOffsets = $derived(recursiveData?.chunkOffsets ?? []);
	const finalResponse = $derived(recursiveData?.finalResponse ?? '');
	const isFinalArray = $derived(Array.isArray(finalResponse));
	const chunksSpacerOpen = $derived(task.status === 'running');

	const chunkEntries = $derived<ChunkEntry[]>(
		chunks.map((chunk, i) => ({
			id: i,
			summary: chunk,
			raw: rawChunks[i] ?? undefined
		}))
	);

	function offsetLabel(offset: ChunkOffset | undefined): string {
		if (!offset) return '';
		return ` (${offset.startOffset}–${offset.endOffset})`;
	}
</script>

{#if recursiveData}
	<div class="recursive-shell">
		{#if chunks.length > 0}
			<ChunkList title="Chunks" defaultOpen={chunksSpacerOpen} chunks={chunkEntries} bind:showRaw />
		{/if}
		{#if task.embeddings}
			<SimilarEmbeddingsComponent
				id={task.id}
				data={task.data}
				enabled={task.embeddings === true}
				maxDistance={0.3}
			/>
		{/if}

		{#if finalResponse && !showRaw}
			<div class="final-response">
				{#if isFinalArray}
					<Keywords keywords={finalResponse} />
				{:else}
					<MarkdownRenderer content={finalResponse} />
				{/if}
			</div>
		{/if}
	</div>
{/if}

<style>
	.recursive-shell {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		padding: 1rem 0;
	}

	.final-response {
		padding-top: 0.5rem;
		border-top: 1px solid rgba(255, 255, 255, 0.08);
	}
</style>
