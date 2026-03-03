<script lang="ts">
import { onMount } from "svelte";
import Card from "@/components/Card.svelte";
import { urlRouter } from "@/lib/urlRouter";
import { navigate, toVTName } from "@/lib/utils/url";
import { getArticles, type ArticleWithPlayerTask } from "@/stores/tasksStore";

let { categoryId, name = "", showTitle = false } = $props();

let articles = $state<ArticleWithPlayerTask[]>([]);
let loading = $state<boolean>(false);

onMount(async () => {
	loading = true;
	articles = await getArticles();
	console.debug("loaded articles with player tasks", articles);
	loading = false;
});

async function handleNavigateToArticle(article: ArticleWithPlayerTask) {
	if (!article.url) return;
	await urlRouter(article.url);
	navigate(`/youtube/${encodeURIComponent(article.url)}`);
}
</script>

<div class="category-widget">
  {#if name && showTitle}
    <h2 class="category-title">{name}</h2>
  {/if}

  <Card>
    {#if articles?.length}
      <div class="img-flex">
        {#each articles as article (article.url)}
          <button
            type="button"
            class="img-button"
            onclick={() => handleNavigateToArticle(article)}
            aria-label="View article"
          >
            <img
              src={article.thumbnail}
              alt="Article"
              class={`mini-img`}
              style={`view-transition-name: vt-main-image-${toVTName(article.url ?? "")}`}
            />
          </button>
        {/each}
      </div>
    {:else if loading}
      <span>Loading articles...</span>
    {/if}
  </Card>
</div>

<style>
  .category-widget {
    display: flex;
    flex-direction: column;
    width: 100%;
    align-items: center;
    box-sizing: border-box;
  }

  .category-title {
    transform: translateY(10px);
    margin: 0 0 0.5rem 0;
    color: var(--primary-color);
    font-weight: 600;
    font-size: 1.2rem;
    font-family: 'Segoe UI', Courier, monospace;
  }

  .error {
    color: red;
    font-size: 0.9rem;
  }

  .img-flex {
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
    justify-content: center;
    width: 100%;
    padding: 12px;
  }

  .img-button {
    border: none;
    background: none;
    padding: 0;
    cursor: pointer;
    border-radius: 0.5rem;
    overflow: hidden;
    transition: transform 0.2s;
  }

  .img-button:hover {
    transform: scale(1.05);
  }

  .mini-img {
    width: 55px;
    height: 55px;
    object-fit: cover;
    display: block;
  }
</style>
