<script lang="ts">
	import type { Task, TaskComponentProps } from '@/types/taskRunner.types';
	import type { MultiChunkData, MultiFinal } from '@/runners/shared/processors';
	import type { ChunkOffset } from '@/runners/shared/recursiveTask';
	import { buildRecursiveTask, recursiveConfigFromTask } from '@/runners/shared/recursiveTask';
	import MarkdownRenderer from '@/components/MarkdownRenderer.svelte';
	import Keywords from '@/components/Keywords.svelte';
	import DetailsPanel from '@/components/DetailsPanel.svelte';
	import Tabs from '@/components/Tabs.svelte';
	import { reconstructChunks } from '@/lib/utils/splitText';
	import { workflowManager } from '@/runners/workflowManager.svelte';
	import { workflowStore } from '@/stores/workflowStore.svelte';
	import { viewState } from '@/stores/viewStore.svelte';
	import { updateTaskDataById } from '@/stores/webStore';

	type Props = {
		runId?: string;
		task: Task;
		componentProps?: TaskComponentProps;
	};

	let { runId = undefined, task, componentProps = {} }: Props = $props();

	void componentProps;

	const targetRunId = $derived(runId ?? workflowStore.focusedRunId);

	type MultiChunkEntry = {
		key: ChunkOffset;
		data: MultiChunkData;
	};

	type MultiData = {
		chunks: MultiChunkEntry[];
		finalResponse: MultiFinal;
	};

	const multiData = $derived.by((): MultiData | null => {
		const data = task.data as Record<string, unknown> | undefined;
		if (!data || typeof data !== 'object') return null;
		const finalResponse = data.finalResponse as MultiFinal | undefined;
		if (
			!finalResponse ||
			typeof finalResponse !== 'object' ||
			typeof finalResponse.summary !== 'string'
		) {
			return null;
		}
		const chunks = Array.isArray(data.chunks) ? (data.chunks as MultiChunkEntry[]) : [];
		return { chunks, finalResponse };
	});

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

	const chunkTexts = $derived.by((): string[] => {
		if (!multiData || !sourceContent) return [];
		const offsets = multiData.chunks.map((c) => c.key);
		return reconstructChunks(sourceContent, offsets);
	});

	const isRunning = $derived(task.status === 'running');

	const LEVELS = ['1', '2', '4', '8'];
	const levelTabs = LEVELS.map((l) => ({ id: l, label: l }));
	const recursiveConfig = $derived(recursiveConfigFromTask(task));
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
				...recursiveConfig,
				name: task.name,
				dependencies: task.dependencies,
				windowDivisor: level,
				renderOrder: task.renderOrder,
				persist: true,
				model: viewState.aiModel
			});
			newTask.visible = task.visible;
			workflowManager.addTask(targetRunId, newTask);
			const summary = await workflowManager.rerunTask(targetRunId, task.id);
			const updatedTask = summary.tasks.find((t) => t.id === task.id);
			if (updatedTask?.persist) {
				await updateTaskDataById(targetRunId, task.id, updatedTask.data);
			}
		} catch (error) {
			console.error(`Failed to rerun multi task "${task.id}" at level ${levelId}:`, error);
		}
	}
</script>

{#if multiData}
	<div class="multi-shell">
		{#if showLevelTabs}
			<div class="level-row">
				<span class="level-label">window ÷</span>
				<Tabs tabs={levelTabs} activeTab={activeLevel} onTabChange={handleLevelChange} />
			</div>
		{/if}

		{#if multiData.chunks.length > 0}
			<div class="chunks-grid">
				{#each multiData.chunks as chunk, i (chunk.key.startOffset)}
					<div class="chunk-cell">
						<DetailsPanel
							defaultOpen={isRunning}
							label={'Chunk ' + (i + 1)}
							hint={`${chunk.key.startOffset}–${chunk.key.endOffset}`}
						>
							<MarkdownRenderer content={chunkTexts[i] ?? ''} />
						</DetailsPanel>
					</div>
					<div class="result-cell">
						<div class="result-section">
							<span class="result-label">Summary</span>
							<MarkdownRenderer content={chunk.data.summary.join('\n')} />
						</div>
						<div class="result-section">
							<span class="result-label">Keywords</span>
							<Keywords keywords={chunk.data.keywords} />
						</div>
						<div class="result-section">
							<span class="result-label">Topics</span>
							<Keywords keywords={chunk.data.topics} />
						</div>
					</div>
				{/each}
			</div>
		{/if}

		{#if multiData.finalResponse}
			<div class="final-section">
				<div class="final-label">FINAL</div>
				<div class="final-content">
					<div class="result-section">
						<span class="result-label">Summary</span>
						<MarkdownRenderer content={multiData.finalResponse.summary} />
					</div>
					<div class="result-section">
						<span class="result-label">Keywords</span>
						<Keywords keywords={multiData.finalResponse.keywords} />
					</div>
					<div class="result-section">
						<span class="result-label">Topics</span>
						<Keywords keywords={multiData.finalResponse.topics} />
					</div>
				</div>
			</div>
		{/if}
	</div>
{/if}

<style>
	.multi-shell {
		--tabs-pill-font-size: 0.7rem;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
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

	.chunks-grid {
		display: grid;
		grid-template-columns: 1fr 1.2fr;
		gap: 0.5rem;
		align-items: start;
	}

	@media (max-width: 600px) {
		.chunks-grid {
			grid-template-columns: 1fr;
		}
	}

	.chunk-cell,
	.result-cell {
		min-width: 0;
	}

	.result-section {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		padding: 0.25rem 0;
	}

	.result-label {
		font-size: 0.7rem;
		text-transform: uppercase;
		opacity: 0.5;
		letter-spacing: 0.05em;
	}

	.final-section {
		border-top: 1px solid rgba(255, 255, 255, 0.08);
		padding-top: 0.75rem;
		margin-top: 0.5rem;
	}

	.final-label {
		font-size: 0.7rem;
		text-transform: uppercase;
		opacity: 0.5;
		letter-spacing: 0.05em;
		margin-bottom: 0.5rem;
	}

	.final-content {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
</style>
