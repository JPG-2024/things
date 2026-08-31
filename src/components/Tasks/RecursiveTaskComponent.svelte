<script lang="ts">
	import type { Task, TaskComponentProps } from '@/types/taskRunner.types';
	import type {
		RecursiveChunk,
		RecursiveConfig,
		RecursiveContentResult
	} from '@/runners/shared/taskFactories';
	import { buildRecursiveTask } from '@/runners/shared/taskFactories';
	import MarkdownRenderer from '@/components/MarkdownRenderer.svelte';
	import Keywords from '@/components/Keywords.svelte';
	import ChunkList, { type ChunkEntry } from '@/components/ChunkList.svelte';
	import SimilarEmbeddingsComponent from '@/components/Tasks/SimilarEmbeddingsComponent.svelte';
	import Tabs from '@/components/Tabs.svelte';
	import { workflowManager } from '@/runners/workflowManager.svelte';
	import { workflowStore } from '@/stores/workflowStore.svelte';
	import { viewState } from '@/stores/viewStore.svelte';
	import { getTaskChunks, updateTaskDataById } from '@/stores/webStore';

	type Props = {
		runId?: string;
		task: Task;
		componentProps?: TaskComponentProps;
	};

	let { runId = undefined, task, componentProps = {} }: Props = $props();

	void componentProps;

	let showRaw = $state(false);
	let fetchedChunks = $state<RecursiveChunk[]>([]);
	let chunksRequested = false;
	let chunksRequestedKey = '';

	const targetRunId = $derived(runId ?? workflowStore.focusedRunId);

	const recursiveData = $derived.by((): RecursiveContentResult | null => {
		const data = task.data as Record<string, unknown> | undefined;
		if (!data || typeof data !== 'object') return null;
		const finalResponse = data.finalResponse;
		if (typeof finalResponse !== 'string' && !Array.isArray(finalResponse)) return null;
		const chunks = Array.isArray(data.chunks) ? data.chunks : [];
		return { chunks, finalResponse };
	});

	$effect(() => {
		const data = task.data as Record<string, unknown> | undefined;
		const url = viewState.url;
		const key = `${url}:${task.id}`;
		if (key !== chunksRequestedKey) {
			chunksRequestedKey = key;
			chunksRequested = false;
			fetchedChunks = [];
		}

		const hasChunks = Array.isArray(data?.chunks) && (data.chunks as unknown[]).length > 0;
		const hasFinalResponse =
			typeof data?.finalResponse === 'string' || Array.isArray(data?.finalResponse);
		if (hasChunks || !hasFinalResponse || task.status !== 'done') return;
		if (!url || chunksRequested) return;

		chunksRequested = true;
		void getTaskChunks(url, task.id).then((chunks) => {
			if (chunks) fetchedChunks = chunks;
		});
	});

	const chunks = $derived(
		recursiveData?.chunks && recursiveData.chunks.length > 0 ? recursiveData.chunks : fetchedChunks
	);
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
			summary: chunk.data.join('\n')
		}))
	);

	const LEVELS = ['1', '2', '4', '8'];
	const levelTabs = LEVELS.map((l) => ({ id: l, label: l }));

	const recursiveConfig = $derived(
		(task.componentProps as Record<string, unknown> | undefined)?.recursiveConfig as
			| RecursiveConfig
			| undefined
	);

	const showLevelTabs = $derived(!!recursiveConfig && !recursiveConfig.splitByString);
	const activeLevel = $derived(
		recursiveConfig?.windowDivisor ? String(recursiveConfig.windowDivisor) : ''
	);

	function handleLevelChange(levelId: string) {
		void applyLevel(levelId);
	}

	async function applyLevel(levelId: string) {
		if (!targetRunId || !recursiveConfig) return;
		if (task.status === 'running') return;
		const level = Number(levelId);
		if (!Number.isFinite(level) || level < 1) return;
		if (recursiveConfig.windowDivisor === level) return;
		try {
			const newTask = buildRecursiveTask(task.id, {
				name: task.name,
				dependencies: task.dependencies,
				windowSize: recursiveConfig.windowSize,
				overlap: recursiveConfig.overlap,
				windowDivisor: level,
				splitByString: recursiveConfig.splitByString,
				processorType: recursiveConfig.processorType ?? 'summarize',
				combineMode: recursiveConfig.combineMode,
				userMessage: recursiveConfig.userMessage ?? 'Summarize this section concisely.',
				finalUserMessage:
					recursiveConfig.finalUserMessage ??
					'Combine these section summaries into one coherent summary.',
				extractorConfig: recursiveConfig.extractorConfig,
				targetLang: recursiveConfig.targetLang,
				customSystemMsg: recursiveConfig.customSystemMsg,
				renderOrder: task.renderOrder,
				embeddings: task.embeddings,
				persist: true,
				model: viewState.aiModel,
				enableTTS: task.enableTTS
			});
			newTask.visible = task.visible;
			workflowManager.addTask(targetRunId, newTask);
			const summary = await workflowManager.rerunTask(targetRunId, task.id);
			const updatedTask = summary.tasks.find((t) => t.id === task.id);
			if (updatedTask?.persist) {
				await updateTaskDataById(targetRunId, task.id, updatedTask.data);
			}
		} catch (error) {
			console.error(`Failed to rerun recursive task "${task.id}" at level ${levelId}:`, error);
		}
	}
</script>

{#if recursiveData}
	<div class="recursive-shell">
		{#if showLevelTabs}
			<div class="level-row">
				<span class="level-label">window ÷</span>
				<Tabs tabs={levelTabs} activeTab={activeLevel} onTabChange={handleLevelChange} />
			</div>
		{/if}
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
				manual={task.embeddings === true}
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

	.level-row {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.level-label {
		font-size: 0.82rem;
		opacity: 0.7;
	}
</style>
