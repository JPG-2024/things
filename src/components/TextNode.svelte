<script lang="ts">
import { taskRunner } from "@/runners/taskRunner.svelte";

type Props = {
	taskId: string;
};

let { taskId }: Props = $props();

const data = $derived(taskRunner.getTaskData(taskId));
</script>

{#if typeof data === 'string'}
  {data}
{:else if data != null}
  <pre>{JSON.stringify(data, null, 2)}</pre>
{/if}
