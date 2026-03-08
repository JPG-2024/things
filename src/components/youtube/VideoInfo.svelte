<script lang="ts">
import type { Task } from "@/types/taskRunner.types";
import Icon from "../Icon.svelte";

type Props = {
	task: Task;
};

let { task }: Props = $props();

function getDataContent(key: string): string {
    if (!task || !task.data || !task.data.videoMeta) return "Unknown";
    const content = task.data.videoMeta.find((item) => item.name === key)?.textContent;
    return content || "Unknown";
}

function calculateDaysAgo(uploadDate: string): string {
	const uploadTime = new Date(uploadDate).getTime();
	const now = Date.now();
	const diffInMs = now - uploadTime;
	const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));

	if (diffInDays < 1) {
		return "Today";
	} else if (diffInDays === 1) {
		return "1 day ago";
	} else {
		return `${diffInDays} days ago`;
	}
}
</script>




{#if task && task.data && task.data.videoMeta}
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
              <p>{calculateDaysAgo(getDataContent("uploadDate"))}</p>
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
