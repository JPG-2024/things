<script lang="ts">
	import type { Task, TaskComponentProps } from '@/types/taskRunner.types';
	import type { RecursiveContentResult } from '@/runners/shared/taskFactories';
	import MarkdownRenderer from '@/components/MarkdownRenderer.svelte';
	import Keywords from '@/components/Keywords.svelte';
	import ChunkList, { type ChunkEntry } from '@/components/ChunkList.svelte';
	import SimilarEmbeddingsComponent from '@/components/Tasks/SimilarEmbeddingsComponent.svelte';
	import { workflowStore } from '@/stores/workflowStore.svelte';

	type Props = {
		runId?: string;
		task: Task;
		componentProps?: TaskComponentProps;
	};

	let { runId = undefined, task, componentProps = {} }: Props = $props();

	void componentProps;

	let showRaw = $state(false);

	const targetRunId = $derived(runId ?? workflowStore.focusedRunId);

	const recursiveData = $derived.by((): RecursiveContentResult | null => {
		const data = task.data as Record<string, unknown> | undefined;
		if (!data || typeof data !== 'object') return null;
		const chunks = data.chunks;
		const finalResponse = data.finalResponse;
		if (!Array.isArray(chunks)) return null;
		if (typeof finalResponse !== 'string' && !Array.isArray(finalResponse)) return null;
		return { chunks, finalResponse };
	});

	const chunks = $derived(recursiveData?.chunks ?? []);
	const chunkOffsets = $derived(chunks.map((c) => c.key));
	const finalResponse = $derived(recursiveData?.finalResponse ?? '');
	const isFinalArray = $derived(Array.isArray(finalResponse));
	const chunksSpacerOpen = $derived(task.status === 'running');

	const sourceContent = $derived.by((): string => {
		if (!targetRunId) return '';
		const depId = task.dependencies?.[0] ?? 'content';
		const depData = workflowStore.getTaskData(targetRunId, depId);
		if (typeof depData === 'string') return depData;
		if (depData && typeof depData === 'object') {
			const obj = depData as Record<string, unknown>;
			if (typeof obj.content === 'string') return obj.content;
			if (typeof obj.data === 'string') return obj.data;
		}
		return '';
	});

	const chunkEntries = $derived<ChunkEntry[]>(
		chunks.map((chunk, i) => ({
			id: i,
			summary: chunk.data
		}))
	);
</script>

{#if recursiveData}
	<div class="recursive-shell">
		{#if chunks.length > 0}
			<ChunkList
				title="Chunks"
				defaultOpen={chunksSpacerOpen}
				chunks={chunkEntries}
				{sourceContent}
				{chunkOffsets}
				bind:showRaw
			/>
		{/if}
		{#if task.embeddings}
			<SimilarEmbeddingsComponent
				id={task.id}
				data={task.data}
				enabled={task.embeddings === true}
				maxDistance={0.3}
			/>
		{/if}

		{#if finalResponse}
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
