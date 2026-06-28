<script lang="ts">
	import { taskRenderRegistry } from '@/components/Tasks/taskRenderRegistry';
	import { workflowStore } from '@/stores/workflowStore.svelte';
	import { viewState } from '@/stores/viewStore.svelte';
	import LoadingTask from '@/components/Tasks/LoadingTask.svelte';
	import { fade } from 'svelte/transition';

	const stackedTasks = $derived(workflowStore.stackedTasks);
	const hasActiveTasks = $derived(
		stackedTasks.some(({ task }) => {
			const s = task.status;
			return s === 'running' /* || s === 'failed' */ || s === 'blocked' || viewState.showAllTasks;
		})
	);

	void taskRenderRegistry;
	void stackedTasks;
</script>

{#if hasActiveTasks}
	<div class="task-status-bar" in:fade={{ duration: 200 }} out:fade={{ duration: 200 }}>
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
	</div>
{/if}

{#if viewState.subStatus}
	<div class="sub-status">
		{viewState.subStatus}
	</div>
{/if}

<style>
	.task-status-bar {
		height: 50%;
		display: flex;
		flex-direction: column;
		justify-content: flex-end;
		/* background: linear-gradient(to top, rgba(0, 0, 0, 1), rgba(0, 0, 0, 0)); */
		position: fixed;
		bottom: 0;
		left: 0;
		right: 0;
		padding: 2rem;
		z-index: 1000;
	}

	.loading-pills {
		display: flex;
		justify-content: center;
		align-items: center;
		flex-wrap: wrap;
		gap: 1rem;
		row-gap: 2rem;
	}

	.sub-status {
		position: fixed;
		bottom: 1rem;
		right: 1rem;
		color: white;
		z-index: 9999;
	}
</style>
