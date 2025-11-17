<script lang="ts">
  import { onMount } from 'svelte'
  import { page } from '$app/state'
  import { navigate } from '@/lib/utils/url'
  import { urlRouter } from '@/lib/urlRouter'
  import LoadingStack from './LoadingStack.svelte'
  import StringReveal from './StringReveal.svelte'
  import { deleteArticleById } from '../lib/utils/database/articleDB'
  import { goto } from '$app/navigation'
  import {
    title,
    cleanAllState,
    domainUrl,
    loading,
    articleId,
    content,
    url,
  } from '@/stores/viewStore'
  import Topbar from './layout/Topbar.svelte'
  import ChatsList from './ChatsList.svelte'
  import Button from './inputs/Button.component.svelte'

  interface Props {
    headerContent?: any
    summaryContent?: any
  }

  const { headerContent, summaryContent } = $props()
  // reactive state for deletion flag (Svelte runes)
  let isDeleting = $state(false)

  onMount(async () => {
    try {
      const paramUrl = (page as any)?.params?.url as string | undefined
      if (!paramUrl) return
      const decodedUrl = decodeURIComponent(paramUrl)

      await urlRouter(decodedUrl)
    } catch (err) {
      console.error(err)
    }
  })

  // Add window scroll event listener on mount, remove on unload, using $effect.pre
  $effect.pre(() => {
    function handleScroll() {
      if (window.scrollX == -2 || window.scrollY == -2) {
        navigate('/')
      }
    }
    window.addEventListener('scroll', handleScroll)
    // Cleanup on component unload
    return () => {
      window.removeEventListener('scroll', handleScroll)
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

  async function handleGoChat(chatId?: number) {
    if (!$domainUrl) return
    await goto(
      `/chat?category=${encodeURIComponent($domainUrl)}&chatId=${chatId}&articleId=${$articleId}`
    )
  }
</script>

<article>
  <Topbar>
    <LoadingStack />
    {#if $articleId && !$loading}
      <button class="delete-btn" onclick={handleDelete} disabled={isDeleting} title="Delete article"
        >✕</button
      >
    {/if}
  </Topbar>

  {#if $url}
    <a class="url-link" href={$url} target="_blank" rel="noopener noreferrer">
      {$url}
    </a>
  {/if}

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

  {#if $content}
    <div class="chat-container">
      <Button label="new chat" onClick={() => handleGoChat()} />
    </div>
  {/if}

  {#if $articleId}
    <ChatsList articleId={$articleId}></ChatsList>
  {/if}
</article>

<style>
  article {
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    gap: 1.5rem;
    padding: 50px 10px;
  }

  .title {
    padding-top: 1px;
    width: 90vw;

    text-decoration: underline;
    text-decoration-color: var(--primary-color);
    text-underline-offset: -1px;
    text-transform: uppercase;
  }

  .title :global(.revealer) {
    font-weight: bold;
    font-size: 1.5rem;
    font-family: 'Arial', Times, serif;
  }

  .header {
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    gap: 15px;
    width: 100%;
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

  .url-link {
    color: var(--primary-color);
    font-size: 0.9rem;
    text-decoration: none;
    word-break: break-all;
  }

  @media (prefers-color-scheme: dark) {
    :root {
      background-color: #2f2f2f;
      color: #f6f6f6;
    }
  }
</style>
