<script lang="ts">
	import { tick } from 'svelte';
	import BaseTaskComponent from '@/components/Tasks/baseTaskComponent.svelte';
	import LoadingTask from '@/components/Tasks/LoadingTask.svelte';
	import { taskRenderRegistry } from '@/components/Tasks/taskRenderRegistry';
	import { viewState } from '@/stores/viewStore.svelte';
	import { workflowManager } from '@/runners/workflowManager.svelte';

	const stackedTasks = $derived.by(() => workflowManager.stackedTasks);

	let bottomAnchor: HTMLDivElement | undefined = $state();
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
	});

	void LoadingTask;
	void taskRenderRegistry;
	void workflowManager;
	void stackedTasks;
</script>

{#each stackedTasks as entry (`${entry.runId}:${entry.task.id}`)}
	{@const task = entry.task}
	{@const componentKey = task.component?.trim()}
	{@const componentProps = task.componentProps}
	{@const Renderer = componentKey ? taskRenderRegistry[componentKey] : undefined}

	{#if Renderer && task.status === 'done'}
		<BaseTaskComponent {task} runId={entry.runId} {componentProps}>
			<Renderer {task} runId={entry.runId} {componentProps} />
		</BaseTaskComponent>
	{:else if task.status === 'done' && viewState.showAllTasks}
		<LoadingTask {task} runId={entry.runId} />
	{:else if task.status === 'running' || task.status === 'pending'}
		<LoadingTask {task} runId={entry.runId} />
	{:else if task.status === 'failed' || task.status === 'blocked'}
		<LoadingTask {task} runId={entry.runId} />
	{/if}
{/each}

<div bind:this={bottomAnchor} aria-hidden="true"></div>
