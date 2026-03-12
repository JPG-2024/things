<script lang="ts">
import { workflowManager } from "@/runners/workflowManager.svelte";

type Props = {
	runId?: string;
	taskId: string;
};

let { runId = undefined, taskId }: Props = $props();

const data = $derived.by(() =>
	runId
		? workflowManager.getTaskData(runId, taskId)
		: workflowManager.activeRunner?.getTaskData(taskId)
);

void workflowManager;
void data;
</script>

{#if typeof data === 'string'}
  {data}
{:else if data != null}
  <pre>{JSON.stringify(data, null, 2)}</pre>
{/if}
