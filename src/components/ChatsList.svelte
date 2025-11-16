<script lang="ts">
  import { getChatsByArticleId } from '@/lib/utils/database/chatDB'
  import { goto } from '$app/navigation'

  interface Props {
    articleId: number
  }

  let { articleId }: Props = $props()

  let chats = $state<Chat[]>([])

  let loading = $state(true)
  let error = $state<string | null>(null)

  // Cargar chats cuando el componente se monta o cuando cambia articleId
  $effect(() => {
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

    loadChats()
  })

  async function handleGoChat(chatId?: number) {
    await goto(`/chat?chatId=${chatId}`)
  }
</script>

<div class="chats-list">
  {#if loading}
    <p class="loading">Loading chats...</p>
  {:else if error}
    <p class="error">{error}</p>
  {:else if chats.length === 0}
    <p class="empty">No chats available</p>
  {:else}
    <ul class="chats-column">
      {#each chats as chat (chat.id)}
        <li>
          <button type="button" class="chat-item" onclick={() => handleGoChat(chat.id)}>
            <span class="chat-name">{chat.name}</span>
            <span class="chat-date">{new Date(chat.createdAt).toLocaleDateString()}</span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .chats-list {
    padding: 1rem;
    width: 100%;
  }

  .chats-column {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin: 0;

    padding: 0;
    list-style: none;
    .chat-item {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
      transition: background-color 0.2s;
      cursor: pointer;
      border: none;
      border-radius: 8px;

      padding: 0.75rem 1rem;
      width: 100%;
      text-align: left;
    }

    .chat-item:hover,
    .chat-item:focus {
      outline: none;
    }
  }

  .chat-name {
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
