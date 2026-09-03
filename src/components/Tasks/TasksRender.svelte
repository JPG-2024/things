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

	const stackedTasks = $derived(workflowStore.stackedTasks);

	const titleText = $derived(
		stackedTasks.find((e) => e.task.id === 'title' && e.task.status === 'done')?.task.data as
			| string
			| undefined
	);
	const sortedTasks = $derived(
		[...stackedTasks].sort((a, b) => (a.task.renderOrder ?? 0) - (b.task.renderOrder ?? 0))
	);

	const contentTask = $derived(sortedTasks.find((e) => e.task.id === 'content'));
	const otherTasks = $derived(sortedTasks.filter((e) => e.task.id !== 'content'));

	const taskHeights = $state<Record<string, number>>({});

	const canGenerateTTS = $derived(
		viewState.url !== null &&
			stackedTasks.some(
				({ task }) =>
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
			if (!entry?.task.data) return;
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

		for (const entry of sortedTasks) {
			const task = entry.task;
			const key = `${entry.runId}:${task.id}`;

			if (task.status === 'done') {
				currentDoneKeys.add(key);
			}

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
	{#if titleText}
		<div class="tasks-title">{titleText}</div>
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

	{#if otherTasks.length > 0}
		<MasonryGrid
			items={otherTasks}
			keyOf={(entry) => `${entry.runId}:${entry.task.id}`}
			layoutIndex={viewState.taskMasonryLayoutIndex}
			onLayoutIndexChange={(value) => {
				viewState.taskMasonryLayoutIndex = value;
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
</div>

<!-- <div bind:this={bottomAnchor} aria-hidden="true"></div> -->

<style>
	.tasks-container {
		width: 100%;
		padding-top: 1rem;
	}

	.tasks-title {
		font-family: CaskaydiaCove NFM Light;
		font-size: 1.4rem;
		margin-right: auto;
		width: 100%;
		padding: 0.6rem;
	}

	.tasks-title::after {
		content: '.';
	}

	.task-wrapper {
		min-width: 0;
		display: flex;
		align-items: flex-start;
		width: 100%;
		padding: 5px;
	}

	.content-task-wrapper {
		width: 100%;
	}
</style>
