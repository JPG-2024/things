# Ollama Chat API - Usage Examples

Complete examples for using the Chat API with TypeScript.

## Table of Contents

- [Basic Chat](#basic-chat)
- [Streaming Chat](#streaming-chat)
- [Multi-turn Conversations](#multi-turn-conversations)
- [Tool/Function Calling](#toolfunction-calling)
- [Advanced Options](#advanced-options)
- [Error Handling](#error-handling)

---

## Basic Chat

Simple non-streaming chat request:

```typescript
import { chat } from '$lib/utils/ollama/chat';

async function basicChat() {
  try {
    const response = await chat({
      model: 'llama2',
      messages: [
        {
          role: 'user',
          content: 'What is the capital of France?'
        }
      ]
    });

    console.log('Assistant:', response.message.content);
    console.log('Model:', response.model);
    console.log('Tokens generated:', response.eval_count);
  } catch (error) {
    console.error('Chat error:', error);
  }
}

basicChat();
```

---

## Streaming Chat

Real-time streaming responses:

```typescript
import { chatStream } from '$lib/utils/ollama/chat';

async function streamingChat() {
  try {
    for await (const chunk of chatStream({
      model: 'llama2',
      messages: [
        {
          role: 'user',
          content: 'Write a short poem about the moon'
        }
      ]
    })) {
      // Print each chunk as it arrives
      process.stdout.write(chunk.message.content);

      // Check if we're done
      if (chunk.done) {
        console.log('\n\nStream complete!');
        console.log('Total time:', chunk.total_duration, 'ns');
      }
    }
  } catch (error) {
    console.error('Streaming error:', error);
  }
}

streamingChat();
```

### Streaming to a Variable

Collect all streaming chunks into a complete response:

```typescript
import { chatStreamComplete } from '$lib/utils/ollama/chat';

async function collectStream() {
  const response = await chatStreamComplete({
    model: 'llama2',
    messages: [
      {
        role: 'user',
        content: 'Explain quantum computing in simple terms'
      }
    ]
  });

  console.log('Full response:', response.message.content);
  console.log('Eval count:', response.eval_count);
  console.log('Done reason:', response.done_reason);
}

collectStream();
```

---

## Multi-turn Conversations

Using ConversationManager for maintaining conversation history:

```typescript
import { ConversationManager } from '$lib/utils/ollama/chat';

async function multiTurnConversation() {
  const manager = new ConversationManager('llama2');

  // First turn
  let response = await manager.sendMessageComplete('What is TypeScript?');
  console.log('Assistant:', response.message.content);

  // Second turn - automatically includes history
  response = await manager.sendMessageComplete(
    'Can you show me an example with classes?'
  );
  console.log('Assistant:', response.message.content);

  // Third turn
  response = await manager.sendMessageComplete(
    'How does inheritance work?'
  );
  console.log('Assistant:', response.message.content);

  // View conversation history
  console.log('Conversation messages:', manager.getMessageCount());
  console.log('History:', manager.getHistory());
}

multiTurnConversation();
```

### Streaming with Conversation Manager

```typescript
import { ConversationManager } from '$lib/utils/ollama/chat';

async function streamingConversation() {
  const manager = new ConversationManager('llama2');

  console.log('User: Tell me about AI');
  for await (const chunk of manager.sendMessage('Tell me about AI')) {
    process.stdout.write(chunk.message.content);
  }
  console.log('\n');

  console.log('User: What are neural networks?');
  for await (const chunk of manager.sendMessage(
    'What are neural networks?'
  )) {
    process.stdout.write(chunk.message.content);
  }
  console.log('\n');
}

streamingConversation();
```

---

## Tool/Function Calling

Using tools for structured outputs and function calling:

```typescript
import { chat, ConversationManager, type Tool } from '$lib/utils/ollama/chat';

const weatherTool: Tool = {
  type: 'function',
  function: {
    name: 'get_weather',
    description: 'Get the weather for a location',
    parameters: {
      type: 'object',
      properties: {
        location: {
          type: 'string',
          description: 'The city or location'
        },
        unit: {
          type: 'string',
          enum: ['celsius', 'fahrenheit'],
          description: 'Temperature unit'
        }
      },
      required: ['location']
    }
  }
};

const calculateTool: Tool = {
  type: 'function',
  function: {
    name: 'calculate',
    description: 'Perform mathematical calculations',
    parameters: {
      type: 'object',
      properties: {
        expression: {
          type: 'string',
          description: 'Mathematical expression to evaluate'
        }
      },
      required: ['expression']
    }
  }
};

async function toolCalling() {
  const response = await chat({
    model: 'llama2',
    messages: [
      {
        role: 'user',
        content: 'What is the weather in Paris and what is 2 + 2?'
      }
    ],
    tools: [weatherTool, calculateTool]
  });

  console.log('Response:', response.message.content);

  // Check if model wants to call tools
  if (response.message.tool_calls) {
    console.log('Tool calls requested:');
    for (const toolCall of response.message.tool_calls) {
      console.log(`- ${toolCall.function}`);
      console.log(`  Arguments: ${toolCall.arguments}`);
    }

    // You would typically execute these functions and send results back
  }
}

toolCalling();
```

### Handling Tool Results

```typescript
import { ConversationManager, type Tool } from '$lib/utils/ollama/chat';

const searchTool: Tool = {
  type: 'function',
  function: {
    name: 'search',
    description: 'Search the internet',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query'
        }
      },
      required: ['query']
    }
  }
};

async function toolResultHandling() {
  const manager = new ConversationManager('llama2', 'http://localhost:11434', [
    searchTool
  ]);

  // User message
  const initialResponse = await manager.sendMessageComplete(
    'Who won the 2024 Olympics?'
  );

  if (initialResponse.message.tool_calls) {
    // Process tool calls
    for (const toolCall of initialResponse.message.tool_calls) {
      if (toolCall.function === 'search') {
        const args = JSON.parse(toolCall.arguments || '{}');
        console.log('Searching for:', args.query);

        // Simulate search result
        const searchResult = 'Paris hosted the 2024 Olympics...';

        // Add tool result to conversation
        manager.addMessage(
          'tool',
          searchResult,
          toolCall.id
        );
      }
    }

    // Get final response with context from tool results
    const finalResponse = await manager.sendMessageComplete(
      'Can you summarize the results?'
    );

    console.log('Final answer:', finalResponse.message.content);
  }
}

toolResultHandling();
```

---

## Advanced Options

### With Custom Options

```typescript
import { chatStreamComplete, type ChatOptions } from '$lib/utils/ollama/chat';

async function advancedOptions() {
  const options: ChatOptions = {
    temperature: 0.3, // Lower = more deterministic
    top_p: 0.9, // Nucleus sampling
    top_k: 40, // Top-k sampling
    num_predict: 500, // Max tokens to generate
    repeat_penalty: 1.1, // Penalize repetition
    stop: ['\nUser:', 'Assistant:'] // Stop sequences
  };

  const response = await chatStreamComplete({
    model: 'llama2',
    messages: [
      {
        role: 'user',
        content: 'Write a technical article about distributed systems'
      }
    ],
    options
  });

  console.log(response.message.content);
}

advancedOptions();
```

### JSON Mode

```typescript
import { chat } from '$lib/utils/ollama/chat';

interface JsonResponse {
  name: string;
  age: number;
  occupation: string;
}

async function jsonMode() {
  const response = await chat({
    model: 'llama2',
    messages: [
      {
        role: 'user',
        content:
          'Create a JSON object for a person named John, 30 years old, who is a software engineer'
      }
    ],
    format: 'json'
  });

  const jsonContent: JsonResponse = JSON.parse(response.message.content);
  console.log('Parsed JSON:', jsonContent);
  console.log('Name:', jsonContent.name);
  console.log('Occupation:', jsonContent.occupation);
}

jsonMode();
```

### Extended Thinking Mode

```typescript
import { chatStreamComplete } from '$lib/utils/ollama/chat';

async function extendedThinking() {
  const response = await chatStreamComplete({
    model: 'llama2',
    messages: [
      {
        role: 'user',
        content: 'Solve this logic puzzle: Three friends share 12 apples...'
      }
    ],
    think: true // Enable extended thinking
  });

  if (response.thinking) {
    console.log('Model thinking process:');
    console.log(response.thinking);
    console.log('\n---\n');
  }

  console.log('Final answer:', response.message.content);
}

extendedThinking();
```

### With Images (Multimodal)

```typescript
import { chat } from '$lib/utils/ollama/chat';
import fs from 'fs';

async function multimodalChat() {
  // Read and encode image
  const imageBuffer = fs.readFileSync('path/to/image.jpg');
  const base64Image = imageBuffer.toString('base64');

  const response = await chat({
    model: 'llava', // Multimodal model
    messages: [
      {
        role: 'user',
        content: 'What do you see in this image?',
        images: [base64Image]
      }
    ]
  });

  console.log('Vision response:', response.message.content);
}

multimodalChat();
```

### System Prompt

```typescript
import { ConversationManager, type ChatOptions } from '$lib/utils/ollama/chat';

async function withSystemPrompt() {
  const manager = new ConversationManager(
    'llama2',
    'http://localhost:11434',
    undefined, // no tools
    {
      temperature: 0.5
    }
  );

  // Add a system message
  manager.addMessage('system', 'You are an expert Python developer. Provide clear, well-documented code examples.');

  const response = await manager.sendMessageComplete(
    'How do I read a JSON file in Python?'
  );

  console.log('Expert response:', response.message.content);
}

withSystemPrompt();
```

---

## Error Handling

Comprehensive error handling:

```typescript
import { chatStreamComplete, formatDurations } from '$lib/utils/ollama/chat';

async function errorHandling() {
  try {
    const response = await chatStreamComplete({
      model: 'nonexistent-model',
      messages: [
        {
          role: 'user',
          content: 'Hello'
        }
      ]
    });

    console.log('Response:', response.message.content);
  } catch (error) {
    if (error instanceof Error) {
      console.error('Error message:', error.message);

      // Handle specific error types
      if (error.message.includes('404')) {
        console.error('Model not found. Make sure Ollama is running and model is pulled.');
      } else if (error.message.includes('connection')) {
        console.error(
          'Connection error. Make sure Ollama server is running on localhost:11434'
        );
      } else {
        console.error('Unknown error:', error);
      }
    }
  }
}

errorHandling();
```

### Performance Metrics

```typescript
import { chatStreamComplete, formatDurations } from '$lib/utils/ollama/chat';

async function performanceMetrics() {
  const response = await chatStreamComplete({
    model: 'llama2',
    messages: [
      {
        role: 'user',
        content: 'Generate a comprehensive list of JavaScript array methods'
      }
    ]
  });

  // Format timing metrics
  const metrics = formatDurations(response);

  console.log('Performance Metrics:');
  console.log(`- Total time: ${metrics.totalMs.toFixed(2)}ms`);
  console.log(`- Model load time: ${metrics.loadMs.toFixed(2)}ms`);
  console.log(`- Prompt evaluation: ${metrics.promptEvalMs.toFixed(2)}ms`);
  console.log(`- Generation time: ${metrics.evalMs.toFixed(2)}ms`);
  console.log(`- Tokens per second: ${metrics.tokensPerSecond.toFixed(2)}`);
  console.log(`- Total tokens: ${response.eval_count}`);
}

performanceMetrics();
```

---

## Integration with Svelte

Using the Chat API in a Svelte component:

```svelte
<script lang="ts">
  import { chatStream, type ChatMessage, type ChatStreamChunk } from '$lib/utils/ollama/chat';
  import { writable } from 'svelte/store';

  let messages: ChatMessage[] = [];
  let userInput = '';
  let isLoading = false;
  let streamingContent = '';

  async function sendMessage() {
    if (!userInput.trim()) return;

    isLoading = true;
    messages = [...messages, { role: 'user', content: userInput }];
    streamingContent = '';
    const userQuery = userInput;
    userInput = '';

    try {
      for await (const chunk of chatStream({
        model: 'llama2',
        messages
      })) {
        streamingContent += chunk.message.content;

        if (chunk.done) {
          messages = [
            ...messages,
            { role: 'assistant', content: streamingContent }
          ];
          streamingContent = '';
        }
      }
    } catch (error) {
      console.error('Error:', error);
      streamingContent = 'Error sending message';
    } finally {
      isLoading = false;
    }
  }
</script>

<div class="chat-container">
  <div class="messages">
    {#each messages as message}
      <div class="message {message.role}">
        {message.content}
      </div>
    {/each}
    {#if streamingContent}
      <div class="message assistant streaming">
        {streamingContent}
      </div>
    {/if}
  </div>

  <div class="input-area">
    <input
      bind:value={userInput}
      disabled={isLoading}
      placeholder="Type your message..."
      on:keydown={(e) => e.key === 'Enter' && sendMessage()}
    />
    <button disabled={isLoading} on:click={sendMessage}>
      {isLoading ? 'Sending...' : 'Send'}
    </button>
  </div>
</div>

<style>
  .chat-container {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  .messages {
    flex: 1;
    overflow-y: auto;
    padding: 1rem;
  }

  .message {
    margin-bottom: 1rem;
    padding: 0.5rem 1rem;
    border-radius: 0.5rem;
  }

  .message.user {
    background-color: #e3f2fd;
    margin-left: 2rem;
  }

  .message.assistant {
    background-color: #f5f5f5;
    margin-right: 2rem;
  }

  .input-area {
    display: flex;
    gap: 0.5rem;
    padding: 1rem;
    border-top: 1px solid #ddd;
  }

  input {
    flex: 1;
    padding: 0.5rem;
    border: 1px solid #ddd;
    border-radius: 0.25rem;
  }

  button {
    padding: 0.5rem 1rem;
    background-color: #007bff;
    color: white;
    border: none;
    border-radius: 0.25rem;
    cursor: pointer;
  }

  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
```

---

## Notes

- **Base URL**: By default, all functions use `http://localhost:11434`. Pass a different URL if your Ollama server is running elsewhere.
- **Models**: Make sure the model is pulled in Ollama before using it: `ollama pull llama2`
- **Streaming**: Streaming is enabled by default but can be disabled by setting `stream: false` in the request.
- **Temperature**: Lower values (0.1-0.3) produce more consistent results, higher values (0.7-1.0) produce more creative results.
- **Performance**: Timing metrics are in nanoseconds; use the `formatDurations()` utility for human-readable values.
