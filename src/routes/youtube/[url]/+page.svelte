<script lang="ts">
import PostView from "@/components/PostView.svelte";
import TasksRender from "@/components/Tasks/TasksRender.svelte";
import { toVTName } from "@/lib/utils/url";

import { page } from "$app/state";

const articleUrl = page.params.url;
let showIframe = false;
</script>

<PostView headerContent={null} summaryContent={summaryContentSnippet} />


{#snippet summaryContentSnippet()}
  <TasksRender />
{/snippet}

<style>
  @media (prefers-col
  -scheme: dark) {
    :root {
      background-color: #2f2f2f;
      color: #f6f6f6;
    }
  }
</style>
