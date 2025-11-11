<script lang="ts">
  import { onMount } from 'svelte'
  import { page } from '$app/state'
  import { navigate } from '@/lib/utils/url'
  import { urlRouter } from '@/lib/urlRouter'
  import LoadingStack from './LoadingStack.svelte'
  import StringReveal from './StringReveal.svelte'
  import { getArticleByUrl, deleteArticleById } from '../lib/database'
  import {
    title,
    cleanAllState,
    domainUrl,
    loading,
    loaded,
    articleId,
    setAllViewStoreValues,
  } from '@/stores/viewStore'

  interface Props {
    headerContent?: any
    summaryContent?: any
  }

  const { headerContent, summaryContent } = $props()
  // reactive state for deletion flag (Svelte runes)
  let isDeleting = $state(false)

  async function handleUrlAction(url: string) {
    loading.set(true)

    try {
      cleanAllState()
      await urlRouter(url)
    } catch (err) {
      console.error(err)
    } finally {
      loading.set(false)
    }
  }

  onMount(async () => {
    try {
      const paramUrl = (page as any)?.params?.url as string | undefined
      if (!paramUrl) return
      const decodedUrl = decodeURIComponent(paramUrl)

      const existing = await getArticleByUrl(decodedUrl)
      if (existing) {
        cleanAllState()
        setAllViewStoreValues(existing)
        loaded.set(true)
        loading.set(false)
        return
      }

      await handleUrlAction(decodedUrl)
    } catch (err) {
      console.error(err)
    }
  })

  async function handleDelete() {
    if (!$articleId || isDeleting) return
    try {
      isDeleting = true
      const res = await deleteArticleById($articleId)
      if (res?.success) {
        cleanAllState()
        navigate('/')
      } else {
        console.error('Failed to delete article', res?.error)
      }
    } catch (err) {
      console.error('Error deleting article', err)
    } finally {
      isDeleting = false
    }
  }
</script>

<article>
  <div class="top-bar">
    <div class="top-left">
      {#if $domainUrl}
        <button onclick={() => navigate('/')} class="back-navigation">⬅</button>
        <img
          class="favicon"
          src="https://www.google.com/s2/favicons?sz=64&domain={$domainUrl}"
          alt=""
        />
      {/if}
    </div>
    <div class="top-right">
      <LoadingStack />
      {#if $articleId && !$loading}
        <button
          class="delete-btn"
          onclick={handleDelete}
          disabled={isDeleting}
          title="Delete article">✕</button
        >
      {/if}
    </div>
  </div>

  {#if $title}
    <div class="title">
      <StringReveal message={$title} />
    </div>
  {/if}

  <div class="header">
    {#if headerContent}
      {@render headerContent()}
    {/if}
  </div>

  {#if summaryContent}
    {@render summaryContent()}
  {/if}
</article>

<style>
  article {
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    gap: 1.5rem;
    padding: 100px 10px;
  }

  .title {
    padding-top: 1px;
    width: 90vw;

    text-decoration: underline;
    text-decoration-color: #00ff7b91;
    text-underline-offset: -1px;
    text-transform: uppercase;
  }

  .title :global(.revealer) {
    font-weight: bold;
    font-size: 1.5rem;
    font-family: 'Times New Roman', Times, serif;
  }

  .header {
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    gap: 15px;
    width: 100%;
  }

  .top-bar {
    display: flex;
    position: fixed;
    top: 0px;
    flex-direction: row;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
    backdrop-filter: blur(8px);
    /* border-bottom: 1px solid rgba(255, 255, 255, 0.4); */
    /* border-bottom: solid rgba(2, 2, 2, 0.7); */
    background: rgba(54, 54, 54, 0.6);
    min-height: 75px;
    -webkit-backdrop-filter: blur(5px);
    right: 0;
    left: 0;
    z-index: 10;
    box-sizing: border-box;
  }

  .top-left,
  .top-right {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 10px;
  }

  .back-navigation {
    all: unset;
    cursor: pointer;
    border-radius: 8px;
    padding: 0px 10px;
    padding-top: 5px;
    font-size: 25px;
    text-decoration: none;
  }

  .delete-btn {
    all: unset;
    cursor: pointer;
    border-radius: 8px;
    padding: 6px 10px;
    color: #ff6b6b;
    font-size: 18px;
    line-height: 1;
  }

  .delete-btn[disabled] {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .favicon {
    border-radius: 8px;
    width: 32px;
    height: 32px;
  }

  @media (prefers-color-scheme: dark) {
    :root {
      background-color: #2f2f2f;
      color: #f6f6f6;
    }
  }
</style>
