<script lang="ts">
  import { onMount, onDestroy } from 'svelte'

  import Input from '@/components/inputs/Input.component.svelte'
  import MarkdownRenderer from '@/components/MarkdownRenderer.svelte'
  import Topbar from '@/components/layout/Topbar.svelte'
  import { CHAT_SYSTEM_PROMPT } from '@/constants'
  import { ChatService } from '@/lib/services/chatService'
  import {
    messages,
    isStreaming,
    invalidateChats,
    setMessages,
    setStreamingContent,
    startStreaming,
    stopStreaming,
    allMessages,
  } from '@/stores/chatStore'

  import { newChat, deleteChatById, updateChatName } from '@/lib/utils/database/chatDB'
  import { similaritySearch } from '@/lib/utils/chromadb'

  let chatId = $state<number | null>(null)
  let chatService: ChatService | null = $state(null)
  let userInput = $state('')

  onMount(async () => {
    const urlParams = new URLSearchParams(window.location.search)
    const chatIdParam = Number(urlParams.get('chatId'))

    if (chatIdParam) {
      chatId = chatIdParam
    } else {
      // Si no hay chatId, crear uno nuevo
      const articleIdParam = Number(urlParams.get('articleId'))
      const newChatData = await newChat({ articleId: articleIdParam })
      chatId = Number(newChatData.lastInsertId)
    }

    // Inicializar el servicio de chat
    if (chatId) {
      chatService = new ChatService(chatId, CHAT_SYSTEM_PROMPT, Number(urlParams.get('articleId')))
      const history = await chatService.initialize()
      setMessages(history)
    }
  })

  onDestroy(async () => {
    if (!chatService || !chatId || $messages.length === 0) return

    // Si no hay mensajes, eliminar el chat
    if (chatService.getMessageCount() === 0) {
      await deleteChatById(chatId)
    } else {
      // Actualizar el nombre del chat con el primer mensaje
      await updateChatName(chatId, $messages[0].content.slice(0, 50) || 'New Chat')
    }
    invalidateChats()
  })

  async function handlePrompt(prompt: string) {
    if (!chatService || !prompt.trim()) return

    userInput = ''
    startStreaming()

    const similarityResults = await similaritySearch({
      queryText: prompt,
      nResults: 5,
      collectionName: 'articles',
      includeDocuments: true,
    })

    console.log('Documentos recuperados para el prompt:', similarityResults)

    const documents = similarityResults.documents[0]?.join('\n\n') || ''

    try {
      // Agregar mensaje del usuario a la UI inmediatamente
      messages.update((msgs) => [
        ...msgs,
        {
          role: 'user',
          content: prompt,
        },
      ])

      // Stream de la respuesta
      for await (const { chunk, fullContent, done } of chatService.sendMessage(prompt, documents)) {
        setStreamingContent(fullContent)

        if (done) {
          // Agregar respuesta final a mensajes
          messages.update((msgs) => [...msgs, { role: 'assistant', content: fullContent }])
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
    {#each $allMessages as msg}
      <div class="message {msg.role}">
        {#if msg.role === 'user'}
          <span class="user">{msg.content}</span>
        {:else if msg.role === 'system'}
          <span class="system">ℹ️ {msg.content}</span>
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
    padding: 100px 10px;
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
