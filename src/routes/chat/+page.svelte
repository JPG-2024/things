<script lang="ts">
  import { onMount, onDestroy } from 'svelte'

  import Input from '@/components/inputs/Input.component.svelte'
  import MarkdownRenderer from '@/components/MarkdownRenderer.svelte'
  import Topbar from '@/components/layout/Topbar.svelte'
  import { CHAT_SYSTEM_PROMPT } from '@/constants'
  import { createStreamingChat } from '@/lib/utils/ollama/chat'
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
  import { searchDocumentsInLeann } from '@/lib/utils/leann'

  let chatId = $state<number | null>(null)
  let articleId = $state<number | null>(null)
  let userInput = $state('')

  onMount(async () => {
    const urlParams = new URLSearchParams(window.location.search)
    const chatIdParam = Number(urlParams.get('chatId'))

    if (chatIdParam) {
      chatId = chatIdParam
    } else {
      // Si no hay chatId, crear uno nuevo
      const articleIdParam = Number(urlParams.get('articleId'))
      articleId = articleIdParam || null
      const newChatData = await newChat({ articleId: articleIdParam })
      chatId = Number(newChatData.lastInsertId)
    }
  })

  onDestroy(async () => {
    if (!chatId || $messages.length === 0) return

    // Si no hay mensajes, eliminar el chat
    if ($messages.length === 0) {
      await deleteChatById(chatId)
    } else {
      // Actualizar el nombre del chat con el primer mensaje
      await updateChatName(chatId, $messages[0].content.slice(0, 50) || 'New Chat')
    }

    // Clear messages on page unload
    messages.set([])
  })

  function filterContextFromContent(content: string): string {
    // Remove everything starting from "---" (context separator)
    const parts = content.split('---')
    return parts[0].trim()
  }

  async function handlePrompt(prompt: string) {
    if (!prompt.trim()) return

    userInput = ''
    startStreaming()

    try {
      // Fetch article content as context if available
      let contextContent = ''
      if (articleId) {
        const article = await getArticleById(articleId)
        if (article?.content) {
          contextContent = `\n\n---\nContext:\n${article.content} \n---\n`
        }
      }

      // Combine prompt with context and system prompt for the API call
      const promptWithContext = prompt + contextContent

      // Add user message to store
      messages.update((msgs) => [...msgs, { role: 'user', content: prompt }])

      // Stream de la respuesta
      let fullContent = ''
      for await (const chunk of createStreamingChat({
        model: 'LiquidAI/LFM2-2.6B-Exp',
        messages: [
          {
            role: 'system',
            content: CHAT_SYSTEM_PROMPT,
          },
          { role: 'user', content: promptWithContext },
        ],
        options: {
          temperature: 0.1,
          min_p: 0.1,
          repeat_penalty: 1.2,
          max_tokens: 500,
        },
      })) {
        if (chunk.choices[0]?.delta?.content) {
          fullContent += chunk.choices[0].delta.content
        }
        setStreamingContent(fullContent)

        if (chunk.done) {
          // Add assistant response to messages
          messages.update((msgs) => [
            ...msgs,
            {
              role: 'assistant',
              content: fullContent,
            },
          ])
          stopStreaming()
        }
      }
    } catch (err) {
      console.error('Error en chat:', err)
      stopStreaming()

      // Mostrar error al usuario
      messages.update((msgs) => [
        ...msgs,
        {
          role: 'assistant',
          content: '❌ Error: model not found.',
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
