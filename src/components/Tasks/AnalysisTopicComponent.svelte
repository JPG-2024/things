<script lang="ts">
	import { fly } from 'svelte/transition';
	import type { Task, TaskComponentProps } from '@/types/taskRunner.types';
	import {
		type AnalysisTopicChunkData,
		type AnalysisTopicFinal
	} from '@/runners/shared/processors';
	import type { ChunkOffset } from '@/runners/shared/recursiveTask';
	import { buildRecursiveTask, recursiveConfigFromTask } from '@/runners/shared/recursiveTask';
	import MarkdownRenderer from '@/components/MarkdownRenderer.svelte';
	import Keywords from '@/components/Keywords.svelte';
	import Spacer from '@/components/Spacer.component.svelte';
	import Modal from '@/components/Modal.svelte';
	import Button from '@/components/inputs/Button.component.svelte';
	import RangeSelector from '@/components/inputs/RangeSelector.svelte';
	import { reconstructChunks } from '@/lib/utils/splitText';
	import { workflowManager } from '@/runners/workflowManager.svelte';
	import { workflowStore } from '@/stores/workflowStore.svelte';
	import { viewState } from '@/stores/viewStore.svelte';
	import { updateTaskDataById } from '@/stores/webStore';
	import {
		analysisDepthLevel,
		MAX_ANALYSIS_DEPTH,
		MIN_ANALYSIS_DEPTH,
		nearestAnalysisDepth
	} from '@/runners/shared/constants';
	import SimilarByTexts from '@/components/SimilarByTexts.component.svelte';

	type Props = {
		runId?: string;
		task: Task;
		componentProps?: TaskComponentProps;
	};

	let { runId = undefined, task, componentProps = {} }: Props = $props();

	void componentProps;

	const targetRunId = $derived(runId ?? workflowStore.focusedRunId);

	type AnalysisTopicChunkEntry = {
		key: ChunkOffset;
		data: AnalysisTopicChunkData;
	};

	type AnalysisTopicData = {
		chunks: AnalysisTopicChunkEntry[];
		finalResponse: AnalysisTopicFinal;
	};

	const analysisData = $derived.by((): AnalysisTopicData | null => {
		const data = task.data as Record<string, unknown> | undefined;
		if (!data || typeof data !== 'object') return null;
		const finalResponse = data.finalResponse as AnalysisTopicFinal | undefined;
		if (
			!finalResponse ||
			typeof finalResponse !== 'object' ||
			typeof finalResponse.summary !== 'string' ||
			!Array.isArray(finalResponse.sections)
		) {
			return null;
		}
		const chunks = Array.isArray(data.chunks) ? (data.chunks as AnalysisTopicChunkEntry[]) : [];
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
		if (!analysisData || !sourceContent) return [];
		const offsets = analysisData.chunks.map((c) => c.key);
		return reconstructChunks(sourceContent, offsets);
	});

	const reversedChunks = $derived.by(
		(): { chunk: AnalysisTopicChunkEntry; originalIndex: number }[] => {
			if (!analysisData) return [];
			return analysisData.chunks
				.map((chunk, originalIndex) => ({ chunk, originalIndex }))
				.reverse();
		}
	);

	const isRunning = $derived(task.status === 'running');
	const chunksCollapsed = $derived(!isRunning && !!analysisData?.finalResponse);

	const finalTopics = $derived(analysisData?.finalResponse.topics ?? []);

	const recursiveConfig = $derived(recursiveConfigFromTask(task));
	const runtimeDivisor = $derived.by((): number | undefined => {
		const data = task.data as Record<string, unknown> | undefined;
		return typeof data?.windowDivisor === 'number' ? (data.windowDivisor as number) : undefined;
	});

	/**
	 * Depth is authoritative once persisted. Tasks saved before the field
	 * existed fall back to snapping their stored divisor/topic count to the
	 * closest slider row (display only; the stored values keep running until
	 * the slider is committed).
	 */
	const activeDepth = $derived(
		recursiveConfig?.analysisDepth ??
			nearestAnalysisDepth(
				recursiveConfig?.windowDivisor ?? runtimeDivisor,
				recursiveConfig?.topicCount
			)
	);

	let depthValue = $derived(activeDepth);

	let rawModalIndex = $state<number | null>(null);

	function formatDepth(depth: number): string {
		const level = analysisDepthLevel(depth);
		if (!level) return String(depth);
		const topics = `${level.topicCount} topic${level.topicCount === 1 ? '' : 's'}`;
		const runtime =
			runtimeDivisor !== undefined && runtimeDivisor !== level.divisor
				? ` · runtime ÷${runtimeDivisor}`
				: '';
		return `÷${level.divisor} · ${topics}${runtime}`;
	}

	/**
	 * Commits the selected depth: rebuilds the task pinned to the depth's
	 * divisor/topic count and reruns it. The context-overflow ladder in the
	 * runner still rescues overflows by climbing the divisor.
	 */
	async function applyDepth(depth: number) {
		if (!targetRunId || !recursiveConfig) return;
		if (task.status === 'running') return;
		if (recursiveConfig.analysisDepth === depth) return;

		try {
			const newTask = buildRecursiveTask(task.id, {
				...recursiveConfig,
				name: task.name,
				dependencies: task.dependencies,
				analysisDepth: depth,
				// Words/topic is no longer user-editable: clear any stored value
				// so the processor default applies.
				topicWordCount: undefined,
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
			console.error(`Failed to rerun analysis topic task "${task.id}" at depth ${depth}:`, error);
		}
	}
</script>

{#if analysisData}
	<div class="analysis-topic-shell">
		{#if recursiveConfig}
			<div class="level-row">
				<RangeSelector
					id="analysis-depth"
					label="analysis depth"
					labelPosition="inline"
					value={depthValue}
					min={MIN_ANALYSIS_DEPTH}
					max={MAX_ANALYSIS_DEPTH}
					step={1}
					disabled={isRunning}
					format={formatDepth}
					onChange={(v) => (depthValue = v)}
					onCommit={(v) => void applyDepth(v)}
				/>
			</div>
		{/if}

		{#if analysisData.chunks.length > 0}
			<Spacer title="Chunks" defaultOpen={!chunksCollapsed}>
				<div class="chunks-grid">
					{#each reversedChunks as entry (entry.chunk.key.startOffset)}
						<div class="chunk-item" transition:fly={{ duration: 300, y: 100 }}>
							<div class="topic-sections">
								{#each entry.chunk.data.sections as section (section.topic)}
									<div class="topic-section">
										<div class="topic-heading">
											<h3 class="topic-title">{section.topic}</h3>
											<Button icon="FileText" onClick={() => (rawModalIndex = entry.originalIndex)}>
												View raw text
											</Button>
										</div>
										<MarkdownRenderer content={section.summary} />
									</div>
								{/each}
							</div>
							{#if entry.chunk.data.sections.length === 0}
								<div class="raw-button-row">
									<Button icon="FileText" onClick={() => (rawModalIndex = entry.originalIndex)}>
										View raw text
									</Button>
								</div>
							{/if}
							<div class="result-section">
								<span class="result-label">Keywords</span>
								<Keywords keywords={entry.chunk.data.keywords} />
							</div>
						</div>
					{/each}
				</div>
			</Spacer>
		{/if}

		{#if !isRunning && analysisData.finalResponse}
			<div class="final-section">
				<div class="final-content">
					<div class="result-section">
						<MarkdownRenderer content={analysisData.finalResponse.summary} />
					</div>
					<div class="meta-row">
						<div class="result-section">
							<span class="result-label">Topics</span>
							<SimilarByTexts texts={finalTopics} table={task.id} disabled={isRunning} />
						</div>
						<div class="result-section">
							<span class="result-label">Keywords</span>
							<Keywords keywords={analysisData.finalResponse.keywords} />
						</div>
					</div>
				</div>
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
	.analysis-topic-shell {
		--tabs-pill-font-size: 0.7rem;
		--keywords-font-size: 0.8rem;
		display: flex;
		padding: 1rem 0;
		flex-direction: column;
		gap: 0.75rem;
	}

	.level-row {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.75rem;
		padding: 1rem 0;
	}

	.level-row :global(.label-children) {
		order: -1;
	}

	.level-row :global(.label-wrapper.inline) {
		justify-content: flex-start;
		gap: 0.5rem;
	}

	.level-row :global(.label-wrapper.inline label) {
		justify-content: flex-start;
		gap: 0.4rem;
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

	.topic-sections {
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
	}

	.topic-heading {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		margin-bottom: 0.4rem;
	}

	.topic-title {
		font-family: 'BetterVCR', monospace;
		font-size: 0.8rem;
		margin: 0;
		min-width: 0;
		overflow-wrap: anywhere;
	}

	.topic-heading :global(button) {
		font-size: 0.7rem;
		padding: 0;
		white-space: nowrap;
	}

	.raw-button-row {
		margin: 1rem 0;
		text-align: right;
	}

	.meta-row {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		gap: 2rem;
	}

	@media (max-width: 600px) {
		.meta-row {
			grid-template-columns: minmax(0, 1fr);
		}
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

	.result-section {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		min-width: 0;
		max-width: 100%;
		padding: 0 0 1rem;
	}

	.result-section :global(.keywords) {
		min-width: 0;
		max-width: 100%;
	}

	.result-section :global(.pill) {
		max-width: 100%;
		overflow-wrap: anywhere;
	}

	.result-label {
		font-size: 0.7rem;
		text-transform: uppercase;
		opacity: 0.5;
		letter-spacing: 0.05em;
		margin-top: 1rem;
	}

	.final-section {
		border-bottom: 1px solid rgba(255, 255, 255, 0.08);
		padding-bottom: 0.75rem;
		margin-bottom: 0.5rem;
	}

	.final-content {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
</style>
