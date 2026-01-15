<script lang="ts">
  import MarkdownRenderer from '@/components/MarkdownRenderer.svelte'
  import { viewState } from '@/stores/viewStore.svelte'
  import { generateResponse } from '@/lib/inference'

  let { content } = $props()
  let additionalInfo = $state<string | null>(null)
  let posibleYoutubeQuery = $state<string | null>(null)

  async function fetchAdditionalInfo(keypoint: string) {
    /*     posibleYoutubeQuery = await generateResponse({
      prompt: `context: "${viewState.content}" \n\n keypoint: "${keypoint}" \n\n generate a youtube search query that would help to find a video related to this keypoint.`,
      systemPrompt:
        'You are a youtube query generator. Answer only with the query, no additional text.',
      temperature: 0.5,
    })

    console.log('Generated YouTube Query:', posibleYoutubeQuery) */

    const prompt = `context: "${viewState.content}" \n\n add additional information present in context about this keypoint: "${keypoint}"`

    const response = await generateResponse({
      prompt,
      systemPrompt: 'Follow rules. Be brief. Always answer in spanish.',
      temperature: 0.2,
    })

    console.log(response)

    additionalInfo = response
  }
</script>

<li>
  <button type="button" class="keypoint-item" onclick={() => fetchAdditionalInfo(content)}>
    <span style="color: {additionalInfo ? 'var(--primary-color)' : 'inherit'}">{content}</span>
    {#if posibleYoutubeQuery}
      <div
        class="youtube-query"
        style="font-size: 0.8em; margin-top: 0.5rem; color: var(--accent-color);"
      >
        Suggested YouTube Query: "{posibleYoutubeQuery}"
      </div>
    {/if}
    {#if additionalInfo}
      <div class="additional-info">
        <MarkdownRenderer content={additionalInfo} fontSize={0.8} />
      </div>
    {/if}
  </button>
</li>

<style>
  /* Keep the same visual styles previously applied to each keypoint <li> */
  .keypoint-item {
    /* remove li sryles */
    all: unset;
    color: white;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    margin-bottom: 1rem;
    padding: 0.2rem 0.75rem;
    border-left: 3px solid var(--primary-color);
    background-color: var(--card-bg-secondary, rgba(255, 255, 255, 0.05));
    border-radius: 4px;
    text-align: left;
  }

  .additional-info {
    font-size: 0.9em;
  }
</style>
