<script lang="ts">
import type { Task } from "@/types/taskRunner.types";
import MarkdownRenderer from "../MarkdownRenderer.svelte";

type Props = {
	runId?: string;
	task: Task;
};

let { runId = undefined, task }: Props = $props();

void runId;
</script>

{#if typeof task.data === 'string'}
    <MarkdownRenderer content={task.data} />
{:else if typeof task.data === 'object' && task.data !== null}
  <pre class="wrapped-output">{JSON.stringify(task.data, null, 2)}</pre>
{:else if task.data != null}
  <div>{task.data}</div>
{/if}

<style>
  .wrapped-output {
    text-wrap: auto;
    max-width: 100%;
  }
</style>
