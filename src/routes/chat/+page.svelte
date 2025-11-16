<script lang="ts">
  import { onMount } from 'svelte'

  import Input from '@/components/inputs/Input.component.svelte'
  import { messages, content, url } from '@/stores/viewStore'
  import { callMistralChat } from '@/lib/utils/inference'
  import MarkdownRenderer from '@/components/MarkdownRenderer.svelte'
  import { getMessagesByChat, newChat, saveMessage } from '@/lib/utils/database/chatDB'
  import { CHAT_SYSTEM_PROMPT } from '@/constants'

  let chatId = $state<number | null>(null)
  let stream = $state('')

  onMount(async () => {
    const urlParams = new URLSearchParams(window.location.search)
    const articleIdParam = Number(urlParams.get('articleId'))
    const chatIdParam = Number(urlParams.get('chatId'))
    console.log('Chat Page mounted with params:', { articleIdParam, chatIdParam })

    if (chatIdParam) {
      const chatMessages = await getMessagesByChat(chatIdParam)
      messages.set(chatMessages)
      chatId = Number(chatIdParam)
    } else {
      const newChatData = await newChat({ articleId: articleIdParam })
      chatId = Number(newChatData.lastInsertId)
      console.log('Created new chat:', newChatData)

      messages.set([])
    }
  })

  async function handlePrompt(prompt: string) {
    // Add user message
    try {
      const savedMessage = await saveMessage({
        chatId: chatId!,
        sender: 'user',
        content: prompt,
      })
      console.log('Saved user message:', savedMessage)
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

      console.log('Saved AI message:', savedMessage)
      messages.update((msgs) => [...msgs, { sender: 'ai', content: stream }])

      stream = ''
      // Save AI message
    } catch (err) {
      console.error('Inference error:', err)
    }
  }
</script>

<div class="container">
  <div class="messages-container">
    {#each $messages as msg}
      <div class="message {msg.sender}">
        <MarkdownRenderer content={msg.content} />
      </div>
    {/each}
    {#if stream !== ''}
      <div class="message">
        <MarkdownRenderer content={stream} />
      </div>
    {/if}
  </div>

  <Input placeholder="ask something.." onEnter={handlePrompt} />
</div>

<style>
  .container {
    padding: 1rem;
  }

  .messages-container {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    margin-bottom: 1rem;
    overflow-y: auto;
  }

  .message {
    font-size: 0.9rem;
  }

  .user {
    align-self: flex-end;
    font-weight: bold;
  }
</style>
