<script lang="ts">
  import { toVTName, navigate, getRouteForDomain } from '@/lib/utils/url'

  // Data provided by +page.ts load
  let { data } = $props()
  const articles: Array<any> = data.articles ?? []
</script>

<div class="container">
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
                class="mini-img"
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
  .container {
  }
  .flex-squares {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 50px;
    margin-top: 2rem;
  }
  .square {
    position: relative;
    align-items: center;
    border-radius: 20%;
    background: rgb(154, 154, 154, 0.1);
    padding: 20px;
    padding-left: 25px;
    width: 180px;
    height: 180px;
    color: white;
    font-weight: bold;
  }

  .img-flex {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-start;
    align-items: flex-start;
    gap: 10px;
    width: 100%;
    height: 100%;
  }

  .mini-img {
    border-radius: 15px;
    width: 50px;
    height: 50px;
    object-fit: cover;
  }

  .img-button {
    transition: transform 0.2s ease-in-out;
    cursor: pointer;
    border: none;
    background: none;
    padding: 0;
  }

  .img-button:hover {
    transform: scale(1.05);
  }

  .img-button:active {
    transform: scale(0.98);
  }
</style>
