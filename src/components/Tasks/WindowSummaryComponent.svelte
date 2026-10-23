<script lang="ts">
	import { fly } from 'svelte/transition';
	import type { Task, TaskComponentProps } from '@/types/taskRunner.types';
	import type { WindowSummaryChunkData, WindowSummaryFinal } from '@/runners/shared/processors';
	import type { ChunkOffset } from '@/runners/shared/recursiveTask';
	import { buildRecursiveTask, recursiveConfigFromTask } from '@/runners/shared/recursiveTask';
	import MarkdownRenderer from '@/components/MarkdownRenderer.svelte';
	import Spacer from '@/components/Spacer.component.svelte';
	import Modal from '@/components/Modal.svelte';
	import Button from '@/components/inputs/Button.component.svelte';
	import RangeSelector from '@/components/inputs/RangeSelector.svelte';
	import { reconstructChunks } from '@/lib/utils/splitText';
	import { workflowManager } from '@/runners/workflowManager.svelte';
	import { workflowStore } from '@/stores/workflowStore.svelte';
	import { viewState } from '@/stores/viewStore.svelte';
	import { updateTaskDataById } from '@/stores/webStore';
	import { WINDOW_DIVISOR_LADDER } from '@/runners/shared/constants';

	type Props = {
		runId?: string;
		task: Task;
		componentProps?: TaskComponentProps;
	};

	let { runId = undefined, task, componentProps = {} }: Props = $props();

	void componentProps;

	const targetRunId = $derived(runId ?? workflowStore.focusedRunId);

	type SummaryChunkEntry = {
		key: ChunkOffset;
		data: WindowSummaryChunkData;
	};

	type SummaryData = {
		chunks: SummaryChunkEntry[];
		finalResponse: WindowSummaryFinal;
	};

	const summaryData = $derived.by((): SummaryData | null => {
		const data = task.data as Record<string, unknown> | undefined;
		if (!data || typeof data !== 'object') return null;
		const finalResponse = data.finalResponse as WindowSummaryFinal | undefined;
		if (
			!finalResponse ||
			typeof finalResponse !== 'object' ||
			typeof finalResponse.summary !== 'string'
		) {
			return null;
		}
		const chunks = Array.isArray(data.chunks) ? (data.chunks as SummaryChunkEntry[]) : [];
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
		if (!summaryData || !sourceContent) return [];
		const offsets = summaryData.chunks.map((c) => c.key);
		return reconstructChunks(sourceContent, offsets);
	});

	const reversedChunks = $derived.by((): { chunk: SummaryChunkEntry; originalIndex: number }[] => {
		if (!summaryData) return [];
		return summaryData.chunks.map((chunk, originalIndex) => ({ chunk, originalIndex })).reverse();
	});

	const isRunning = $derived(task.status === 'running');
	const chunksCollapsed = $derived(!isRunning && !!summaryData?.finalResponse);

	const recursiveConfig = $derived(recursiveConfigFromTask(task));
	const showLevelControl = $derived(
		!!recursiveConfig && !recursiveConfig.splitByString && !recursiveConfig.splitByHeaders
	);
	const runtimeDivisor = $derived.by((): number | undefined => {
		const data = task.data as Record<string, unknown> | undefined;
		return typeof data?.windowDivisor === 'number' ? (data.windowDivisor as number) : undefined;
	});
	const effectiveDivisor = $derived.by((): number => {
		if (typeof runtimeDivisor === 'number') return runtimeDivisor;
		const cfg = recursiveConfig;
		// A fresh (unlocked) task starts the ladder at the first level, so the
		// config divisor only reflects the start when it was pinned by the slider.
		if (cfg?.windowDivisorLocked === true && typeof cfg.windowDivisor === 'number') {
			return cfg.windowDivisor;
		}
		return WINDOW_DIVISOR_LADDER[0];
	});

	/** Closest ladder index for the effective divisor, so the slider never shows off-ladder values. */
	const ladderIndex = $derived.by((): number => {
		let index = 0;
		for (let i = 0; i < WINDOW_DIVISOR_LADDER.length; i++) {
			if (WINDOW_DIVISOR_LADDER[i] <= effectiveDivisor) index = i;
		}
		return index;
	});

	// Writable derived: dragging the slider assigns to it, and after every
	// rerun (task data changes) it recomputes from the runtime divisor.
	let sliderIndex = $derived(ladderIndex);

	const previewDivisor = $derived(WINDOW_DIVISOR_LADDER[sliderIndex] ?? effectiveDivisor);

	let rawModalIndex = $state<number | null>(null);

	/**
	 * Commits the selected start level: rebuilds the task pinned to that
	 * divisor and reruns it. The context-overflow ladder in the runner still
	 * climbs past the pinned level on context errors.
	 */
	async function applyLevel(levelId: string) {
		if (!targetRunId || !recursiveConfig) return;
		if (task.status === 'running') return;

		const level = Number(levelId);
		if (!Number.isFinite(level) || level < 1) return;
		if (recursiveConfig.windowDivisorLocked === true && recursiveConfig.windowDivisor === level) {
			return;
		}

		try {
			const newTask = buildRecursiveTask(task.id, {
				...recursiveConfig,
				name: task.name,
				dependencies: task.dependencies,
				windowDivisor: level,
				windowDivisorLocked: true,
				renderOrder: task.renderOrder,
				persist: true,
				model: viewState.aiModel,
				enableTTS: task.enableTTS,
				gridSpan: task.gridSpan,
				embeddings: task.embeddings,
				storeChunkText: task.storeChunkText,
				embedField: task.embedField
			});
			newTask.visible = task.visible;
			workflowManager.addTask(targetRunId, newTask);
			const summary = await workflowManager.rerunTask(targetRunId, task.id);
			const updatedTask = summary.tasks.find((t) => t.id === task.id);
			if (updatedTask?.persist) {
				await updateTaskDataById(targetRunId, task.id, updatedTask.data);
			}
		} catch (error) {
			console.error(`Failed to rerun window summary task "${task.id}" at level ${levelId}:`, error);
		}
	}
</script>

{#if summaryData}
	<div class="window-summary-shell">
		{#if showLevelControl}
			<div class="level-row">
				<span class="level-label">window ÷</span>
				<div class="level-slider">
					<RangeSelector
						id={`window-level-${task.id}`}
						min={0}
						max={WINDOW_DIVISOR_LADDER.length - 1}
						step={1}
						bind:value={sliderIndex}
						disabled={isRunning}
						onCommit={(i) => void applyLevel(String(WINDOW_DIVISOR_LADDER[i]))}
					/>
				</div>
				<span class="level-label">÷{previewDivisor}</span>
			</div>
		{/if}

		{#if summaryData.chunks.length > 0}
			<Spacer title="Chunks" defaultOpen={!chunksCollapsed}>
				<div class="chunks-grid">
					{#each reversedChunks as entry (entry.chunk.key.startOffset)}
						<div class="chunk-item" transition:fly={{ duration: 300, y: 100 }}>
							<div class="chunk-heading">
								<span class="chunk-index"
									>{entry.originalIndex + 1}/{summaryData.chunks.length}</span
								>
								<Button icon="FileText" onClick={() => (rawModalIndex = entry.originalIndex)}>
									View raw text
								</Button>
							</div>
							<div class="chunk-summary">
								<MarkdownRenderer content={entry.chunk.data.summary} />
							</div>
						</div>
					{/each}
				</div>
			</Spacer>
		{/if}

		{#if !isRunning && summaryData.finalResponse.summary}
			<div class="final-section">
				<MarkdownRenderer content={summaryData.finalResponse.summary} />
			</div>
		{/if}

		<Modal show={rawModalIndex !== null} onClose={() => (rawModalIndex = null)}>
			{#if rawModalIndex !== null}
				<div class="raw-text-modal-container">
					<div class="chunk-raw-text">{chunkTexts[rawModalIndex] ?? ''}</div>
				</div>
			{/if}
		</Modal>
	</div>
{/if}

<style>
	.window-summary-shell {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		padding: 1rem 0;
	}

	.level-row {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.level-slider {
		flex: 1;
		max-width: 16rem;
	}

	.level-label {
		font-size: 0.82rem;
		opacity: 0.7;
	}

	.chunks-grid {
		display: flex;
		flex-direction: column;
		gap: 2rem;
	}

	.chunk-item {
		padding-bottom: 2rem;
		border-bottom: 1px solid rgba(255, 255, 255, 0.08);
	}

	.chunk-item:last-child {
		padding-bottom: 0;
		border-bottom: none;
	}

	.chunk-heading {
		display: flex;
		gap: 0.6rem;
		align-items: baseline;
		margin-bottom: 0.75rem;
	}

	.chunk-heading :global(button) {
		margin-left: auto;
		font-size: 0.7rem;
		padding: 0;
		white-space: nowrap;
	}

	.chunk-index {
		font-size: 0.7rem;
		opacity: 0.45;
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}

	.raw-text-modal-container {
		padding: 0 1rem;
	}

	.chunk-raw-text {
		font-size: 0.75rem;
		white-space: pre-wrap;
		padding: 2rem;
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 4px;
		color: gray;
	}

	.final-section {
		border-top: 1px solid rgba(255, 255, 255, 0.08);
		padding-top: 1rem;
	}
</style>
