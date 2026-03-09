<script lang="ts">
import type { Task } from "@/types/taskRunner.types";
import Icon from "../Icon.svelte";
import { calculateDaysAgo } from "@/lib/utils/date";

type Props = {
    task: Task;
};

let { task }: Props = $props();

function getDataContent(key: string): string | null {
    const data = task?.data as Record<string, unknown> | null | undefined;
    if (!data) return null;
    const value = data[key];
    if (typeof value === "string" && value.trim()) {
        return value;
    }
    return null;
}


</script>



{#if task?.data && getDataContent("title") && getDataContent("channel") && getDataContent("views") && getDataContent("uploadDate")}
    <div class="video-info">
        <h3>{getDataContent("title")}</h3>
        <div class="info-row">
            <div class="pill">
                <Icon name="User" />
                <p>{getDataContent("channel")}</p>
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
    color: var(--primary-color)
}

.video-info {
  width: 100%;
  color: white;
}

.pill {
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
