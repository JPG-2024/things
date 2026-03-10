<script lang="ts">
import { blur } from "svelte/transition";
import InstantResponse from "@/components/InstantResponse.svelte";
import KeypointItem from "@/components/KeypointItem.svelte";
import MarkdownRenderer from "@/components/MarkdownRenderer.svelte";
import PostView from "@/components/PostView.svelte";
import TasksRender from "@/components/Tasks/TasksRender.svelte";
import { toVTName } from "@/lib/utils/url";
import { viewState } from "@/stores/viewStore.svelte";
import { page } from "$app/state";

const articleUrl = page.params.url;
let showIframe = false;
</script>

<PostView headerContent={null} summaryContent={summaryContentSnippet} />


{#snippet summaryContentSnippet()}
  {#if typeof viewState.summary === 'string'}
    {#if viewState.summary}
      <div class="summary-section" transition:blur={{ duration: 200 }}>
        <MarkdownRenderer content={viewState.summary} />
      </div>
    {/if}
  {/if}

  <TasksRender />

  {#if viewState.keypoints && viewState.keypoints.length > 0}
    <div class="keypoints-section" transition:blur={{ duration: 1000 }}>
      <ul class="keypoints-list">
        {#each viewState.keypoints as keypoint}
          {#if keypoint}
            <KeypointItem content={keypoint} />
          {/if}
        {/each}
      </ul>
    </div>
  {/if}

  {#if viewState.questions && viewState.questions.length > 0}
    <div class="keypoints-section" transition:blur={{ duration: 1000 }}>
      <ul class="keypoints-list">
        {#each viewState.questions as question}
          {#if question}
            <KeypointItem content={question} />
          {/if}
        {/each}
      </ul>
    </div>
  {/if}
{/snippet}

<style>
  .summary-section,
  .keypoints-section {
    padding: 1rem;
    margin-bottom: 15px;
  }

  .keypoints-list {
    list-style: none;
    padding: 0;
    margin: 0;
  }

  @media (prefers-color-scheme: dark) {
    :root {
      background-color: #2f2f2f;
      color: #f6f6f6;
    }
  }
</style>
