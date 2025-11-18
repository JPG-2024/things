<script lang="ts">
  import { onMount, onDestroy } from 'svelte'

  import Input from '@/components/inputs/Input.component.svelte'
  import { messages, content } from '@/stores/viewStore'
  import { callMistralChat } from '@/lib/utils/inference'
  import MarkdownRenderer from '@/components/MarkdownRenderer.svelte'
  import {
    getMessagesByChat,
    newChat,
    saveMessage,
    deleteChatById,
    updateChatName,
  } from '@/lib/utils/database/chatDB'
  import { CHAT_SYSTEM_PROMPT } from '@/constants'
  import Topbar from '@/components/layout/Topbar.svelte'
  import { invalidateChats } from '@/stores/chatStore'

  let chatId = $state<number | null>(null)
  let stream = $state('')

  onMount(async () => {
    const urlParams = new URLSearchParams(window.location.search)
    const articleIdParam = Number(urlParams.get('articleId'))
    const chatIdParam = Number(urlParams.get('chatId'))

    if (chatIdParam) {
      const chatMessages = await getMessagesByChat(chatIdParam)
      messages.set(chatMessages)
      chatId = Number(chatIdParam)
    } else {
      const newChatData = await newChat({ articleId: articleIdParam })
      chatId = Number(newChatData.lastInsertId)

      messages.set([])
    }
  })

  onDestroy(async () => {
    if ($messages.length === 0) {
      await deleteChatById(chatId!)
    } else {
      await updateChatName(chatId!, $messages[0]?.content.slice(0, 50))
    }
    invalidateChats()
  })

  async function handlePrompt(prompt: string) {
    // Add user message
    try {
      const savedMessage = await saveMessage({
        chatId: chatId!,
        sender: 'user',
        content: prompt,
      })
      messages.update((msgs) => [...msgs, { sender: 'user', content: prompt }])
    } catch (err) {
      console.error('Error saving user message:', err)
    }

    // Get AI response
    try {
      await callMistralChat(
        {
          systemPrompt: CHAT_SYSTEM_PROMPT($content),
          prompt,
        },
        (result) => {
          stream = stream + result
        }
      )

      const savedMessage = await saveMessage({
        chatId: chatId!,
        sender: 'ai',
        content: stream,
      })

      messages.update((msgs) => [...msgs, { sender: 'ai', content: stream }])

      stream = ''
      // Save AI message
    } catch (err) {
      console.error('Inference error:', err)
    }
  }
</script>

<div class="messages-container">
  <Topbar>
    {#if chatId}
      <span class="chat-title" style={`view-transition-name: chat-name-${chatId};`}>chat</span>
    {/if}
  </Topbar>
  <div class="messages">
    {#each $messages as msg}
      <div class="message {msg.sender}">
        {#if msg.sender === 'user'}
          <span class="user">{msg.content}</span>
        {:else}
          <MarkdownRenderer content={msg.content} />
        {/if}
      </div>
    {/each}
    {#if stream !== ''}
      <div class="message">
        <MarkdownRenderer content={stream} />
      </div>
    {/if}
  </div>

  <div class="input-container">
    <Input placeholder="ask something.." onEnter={handlePrompt} />
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
    color: bisque;
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
  }

  .user {
    align-self: flex-end;
    color: var(--primary-color);
    font-weight: bold;
    font-size: 1rem;
  }

  .input-container {
    position: fixed;
    right: 0;
    bottom: 0;
    left: 0;

    box-sizing: border-box;
    padding: 1rem;
    width: 100%;
  }
</style>
