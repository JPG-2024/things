<script lang="ts">
  import { toVTName, navigate, getRouteForDomain } from '@/lib/utils/url'

  import Input from '@/components/inputs/Input.component.svelte'
  import { primaryColor } from '@/stores/uiStore'
  // Data provided by +page.ts load
  let { data } = $props()
  const articles: Array<any> = data.articles ?? []

  $effect(() => {
    primaryColor.set('rgb(187, 187, 187)')
  })
</script>

<div class="dashboard-container">
  <h1 class="dashboard-title">Things</h1>

  <Input onChange={(url) => navigate(`/${getRouteForDomain(url)}/${encodeURIComponent(url)}`)} />

  {#if articles.length}
    <div class="flex-squares">
      <div class="square">
        <div class="img-flex">
          {#each articles as article}
            <button
              type="button"
              class="img-button"
              onclick={() =>
                navigate(
                  `/${getRouteForDomain(article.domainUrl)}/${encodeURIComponent(article.url)}`
                )}
              aria-label="View article"
            >
              <img
                src={article?.metadataContent?.['og:image']}
                alt="Article"
                class={`mini-img`}
                style="view-transition-name: {toVTName(article?.metadataContent?.['og:image'])}"
              />
            </button>
          {/each}
        </div>
      </div>
    </div>
  {:else}
    <p>No articles found.</p>
  {/if}
</div>

<style>
  .dashboard-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    box-sizing: border-box;
    padding: 20px;
    width: 100%;
  }

  .dashboard-title {
    margin-bottom: 1rem;
    color: var(--primary-color);
    font-size: 2.2rem;
    font-family: 'Anonymous Pro';
  }

  .flex-squares {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-start;

    margin-top: 2rem;
  }
  .square {
    position: relative;
    align-items: center;
    border-radius: 20%;
    background: rgb(154, 154, 154, 0.1);
    padding: 30px;
    width: 204px;
    height: 204px;
    color: white;
    font-weight: bold;
  }

  .img-flex {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-evenly;
    align-items: flex-start;
    gap: 10px;
    width: 100%;
    height: 100%;
  }

  .mini-img {
    border-radius: 15px;
    width: 58px;
    height: 58px;
    object-fit: cover;
  }

  .img-button {
    transition: transform 0.2s ease-in-out;
    cursor: pointer;
    border: none;
    background: none;
    padding: 0;
  }

  .yt-button::after {
    position: absolute;
    top: 58%;
    left: 50%;
    transform: translate(-50%, -50%);
    content: '▶';
    color: rgb(255, 0, 0);
    font-size: 24px;
  }

  .img-button:hover {
    transform: scale(1.05);
  }

  .img-button:active {
    transform: scale(0.98);
  }
</style>
