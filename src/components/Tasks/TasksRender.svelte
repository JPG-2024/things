<script lang="ts">
	import MasonryGrid from '@/components/MasonryGrid.svelte';
	import BaseTaskComponent from '@/components/Tasks/baseTaskComponent.svelte';
	import { taskRenderRegistry } from '@/components/Tasks/taskRenderRegistry';
	import { workflowStore } from '@/stores/workflowStore.svelte';
	import { createHotkey } from '@tanstack/svelte-hotkeys';
	import { ttsState } from '@/stores/ttsStore.svelte';
	import { ensureAudioContext } from '@/lib/audioContextManager';
	import { viewState } from '@/stores/viewStore.svelte';
	import { fade } from 'svelte/transition';
	import { SvelteSet } from 'svelte/reactivity';
	import { extractDependencyText } from '@/lib/utils/helpers/tasks';
	import Image from '@/components/Image.svelte';
	import YouTubePlayer from '@/components/youtube/YouTubePlayer.svelte';
	import CategoryEditor from '@/components/CategoryEditor.svelte';
	import type { Task } from '@/types/taskRunner.types';
	import type { YouTubePlayerContext } from '@/runners/youtube/tasks/youtubeTasks.shared';

	const stackedTasks = $derived(workflowStore.stackedTasks);

	type StackedEntry = { runId: string; task: Task };

	// Single-pass view model: one loop over stackedTasks instead of
	// ~7 separate find/filter/sort passes per reactive invalidation.
	const taskViews = $derived.by(() => {
		let titleText: string | undefined;
		let contentTask: StackedEntry | undefined;
		let thumbnailEntry: StackedEntry | undefined;
		let categoryData: string[] | undefined;
		let firstCategoryRunId: string | undefined;
		const others: StackedEntry[] = [];

		for (const entry of stackedTasks as StackedEntry[]) {
			const id = entry.task.id;
			if (id === 'title') {
				if (titleText === undefined && entry.task.status === 'done') {
					titleText = entry.task.data as string;
				}
			} else if (id === 'content') {
				contentTask ??= entry;
			} else if (id === 'thumbnail') {
				if (!thumbnailEntry && entry.task.status === 'done') {
					thumbnailEntry = entry;
				}
			} else if (id === 'category') {
				firstCategoryRunId ??= entry.runId;
				if (categoryData === undefined && entry.task.status === 'done') {
					categoryData = entry.task.data as string[];
				}
			} else if (id === 'init-youtube' || id === 'init-web' || id === 'timed-captions') {
				// hidden plumbing tasks, skip
			} else {
				others.push(entry);
			}
		}

		others.sort((a, b) => (a.task.renderOrder ?? 0) - (b.task.renderOrder ?? 0));

		return {
			titleText,
			contentTask,
			thumbnailEntry,
			thumbnailData: thumbnailEntry?.task.data as YouTubePlayerContext | undefined,
			thumbnailComponent: thumbnailEntry?.task.component?.trim(),
			categoryData,
			categoryRunId: firstCategoryRunId ?? workflowStore.focusedRunId ?? null,
			otherTasks: others
		};
	});

	// Cheap O(1) projections so the markup below stays unchanged.
	const titleText = $derived(taskViews.titleText);
	const contentTask = $derived(taskViews.contentTask);
	const thumbnailEntry = $derived(taskViews.thumbnailEntry);
	const thumbnailData = $derived(taskViews.thumbnailData);
	const thumbnailComponent = $derived(taskViews.thumbnailComponent);
	const categoryData = $derived(taskViews.categoryData);
	const categoryRunId = $derived(taskViews.categoryRunId);
	const otherTasks = $derived(taskViews.otherTasks);

	const taskHeights = $state<Record<string, number>>({});

	const canGenerateTTS = $derived(
		viewState.url !== null &&
			stackedTasks.some(
				({ task }) =>
					task.id !== 'content' &&
					task.id === viewState.selectedTaskId &&
					task.status === 'done' &&
					extractDependencyText(task.data).length > 0
			)
	);

	createHotkey(
		'S',
		async () => {
			const entry = stackedTasks.find(
				({ task }) => task.id === viewState.selectedTaskId && task.status === 'done'
			);
			if (!entry?.task.data || entry.task.id === 'content') return;
			const text = extractDependencyText(entry.task.data);
			if (!text.trim()) return;
			void ensureAudioContext();
			ttsState.setTextContents([text]);
			await ttsState.generateTTS(viewState.url!);
		},
		() => ({
			enabled: canGenerateTTS,
			ignoreInputs: true,
			stopPropagation: true,
			preventDefault: true
		})
	);

	let previousDoneKeys = new SvelteSet<string>();
	let initialized = false;

	$effect(() => {
		const currentDoneKeys = new SvelteSet<string>();

		// Iterate the source array directly (no sorted copy) and skip the
		// giant `content` payload: its full markdown must never go through
		// extractDependencyText on every reactive tick.
		for (const entry of stackedTasks) {
			const task = entry.task;
			const key = `${entry.runId}:${task.id}`;

			if (task.status === 'done') {
				currentDoneKeys.add(key);
			}

			if (task.id === 'content') continue;

			if (
				task.enableTTS &&
				task.status === 'done' &&
				viewState.autoSpeechEnabled &&
				!viewState.isCachedArticle &&
				!previousDoneKeys.has(key) &&
				initialized
			) {
				const ttsText = extractDependencyText(task.data);

				if (ttsText.trim()) {
					ttsState.setTextContents([ttsText.trim()]);
					void ttsState.generateTTS(key);
				}
			}
		}

		previousDoneKeys = currentDoneKeys;
		initialized = true;
	});

	/* 	let bottomAnchor: HTMLDivElement | undefined = $state();
	let previousFinishedCount = 0;

	async function scrollToBottom() {
		await tick();
		bottomAnchor?.scrollIntoView({
			behavior: 'smooth',
			block: 'end'
		});
	}

	$effect.pre(() => {
		const finishedCount = stackedTasks.filter(
			({ task }) => task.status === 'done' || task.status === 'failed' || task.status === 'blocked'
		).length;

		if (finishedCount > previousFinishedCount) {
			void scrollToBottom();
		}

		previousFinishedCount = finishedCount;
	}); */

	void taskRenderRegistry;
	void workflowStore;
	void stackedTasks;
</script>

<div class="tasks-container">
	{#if thumbnailData || categoryData || titleText || viewState.url}
		<div class="tasks-header-row">
			{#if thumbnailEntry && thumbnailData}
				<div class="header-col thumbnail-col">
					{#if thumbnailComponent === 'player'}
						<YouTubePlayer data={thumbnailData} />
					{:else}
						<Image
							task={thumbnailEntry.task}
							runId={thumbnailEntry.runId}
							componentProps={thumbnailEntry.task.componentProps}
						/>
					{/if}
				</div>
			{/if}

			{#if categoryData || titleText || viewState.url}
				<div class="header-col category-col">
					{#if titleText}
						<div class="tasks-title">{titleText}</div>
					{/if}
					{#if viewState.url && !workflowStore.isAnyRunning}
						<CategoryEditor
							articleUrl={viewState.url}
							runId={categoryRunId}
							value={categoryData ?? []}
						/>
					{/if}
				</div>
			{/if}
		</div>
	{/if}

	{#if otherTasks.length > 0}
		<MasonryGrid
			items={otherTasks}
			keyOf={(entry) => `${entry.runId}:${entry.task.id}`}
			layoutIndex={viewState.masonryTasksLayoutIndex}
			onLayoutIndexChange={(value) => {
				viewState.masonryTasksLayoutIndex = value;
			}}
			columnOffset={viewState.masonryTasksColumnOffset}
			onColumnOffsetChange={(value) => {
				viewState.masonryTasksColumnOffset = value;
			}}
			spanOf={(entry) => entry.task.gridSpan ?? 1}
		>
			{#snippet children(entry)}
				{@const task = entry.task}
				{@const skipRender =
					task.visible === false && task.status !== 'running' && task.status !== 'pending'}
				{@const componentKey = task.component?.trim()}
				{@const componentProps = task.componentProps}
				{@const Renderer = componentKey ? taskRenderRegistry[componentKey] : undefined}
				{@const taskKey = `${entry.runId}:${entry.task.id}`}

				{#if !skipRender}
					{#if Renderer && task.status === 'done'}
						<div
							class="task-wrapper"
							transition:fade={{ duration: 250 }}
							onmouseenter={() => {
								viewState.selectedTaskId = task.id;
							}}
							role="group"
						>
							<BaseTaskComponent {task} runId={entry.runId} {componentProps}>
								<Renderer {task} runId={entry.runId} {componentProps} />
							</BaseTaskComponent>
						</div>
					{:else if task.status === 'running'}
						<div
							class="task-wrapper"
							style:height={taskHeights[taskKey] ? `${taskHeights[taskKey]}px` : undefined}
							onmouseenter={() => {
								viewState.selectedTaskId = task.id;
							}}
							role="group"
						>
							<BaseTaskComponent {task} runId={entry.runId} {componentProps}>
								{#if Renderer}
									<Renderer {task} runId={entry.runId} {componentProps} />
								{/if}
							</BaseTaskComponent>
						</div>
					{:else if task.status === 'editing'}
						<div
							class="task-wrapper"
							transition:fade={{ duration: 250 }}
							onmouseenter={() => {
								viewState.selectedTaskId = task.id;
							}}
							role="group"
						>
							<BaseTaskComponent {task} runId={entry.runId} {componentProps}></BaseTaskComponent>
						</div>
					{:else if task.status === 'pending'}
						<div
							class="task-wrapper"
							transition:fade={{ duration: 250 }}
							onmouseenter={() => {
								viewState.selectedTaskId = task.id;
							}}
							role="group"
						>
							<BaseTaskComponent {task} runId={entry.runId} {componentProps}></BaseTaskComponent>
						</div>
					{:else if task.status === 'failed'}
						<div
							class="task-wrapper"
							onmouseenter={() => {
								viewState.selectedTaskId = task.id;
							}}
							role="group"
						>
							<BaseTaskComponent {task} runId={entry.runId} {componentProps} />
						</div>
					{/if}
				{/if}
			{/snippet}
		</MasonryGrid>
	{/if}

	{#if contentTask}
		{@const task = contentTask.task}
		{@const skipRender =
			task.visible === false && task.status !== 'running' && task.status !== 'pending'}
		{@const componentKey = task.component?.trim()}
		{@const componentProps = task.componentProps}
		{@const Renderer = componentKey ? taskRenderRegistry[componentKey] : undefined}
		{@const taskKey = `${contentTask.runId}:${task.id}`}

		{#if !skipRender}
			{#if Renderer && task.status === 'done'}
				<div
					class="task-wrapper content-task-wrapper"
					transition:fade={{ duration: 250 }}
					onmouseenter={() => {
						viewState.selectedTaskId = task.id;
					}}
					role="group"
				>
					<BaseTaskComponent {task} runId={contentTask.runId} {componentProps}>
						<Renderer {task} runId={contentTask.runId} {componentProps} />
					</BaseTaskComponent>
				</div>
			{:else if task.status === 'running'}
				<div
					class="task-wrapper content-task-wrapper"
					style:height={taskHeights[taskKey] ? `${taskHeights[taskKey]}px` : undefined}
					onmouseenter={() => {
						viewState.selectedTaskId = task.id;
					}}
					role="group"
				>
					<BaseTaskComponent {task} runId={contentTask.runId} {componentProps}>
						{#if Renderer}
							<Renderer {task} runId={contentTask.runId} {componentProps} />
						{/if}
					</BaseTaskComponent>
				</div>
			{:else if task.status === 'editing'}
				<div
					class="task-wrapper content-task-wrapper"
					transition:fade={{ duration: 250 }}
					onmouseenter={() => {
						viewState.selectedTaskId = task.id;
					}}
					role="group"
				>
					<BaseTaskComponent {task} runId={contentTask.runId} {componentProps}></BaseTaskComponent>
				</div>
			{:else if task.status === 'pending'}
				<div
					class="task-wrapper content-task-wrapper"
					transition:fade={{ duration: 250 }}
					onmouseenter={() => {
						viewState.selectedTaskId = task.id;
					}}
					role="group"
				>
					<BaseTaskComponent {task} runId={contentTask.runId} {componentProps}></BaseTaskComponent>
				</div>
			{:else if task.status === 'failed'}
				<div
					class="task-wrapper content-task-wrapper"
					onmouseenter={() => {
						viewState.selectedTaskId = task.id;
					}}
					role="group"
				>
					<BaseTaskComponent {task} runId={contentTask.runId} {componentProps} />
				</div>
			{/if}
		{/if}
	{/if}
</div>

<!-- <div bind:this={bottomAnchor} aria-hidden="true"></div> -->

<style>
	.tasks-container {
		width: 100%;
		padding: 3rem;
	}

	.tasks-title {
		font-family: BetterVCR, monospace;
		font-size: 1.2rem;
		margin-right: auto;
		width: 100%;
		padding: 1rem 0;
		padding-bottom: 2rem;
		font-variant: all-small-caps;
	}

	.tasks-title::after {
		content: '.';
	}

	.task-wrapper {
		min-width: 0;
		display: flex;
		align-items: flex-start;
		width: 100%;
		padding: 1rem;
	}

	.content-task-wrapper {
		width: 100%;
	}

	.tasks-header-row {
		display: flex;
		align-items: flex-start;
		gap: 1.5rem;
		width: 100%;
		padding-bottom: 1rem;
		max-height: 200px;
	}

	.header-col {
		min-width: 0;
		height: 500px;
	}

	.thumbnail-col {
		flex: 0 0 50%;
		max-width: 320px;
	}

	.category-col {
		flex: 1;
		display: flex;
		flex-direction: column;
	}
</style>
