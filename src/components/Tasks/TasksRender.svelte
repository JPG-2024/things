<script lang="ts">
	import BaseTaskComponent from '@/components/Tasks/baseTaskComponent.svelte';
	import EditTaskComponent from '@/components/Tasks/EditTaskComponent.svelte';
	import TaskError from '@/components/Tasks/TaskError.svelte';
	import { taskRenderRegistry } from '@/components/Tasks/taskRenderRegistry';
	import { workflowStore } from '@/stores/workflowStore.svelte';
	import { createHotkey } from '@tanstack/svelte-hotkeys';
	import { ttsState } from '@/stores/ttsStore.svelte';
	import { ensureAudioContext } from '@/lib/audioContextManager';
	import { viewState } from '@/stores/viewStore.svelte';
	import { fade } from 'svelte/transition';
	import { SvelteSet } from 'svelte/reactivity';

	const stackedTasks = $derived(workflowStore.stackedTasks);
	const sortedTasks = $derived(
		[...stackedTasks].sort((a, b) => (a.task.renderOrder ?? 0) - (b.task.renderOrder ?? 0))
	);

	const taskHeights = $state<Record<string, number>>({});

	function measureDoneHeight(node: HTMLDivElement, key: string) {
		if (!(key in taskHeights)) {
			taskHeights[key] = node.offsetHeight;
		}
		return {
			destroy() {}
		};
	}

	const canGenerateTTS = $derived(
		viewState.url !== null &&
			stackedTasks.some(
				({ task }) =>
					task.id === viewState.selectedTaskId &&
					task.status === 'done' &&
					typeof task.data === 'string'
			)
	);

	createHotkey(
		'S',
		async () => {
			const entry = stackedTasks.find(
				({ task }) => task.id === viewState.selectedTaskId && task.status === 'done'
			);
			if (!entry?.task.data || typeof entry.task.data !== 'string') return;
			void ensureAudioContext();
			ttsState.setTextContents([entry.task.data]);
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
				let ttsText: string | undefined;
				if (typeof task.data === 'string') {
					ttsText = task.data;
				} else if (Array.isArray(task.data)) {
					ttsText = task.data.map(String).join(' ');
				}

				if (ttsText?.trim()) {
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

<div class="tasks-grid">
	{#each sortedTasks as entry (`${entry.runId}:${entry.task.id}`)}
		{@const task = entry.task}
		{@const componentKey = task.component?.trim()}
		{@const componentProps = task.componentProps}
		{@const Renderer = componentKey ? taskRenderRegistry[componentKey] : undefined}
		{@const taskKey = `${entry.runId}:${entry.task.id}`}

		{#if Renderer && task.status === 'done'}
			<div
				class="task-wrapper"
				class:span-2={(task.gridSpan ?? 3) === 2}
				class:span-3={(task.gridSpan ?? 3) === 3}
				transition:fade={{ duration: 250 }}
				// use:measureDoneHeight={taskKey}
			>
				<BaseTaskComponent {task} runId={entry.runId} {componentProps}>
					<Renderer {task} runId={entry.runId} {componentProps} />
				</BaseTaskComponent>
			</div>
		{:else if task.status === 'running'}
			<div
				class="task-wrapper"
				class:span-2={(task.gridSpan ?? 3) === 2}
				class:span-3={(task.gridSpan ?? 3) === 3}
				style:height={taskHeights[taskKey] ? `${taskHeights[taskKey]}px` : undefined}
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
				class:span-2={(task.gridSpan ?? 3) === 2}
				class:span-3={(task.gridSpan ?? 3) === 3}
				transition:fade={{ duration: 250 }}
			>
				<BaseTaskComponent {task} runId={entry.runId} {componentProps}>
					<EditTaskComponent {task} runId={entry.runId} {componentProps} />
				</BaseTaskComponent>
			</div>
		{:else if task.status === 'pending'}
			<div
				class="task-wrapper"
				class:span-2={(task.gridSpan ?? 3) === 2}
				class:span-3={(task.gridSpan ?? 3) === 3}
				transition:fade={{ duration: 250 }}
			>
				<BaseTaskComponent {task} runId={entry.runId} {componentProps}></BaseTaskComponent>
			</div>
		{:else if task.status === 'failed'}
			<div
				class="task-wrapper task-wrapper--error"
				class:span-2={(task.gridSpan ?? 3) === 2}
				class:span-3={(task.gridSpan ?? 3) === 3}
			>
				<TaskError {task} runId={entry.runId} />
			</div>
		{/if}
	{/each}
</div>

<!-- <div bind:this={bottomAnchor} aria-hidden="true"></div> -->

<style>
	.tasks-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
		gap: 1rem;
		width: 100%;
	}

	.task-wrapper {
		min-width: 0;
		display: flex;
		align-items: center;
	}

	.task-wrapper--error {
		align-items: stretch;
	}

	.task-wrapper.span-2 {
		grid-column: span 2;
	}

	.task-wrapper.span-3 {
		grid-column: span 3;
	}

	.pending-placeholder {
		padding: 1rem;
		opacity: 0.5;
		font-style: italic;
	}
</style>
