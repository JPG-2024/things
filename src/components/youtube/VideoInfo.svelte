<script lang="ts">
import type { Task, TaskComponentProps } from "@/types/taskRunner.types";
import Icon from "../Icon.svelte";
import StringReveal from "../StringReveal.svelte";
import { calculateDaysAgo } from "@/lib/utils/date";

type Props = {
	runId?: string;
	task: Task;
	componentProps?: TaskComponentProps;
};

let { runId = undefined, task, componentProps = {} }: Props = $props();

void runId;
void componentProps;

function getDataContent(key: string): string | null {
	console.log("Task data:", task?.data);
	const data = task?.data as Record<string, unknown> | null | undefined;
	if (!data) return null;
	const value = data[key];
	if (typeof value === "string" && value.trim()) {
		return value;
	}
	return null;
}

let title = $derived(task?.data ? getDataContent("title") : null);
</script>



{#if task?.data && getDataContent("title") && getDataContent("profile") && getDataContent("views") && getDataContent("uploadDate")}
    <div class="video-info">
        <h3>{getDataContent("title")}</h3>

        <div class="info-row">
            <div class="pill">
                <Icon name="User" />
                <p class="channel-name">{getDataContent("profile")?.slice(2, 50)}</p>
            </div>
            <div class="pill">
                <Icon name="Eye" />
                <p>{getDataContent("views")}</p>
            </div>
            <div class="pill">
                <Icon name="Calendar" />
                <p>{calculateDaysAgo(getDataContent("uploadDate") || "")}</p>
            </div>
        </div>
    </div>
{/if}


<style>
h3 {
    color: var(--primary-color);
    font-family: Noto Sans Mono;
}

.video-info {
  width: 100%;
  color: white;
}

:global(.revealer) {
    font-size: 24px;
    font-weight: bold;
    color: var(--primary-color);
}

.channel-name {
    font-size: 1rem;
    font-weight: bold;
}

.pill {
    font-size: 0.8rem;
    display: flex;
    align-items: center;
    gap: 0.5rem;
}

.info-row {
    font-size: 0.9rem;
    display: flex;
    gap: 1rem;
    margin-top: 0.5rem;
    justify-content: start;
}
</style>
