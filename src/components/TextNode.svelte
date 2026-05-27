<script lang="ts">
	import { workflowStore } from '@/stores/workflowStore.svelte';

	type Props = {
		runId?: string;
		taskId: string;
	};

	let { runId = undefined, taskId }: Props = $props();

	const data = $derived.by(() =>
		runId
			? workflowStore.getTaskData(runId, taskId)
			: workflowStore.focusedRun?.runner.getTaskData(taskId)
	);

	void workflowStore;
	void data;
</script>

{#if typeof data === 'string'}
	{data}
{:else if data != null}
	<pre>{JSON.stringify(data, null, 2)}</pre>
{/if}
