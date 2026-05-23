<script lang="ts">
	import { tick } from 'svelte';
	import BaseTaskComponent from '@/components/Tasks/baseTaskComponent.svelte';
	import LoadingTask from '@/components/Tasks/LoadingTask.svelte';
	import { taskRenderRegistry } from '@/components/Tasks/taskRenderRegistry';
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

<div class="loading-pills">
	{#each stackedTasks as entry (`${entry.runId}:${entry.task.id}`)}
		{@const task = entry.task}
		{@const componentKey = task.component?.trim()}
		{@const Renderer = componentKey ? taskRenderRegistry[componentKey] : undefined}

		{#if !(Renderer && task.status === 'done')}
			<LoadingTask {task} runId={entry.runId} />
		{/if}
	{/each}
</div>

<div class="tasks-grid">
	{#each stackedTasks as entry (`${entry.runId}:${entry.task.id}`)}
		{@const task = entry.task}
		{@const componentKey = task.component?.trim()}
		{@const componentProps = task.componentProps}
		{@const Renderer = componentKey ? taskRenderRegistry[componentKey] : undefined}

		{#if Renderer && task.status === 'done'}
			<div
				class="task-wrapper"
				class:span-2={task.gridSpan === 2}
				class:span-3={task.gridSpan === 3}
			>
				<BaseTaskComponent {task} runId={entry.runId} {componentProps}>
					<Renderer {task} runId={entry.runId} {componentProps} />
				</BaseTaskComponent>
			</div>
		{/if}
	{/each}
</div>

<div bind:this={bottomAnchor} aria-hidden="true"></div>

<style>
	.loading-pills {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-bottom: 1rem;
	}

	.tasks-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
		gap: 1rem;
		width: 100%;
	}

	.task-wrapper {
		min-width: 0;
	}

	.task-wrapper.span-2 {
		grid-column: span 2;
	}

	.task-wrapper.span-3 {
		grid-column: span 3;
	}
</style>
