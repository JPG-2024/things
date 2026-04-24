<script lang="ts">
import { onMount } from "svelte";
import Card from "@/components/Card.svelte";
import Icon from "@/components/Icon.svelte";
import { urlRouter } from "@/lib/urlRouter/urlRouter";
import { navigate, toVTName } from "@/lib/utils/url";
import {
  deleteProfileById,
	getArticlesByProfile,
	type ArticleWithTasks,
} from "@/stores/tasksStore";

interface Props {
  categoryId: string;
  name?: string;
  showTitle?: boolean;
  onDeleted?: (profileId: string) => void | Promise<void>;
}

let {
  categoryId,
  name = "",
  showTitle = false,
  onDeleted,
}: Props = $props();

let articles = $state<ArticleWithTasks[]>([]);
let loading = $state<boolean>(false);
let deleting = $state<boolean>(false);

onMount(async () => {
	loading = true;
	const normalizedCategoryId =
		typeof categoryId === "string" ? categoryId : String(categoryId);
	articles = await getArticlesByProfile(normalizedCategoryId);
	console.log(
		"Fetching articles for categoryId:",
		normalizedCategoryId,
		"Articles:",
		articles
	);
	loading = false;
});

async function handleNavigateToArticle(article: ArticleWithTasks) {
	if (!article.url) return;
	navigate(`/youtube/${encodeURIComponent(article.url)}`);
	await urlRouter(article.url);
}

async function handleDeleteProfile() {
  if (deleting) return;

  const normalizedCategoryId =
    typeof categoryId === "string" ? categoryId : String(categoryId);

  deleting = true;
  try {
    const result = await deleteProfileById(normalizedCategoryId);
    if (result.success) {
      articles = [];
      await onDeleted?.(normalizedCategoryId);
    }
  } catch (error) {
    console.error("Error deleting profile", error);
  } finally {
    deleting = false;
  }
}
</script>

<div class="category-widget">
  <Card>
    {#if name && showTitle}
      <div class="title-row">
        <h2 class="category-title">{name}</h2>
        <button
          type="button"
          class="delete-btn"
          onclick={handleDeleteProfile}
          disabled={deleting}
          aria-label={`Delete ${name}`}
          title="Delete profile"
        >
          <Icon name="Trash" />
        </button>
      </div>
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
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    border-radius: 999px;
    padding: 0.3rem;
    background: rgba(255, 255, 255, 0.08);
  }

  .title-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    width: 100%;
    padding-inline: 20px;
  }

  .category-title {
    transform: translateY(10px);
    padding-left: 0;
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
    width: 80px;
    height: 55px;
    object-fit: cover;
    display: block;
  }
</style>
