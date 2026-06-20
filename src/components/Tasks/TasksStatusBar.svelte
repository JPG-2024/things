<script lang="ts">
	import { taskRenderRegistry } from '@/components/Tasks/taskRenderRegistry';
	import { workflowStore } from '@/stores/workflowStore.svelte';
	import { viewState } from '@/stores/viewStore.svelte';
	import LoadingTask from '@/components/Tasks/LoadingTask.svelte';

	const stackedTasks = $derived(workflowStore.stackedTasks);
	const hasActiveTasks = $derived(
		stackedTasks.some(({ task }) => {
			const s = task.status;
			return s === 'running' || s === 'failed' || s === 'blocked' || viewState.showAllTasks;
		})
	);

	void taskRenderRegistry;
	void stackedTasks;
</script>

{#if hasActiveTasks}
	<div class="loading-pills">
		{#each stackedTasks as entry (`${entry.runId}:${entry.task.id}`)}
			{@const task = entry.task}
			{@const componentKey = task.component?.trim()}
			{@const Renderer = componentKey ? taskRenderRegistry[componentKey] : undefined}

			{#if viewState.showAllTasks || !(Renderer && task.status === 'done')}
				<LoadingTask {task} runId={entry.runId} />
			{/if}
		{/each}
	</div>
{/if}

{#if viewState.subStatus}
	<div class="sub-status">
		{viewState.subStatus}
	</div>
{/if}

<style>
	.loading-pills {
		display: flex;
		justify-content: center;
		align-items: center;
		flex-wrap: wrap;
		gap: 1rem;
		position: fixed;
		bottom: 0;
		left: 0;
		right: 0;
		padding: 2rem;
		z-index: 9999;
	}

	.sub-status {
		position: fixed;
		bottom: 1rem;
		right: 1rem;
		color: white;
		z-index: 9999;
	}
</style>
