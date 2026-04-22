<script lang="ts">
import { onMount } from "svelte";
import Card from "@/components/Card.svelte";
import { urlRouter } from "@/lib/urlRouter/urlRouter";
import { navigate, toVTName } from "@/lib/utils/url";
import {
	getArticlesByProfile,
	type ArticleWithTasks,
} from "@/stores/tasksStore";

let { categoryId, name = "", showTitle = false } = $props();

let articles = $state<ArticleWithTasks[]>([]);
let loading = $state<boolean>(false);

onMount(async () => {
	loading = true;
	const normalizedCategoryId =
		typeof categoryId === "string" ? categoryId : String(categoryId);
	console.log("Fetching articles for categoryId:", normalizedCategoryId);
	articles = await getArticlesByProfile(normalizedCategoryId);
	loading = false;
});

async function handleNavigateToArticle(article: ArticleWithTasks) {
	if (!article.url) return;
	navigate(`/youtube/${encodeURIComponent(article.url)}`);
	await urlRouter(article.url);
}
</script>

<div class="category-widget">


  <Card>
    {#if name && showTitle}
    <h2 class="category-title">{name}</h2>
  {/if}
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

  .delete-btn {
        all: unset;
    cursor: pointer;
    border-radius: 8px;
    padding: 6px 10px;
    color: white;
    font-size: 18px;
    line-height: 1;
  }

  .category-title {
    transform: translateY(10px);
    padding-left: 20px;;
    color: var(--primary-color);
    font-weight: 600;
    font-size: 0.9rem;
    opacity: 0.7;
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
