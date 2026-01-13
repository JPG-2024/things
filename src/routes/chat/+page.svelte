<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import { invoke } from '@tauri-apps/api/core'
  import { listen } from '@tauri-apps/api/event'

  import Input from '@/components/inputs/Input.component.svelte'
  import MarkdownRenderer from '@/components/MarkdownRenderer.svelte'
  import Topbar from '@/components/layout/Topbar.svelte'
  import { CHAT_SYSTEM_PROMPT } from '@/constants'
  import {
    messages,
    isStreaming,
    setStreamingContent,
    startStreaming,
    stopStreaming,
    allMessages,
  } from '@/stores/chatStore'

  import { newChat, deleteChatById, updateChatName } from '@/lib/utils/database/chatDB'
  import { getArticleById } from '@/lib/utils/database/articleDB'

  let chatId = $state<number | null>(null)
  let articleId = $state<number | null>(null)
  let userInput = $state('')
  let unlistenChatToken: (() => void) | null = null

  onMount(async () => {
    const urlParams = new URLSearchParams(window.location.search)
    const chatIdParam = Number(urlParams.get('chatId'))

    if (chatIdParam) {
      chatId = chatIdParam
    } else {
      const articleIdParam = Number(urlParams.get('articleId'))
      articleId = articleIdParam || null
      const newChatData = await newChat({ articleId: articleIdParam })
      chatId = Number(newChatData.lastInsertId)
    }

    // Setup listener for streaming tokens
    unlistenChatToken = await listen('chat-token', (event: any) => {
      const token = event.payload.token
      messages.update((msgs) => {
        const lastMsg = msgs[msgs.length - 1]
        if (lastMsg?.role === 'assistant') {
          lastMsg.content += token
        }
        return msgs
      })
    })
  })

  onDestroy(async () => {
    if (unlistenChatToken) {
      unlistenChatToken()
    }

    if (!chatId || $messages.length === 0) return

    if ($messages.length === 0) {
      await deleteChatById(chatId)
    } else {
      await updateChatName(chatId, $messages[0].content.slice(0, 50) || 'New Chat')
    }

    messages.set([])
  })

  function filterContextFromContent(content: string): string {
    const parts = content.split('---')
    return parts[0].trim()
  }

  async function handlePrompt(prompt: string) {
    if (!prompt.trim()) return

    userInput = ''
    startStreaming()

    try {
      // Build conversation messages
      const conversationMessages = [
        ...$messages.map((msg) => ({
          role: msg.role,
          content: msg.content,
        })),
        { role: 'user', content: prompt },
      ]

      // Add user message to store
      messages.update((msgs) => [...msgs, { role: 'user', content: prompt }])

      // Add empty assistant message for streaming
      messages.update((msgs) => [...msgs, { role: 'assistant', content: '' }])

      // Call generate_chat_response
      await invoke('generate_chat_response', {
        messages: conversationMessages,
        options: {
          model: 'LiquidAI/LFM2-2.6B-Exp',
          system_prompt: CHAT_SYSTEM_PROMPT,
          temperature: 0.1,
          max_tokens: 500,
        },
        stream: true,
      })

      stopStreaming()
    } catch (err) {
      console.error('Error en chat:', err)
      stopStreaming()

      messages.update((msgs) => [
        ...msgs,
        {
          role: 'assistant',
          content: '❌ Error: ' + (err instanceof Error ? err.message : String(err)),
        },
      ])
    }
  }
</script>

<div class="messages-container">
  <Topbar>
    {#if chatId}
      <span class="chat-title" style={`view-transition-name: chat-name-${chatId};`}> Chat </span>
    {/if}
  </Topbar>

  <div class="messages">
    {#each $messages.filter((msg) => msg.role !== 'system') as msg}
      <div class="message {msg.role}">
        {#if msg.role === 'user'}
          <span class="user">{filterContextFromContent(msg.content)}</span>
        {:else}
          <MarkdownRenderer content={msg.content} />
        {/if}
      </div>
    {/each}
  </div>

  <div class="input-container">
    <Input
      placeholder="Escribe un mensaje..."
      bind:value={userInput}
      onEnter={handlePrompt}
      disabled={$isStreaming}
    />
  </div>
</div>

<style>
  .messages-container {
    display: flex;
    position: relative;
    flex-direction: column;
    box-sizing: border-box;
    padding: 100px 1.5rem;
    width: 100%;
    height: 100%;
  }

  .chat-title {
    flex: 1;
    padding-right: 15%;
    font-weight: bold;
    font-size: 1.2rem;
    text-align: center;
  }

  .messages {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 1rem;
    padding-bottom: 80px;
    overflow-y: auto;
  }

  .message {
    padding: 0.75rem;
    border-radius: 8px;
  }

  .message.user {
    align-self: flex-end;
    max-width: 80%;
  }

  .message.assistant {
    align-self: flex-start;
    max-width: 85%;
  }

  .message.system {
    align-self: center;
    font-size: 0.9rem;
    max-width: 90%;
  }

  .user {
    color: var(--primary-color);
    font-weight: bold;
    font-size: 1rem;
  }

  .system {
    color: #856404;
    font-style: italic;
  }

  .input-container {
    position: fixed;
    right: 0;
    bottom: 0;
    left: 0;
    box-sizing: border-box;
    padding: 1rem;
    width: 100%;
    backdrop-filter: blur(10px);
  }
</style>
