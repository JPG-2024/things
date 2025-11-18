<script lang="ts">
  import { getChatsByArticleId } from '@/lib/utils/database/chatDB'
  import { goto } from '$app/navigation'
  import { onMount } from 'svelte'
  import { chatsRefresh } from '@/stores/chatStore'

  interface Props {
    articleId: number
  }

  let { articleId }: Props = $props()

  let chats = $state<Chat[]>([])

  let loading = $state(true)
  let error = $state<string | null>(null)

  async function loadChats() {
    loading = true
    error = null
    try {
      const result = await getChatsByArticleId(articleId)
      chats = result
    } catch (err) {
      console.error('Error loading chats:', err)
      error = 'Failed to load chats'
    } finally {
      loading = false
    }
  }

  onMount(() => {
    loadChats()
  })

  // Re-run when chatsRefresh changes (no DOM events)
  $effect(() => {
    const _ = $chatsRefresh
    loadChats()
  })

  async function handleGoChat(chatId?: number) {
    await goto(`/chat?chatId=${chatId}`)
  }
</script>

<div class="container">
  {#if loading}
    <p class="loading">Loading chats...</p>
  {:else if error}
    <p class="error">{error}</p>
  {:else if chats.length === 0}
    <p class="empty">No chats available</p>
  {:else}
    <ul class="chats-column">
      {#each chats as chat (chat.id)}
        <button type="button" class="chat-item" onclick={() => goto(`/chat?chatId=${chat.id}`)}>
          <span class="chat-name" style={`view-transition-name: chat-name-${chat.id}`}
            >{chat.name}</span
          >
          <span class="chat-date">{new Date(chat.createdAt).toLocaleDateString()}</span>
        </button>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .container {
    width: 100%;
  }

  .chats-column {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin: 0;
    padding: 0;
    width: 100%;
    list-style: none;
  }

  .chat-item {
    all: unset;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.25rem;
    cursor: pointer;
    box-sizing: border-box;
    border: none;
    border-radius: 8px;
    background: rgba(154, 154, 154, 0.1);
    padding: 0.5rem 1rem;
    width: 100%;
  }
  .chat-name {
    color: var(--primary-color);
    font-weight: 500;
    font-size: 1rem;
  }

  .chat-date {
    color: #666;
    font-size: 0.875rem;
  }

  .loading,
  .error,
  .empty {
    padding: 2rem;
    color: #666;
    text-align: center;
  }

  .error {
    color: #d32f2f;
  }
</style>
