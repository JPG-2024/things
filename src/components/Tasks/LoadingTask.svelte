<script lang="ts">
import { fade } from "svelte/transition";
import Pill from "@/components/Pill.svelte";
import { viewState } from "@/stores/viewStore.svelte";
import type { Task } from "@/types/taskRunner.types";

type Props = {
	task: Task;
};

let { task }: Props = $props();

type PillStatus = "loading" | "error" | "idle" | "done";

const getPillStatus = (status?: Task["status"]): PillStatus => {
	if (status === "running") return "loading";
	if (status === "failed" || status === "blocked") return "error";
	if (status === "done") return "done";
	return "idle";
};
</script>

{#if task.status !== 'done' || viewState.showAllTasks}
  <div class="pill" transition:fade={{ duration: 500 }}>
    <Pill status={getPillStatus(task.status)} text={task.name} />
    {#if task.error}
      <p>{task.error}</p>
    {/if}
  </div>
{/if}

<style>
  .pill {
    width: max-content;
  }
</style>
