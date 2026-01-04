# OpenAI Chat API Examples

This document provides usage examples for the OpenAI SDK-based chat implementation. The API connects to llama-server's OpenAI-compatible v1 endpoint.

## Table of Contents

- [Configuration](#configuration)
- [Basic Batch Inference](#basic-batch-inference)
- [Streaming Chat](#streaming-chat)
- [Using ConversationManager](#using-conversationmanager)
- [Error Handling](#error-handling)
- [Advanced Options](#advanced-options)
- [Function Calling / Tools](#function-calling--tools)
- [JSON Mode](#json-mode)
- [Multi-turn Conversations](#multi-turn-conversations)

---

## Configuration

### Environment Variables

Set these at build time or in your `.env` file:

```bash
OPENAI_BASE_URL=http://localhost:8080/v1
OPENAI_API_KEY=not-needed  # llama-server doesn't require authentication
```

### Default Configuration

If not set, defaults to:
- Base URL: `http://localhost:8080/v1`
- API Key: `'not-needed'`

---

## Basic Batch Inference

Non-streaming chat completion for simple request/response.

```typescript
import { createBatchChat } from '@/lib/utils/ollama/chat';

async function simpleChat() {
  const response = await createBatchChat({
    model: 'ministral-3:3b',
    messages: [
      { role: 'user', content: 'What is the capital of France?' }
    ]
  });

  console.log(response.choices[0].message.content);
  // Output: "The capital of France is Paris."

  // Access usage statistics
  console.log('Tokens used:', response.usage?.total_tokens);
}
```

### With System Message

```typescript
const response = await createBatchChat({
  model: 'ministral-3:3b',
  messages: [
    { 
      role: 'system', 
      content: 'You are a helpful assistant that answers in a concise manner.' 
    },
    { 
      role: 'user', 
      content: 'Explain quantum computing' 
    }
  ],
  options: {
    temperature: 0.7,
    max_tokens: 150
  }
});
```

---

## Streaming Chat

Real-time streaming responses for better UX.

```typescript
import { createStreamingChat } from '@/lib/utils/ollama/chat';

async function streamingExample() {
  const stream = createStreamingChat({
    model: 'ministral-3:3b',
    messages: [
      { role: 'user', content: 'Write a short story about a robot' }
    ]
  });

  let fullResponse = '';
  
  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content || '';
    fullResponse += content;
    
    // Update UI in real-time
    process.stdout.write(content);
    
    if (chunk.done) {
      console.log('\n\nStream complete!');
      console.log('Tokens:', chunk.eval_count);
    }
  }
  
  return fullResponse;
}
```

### Streaming with Custom Base URL

```typescript
for await (const chunk of createStreamingChat(
  {
    model: 'llama-3.2-3b',
    messages: [{ role: 'user', content: 'Hello!' }]
  },
  'http://192.168.1.100:8080/v1'  // Custom server
)) {
  console.log(chunk.choices[0]?.delta?.content);
}
```

---

## Using ConversationManager

Manages multi-turn conversations with automatic history tracking.

```typescript
import { ConversationManager } from '@/lib/utils/ollama/chat';

async function conversation() {
  const manager = new ConversationManager(
    'ministral-3:3b',
    'http://localhost:8080/v1',
    undefined,  // no tools
    {
      temperature: 0.8,
      max_tokens: 500
    }
  );

  // Add system message
  manager.addMessage('system', 'You are a friendly coding assistant.');

  // First turn - streaming
  console.log('User: How do I create a TypeScript interface?');
  for await (const chunk of manager.sendMessage('How do I create a TypeScript interface?')) {
    process.stdout.write(chunk.message.content);
  }

  // Second turn - uses history automatically
  console.log('\n\nUser: Can you show me an example?');
  const response = await manager.sendMessageComplete('Can you show me an example?');
  console.log('Assistant:', response.message.content);

  // View conversation history
  console.log('\nHistory:', manager.getHistory());
  console.log('Total messages:', manager.getMessageCount());
}
```

### Clearing Conversation

```typescript
const manager = new ConversationManager('ministral-3:3b');

manager.addMessage('user', 'First question');
// ... get response ...

// Start fresh conversation
manager.clear();

manager.addMessage('user', 'New conversation');
```

---

## Error Handling

Proper error handling with custom ChatAPIError class.

```typescript
import { createBatchChat, ChatAPIError } from '@/lib/utils/ollama/chat';

async function handleErrors() {
  try {
    const response = await createBatchChat({
      model: 'nonexistent-model',
      messages: [{ role: 'user', content: 'Test' }]
    });
  } catch (error) {
    if (error instanceof ChatAPIError) {
      console.error('Chat API Error:', error.message);
      console.error('Status Code:', error.statusCode);
      console.error('Original Error:', error.originalError);
      
      // Handle specific status codes
      if (error.statusCode === 404) {
        console.log('Model not found - using fallback');
      } else if (error.statusCode === 429) {
        console.log('Rate limited - retry later');
      }
    } else {
      console.error('Unexpected error:', error);
    }
  }
}
```

### Retry Logic

```typescript
async function chatWithRetry(request: ChatRequest, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await createBatchChat(request);
    } catch (error) {
      if (error instanceof ChatAPIError && error.statusCode === 503) {
        console.log(`Retry ${i + 1}/${maxRetries}...`);
        await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
        continue;
      }
      throw error;
    }
  }
  throw new Error('Max retries exceeded');
}
```

---

## Advanced Options

### Temperature and Sampling

```typescript
const response = await createBatchChat({
  model: 'ministral-3:3b',
  messages: [{ role: 'user', content: 'Be creative!' }],
  options: {
    temperature: 1.2,      // Higher = more creative
    top_p: 0.95,          // Nucleus sampling
    top_k: 50,            // Top-k sampling
    seed: 42              // Reproducible outputs
  }
});
```

### Token Limits

```typescript
const response = await createBatchChat({
  model: 'ministral-3:3b',
  messages: [{ role: 'user', content: 'Summarize this...' }],
  options: {
    max_tokens: 100,           // Limit response length
    num_predict: 100           // Legacy param (same as max_tokens)
  }
});
```

### Stop Sequences

```typescript
const response = await createBatchChat({
  model: 'ministral-3:3b',
  messages: [{ role: 'user', content: 'List 5 items' }],
  options: {
    stop: ['\n6.', 'END']     // Stop generation at these sequences
  }
});
```

### Penalties

```typescript
const response = await createBatchChat({
  model: 'ministral-3:3b',
  messages: [{ role: 'user', content: 'Tell me about AI' }],
  options: {
    presence_penalty: 0.6,    // Penalize already mentioned topics
    frequency_penalty: 0.5,   // Penalize frequent tokens
    repeat_penalty: 1.1       // General repetition penalty
  }
});
```

---

## Function Calling / Tools

Enable the model to call functions/tools.

```typescript
import { createBatchChat, type Tool } from '@/lib/utils/ollama/chat';

async function functionCallingExample() {
  const tools: Tool[] = [
    {
      type: 'function',
      function: {
        name: 'get_weather',
        description: 'Get the current weather for a location',
        parameters: {
          type: 'object',
          properties: {
            location: {
              type: 'string',
              description: 'City name, e.g. San Francisco'
            },
            unit: {
              type: 'string',
              enum: ['celsius', 'fahrenheit']
            }
          },
          required: ['location']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'get_time',
        description: 'Get the current time in a timezone',
        parameters: {
          type: 'object',
          properties: {
            timezone: {
              type: 'string',
              description: 'IANA timezone, e.g. America/New_York'
            }
          },
          required: ['timezone']
        }
      }
    }
  ];

  const response = await createBatchChat({
    model: 'ministral-3:3b',
    messages: [
      { role: 'user', content: 'What is the weather in Paris?' }
    ],
    tools
  });

  const message = response.choices[0].message;
  
  if (message.tool_calls && message.tool_calls.length > 0) {
    console.log('Model wants to call:', message.tool_calls[0].function);
    console.log('Arguments:', message.tool_calls[0].arguments);
    
    // Execute the function
    const toolCall = message.tool_calls[0];
    if (toolCall.function === 'get_weather') {
      const args = JSON.parse(toolCall.arguments || '{}');
      const weatherData = await getWeather(args.location);
      
      // Send result back to model
      const finalResponse = await createBatchChat({
        model: 'ministral-3:3b',
        messages: [
          { role: 'user', content: 'What is the weather in Paris?' },
          message,  // Assistant's tool call
          {
            role: 'tool',
            content: JSON.stringify(weatherData),
            tool_call_id: toolCall.id
          }
        ],
        tools
      });
      
      console.log('Final answer:', finalResponse.choices[0].message.content);
    }
  }
}

async function getWeather(location: string) {
  // Mock implementation
  return { temperature: 22, condition: 'Sunny', location };
}
```

---

## JSON Mode

Force the model to respond with valid JSON.

```typescript
const response = await createBatchChat({
  model: 'ministral-3:3b',
  messages: [
    { 
      role: 'system', 
      content: 'You are a helpful assistant that responds in JSON format.' 
    },
    { 
      role: 'user', 
      content: 'Give me information about TypeScript as JSON with fields: name, year, creator' 
    }
  ],
  format: 'json'  // or response_format: { type: 'json_object' }
});

const data = JSON.parse(response.choices[0].message.content || '{}');
console.log(data);
// { name: "TypeScript", year: 2012, creator: "Microsoft" }
```

### Structured Data Extraction

```typescript
interface Person {
  name: string;
  age: number;
  occupation: string;
}

const response = await createBatchChat({
  model: 'ministral-3:3b',
  messages: [
    { 
      role: 'system', 
      content: 'Extract person information as JSON with fields: name, age, occupation' 
    },
    { 
      role: 'user', 
      content: 'John Smith is a 35-year-old software engineer.' 
    }
  ],
  response_format: { type: 'json_object' }
});

const person: Person = JSON.parse(response.choices[0].message.content || '{}');
```

---

## Multi-turn Conversations

### Manual History Management

```typescript
const messages = [
  { role: 'system' as const, content: 'You are a math tutor.' }
];

// Turn 1
messages.push({ role: 'user', content: 'What is 15 × 8?' });
let response = await createBatchChat({ model: 'ministral-3:3b', messages });
messages.push(response.choices[0].message);

console.log('Turn 1:', response.choices[0].message.content);

// Turn 2 - uses context from turn 1
messages.push({ role: 'user', content: 'Now multiply that by 2' });
response = await createBatchChat({ model: 'ministral-3:3b', messages });
messages.push(response.choices[0].message);

console.log('Turn 2:', response.choices[0].message.content);
```

### With Streaming

```typescript
const messages = [
  { role: 'system' as const, content: 'You are a storyteller.' },
  { role: 'user' as const, content: 'Tell me a story about a dragon' }
];

let assistantMessage = { role: 'assistant' as const, content: '' };

for await (const chunk of createStreamingChat({ model: 'ministral-3:3b', messages })) {
  const content = chunk.choices[0]?.delta?.content || '';
  assistantMessage.content += content;
  process.stdout.write(content);
}

// Add to history
messages.push(assistantMessage);

// Continue conversation
messages.push({ role: 'user', content: 'What happened next?' });
// ... stream again ...
```

---

## Legacy Compatibility

The old function names are still available as aliases:

```typescript
// Old way (still works)
import { chat, chatStream, chatStreamComplete } from '@/lib/utils/ollama/chat';

const response1 = await chat({ model: 'ministral-3:3b', messages: [...] });
const stream = chatStream({ model: 'ministral-3:3b', messages: [...] });
const response2 = await chatStreamComplete({ model: 'ministral-3:3b', messages: [...] });

// New way (recommended)
import { createBatchChat, createStreamingChat, chatStreamComplete } from '@/lib/utils/ollama/chat';

const response3 = await createBatchChat({ model: 'ministral-3:3b', messages: [...] });
const stream2 = createStreamingChat({ model: 'ministral-3:3b', messages: [...] });
```

---

## Complete Example: RAG Chatbot

```typescript
import { ConversationManager } from '@/lib/utils/ollama/chat';

async function ragChatbot(userQuery: string, relevantDocs: string[]) {
  const manager = new ConversationManager(
    'ministral-3:3b',
    undefined,  // Use default base URL
    undefined,  // No tools
    {
      temperature: 0.7,
      max_tokens: 500
    }
  );

  // Build context from retrieved documents
  const context = relevantDocs.join('\n\n---\n\n');
  
  // System message with instructions
  manager.addMessage(
    'system',
    'You are a helpful assistant. Answer questions based on the provided context. If the answer is not in the context, say so.'
  );

  // Add context as user message
  manager.addMessage('user', `Context:\n${context}`);

  // Stream the response
  console.log('Assistant: ');
  let fullResponse = '';
  
  for await (const chunk of manager.sendMessage(userQuery)) {
    const content = chunk.message.content;
    fullResponse += content;
    process.stdout.write(content);
    
    if (chunk.done) {
      console.log('\n');
      console.log('Tokens used:', chunk.eval_count);
    }
  }

  return fullResponse;
}

// Usage
const docs = [
  'TypeScript is a strongly typed programming language that builds on JavaScript.',
  'TypeScript was created by Microsoft and first released in 2012.',
  'TypeScript compiles to plain JavaScript and can run anywhere JavaScript runs.'
];

await ragChatbot('When was TypeScript created?', docs);
```

---

## Tips & Best Practices

1. **Use streaming for better UX** - Users see responses in real-time
2. **Set appropriate temperature** - Lower (0.1-0.3) for factual, higher (0.8-1.2) for creative
3. **Limit max_tokens** - Prevent unnecessarily long responses
4. **Handle errors gracefully** - Wrap calls in try/catch with ChatAPIError
5. **Use ConversationManager** - Simplifies multi-turn conversations
6. **Clear history periodically** - Prevent context window overflow
7. **Set stop sequences** - Control output format (e.g., stop at "###")
8. **Use tools/functions** - Let the model access external data
9. **Enable JSON mode** - For structured data extraction
10. **Monitor token usage** - Check `response.usage` to track costs

---

## Migration from Old API

If you're migrating from the old fetch-based implementation:

| Old | New | Notes |
|-----|-----|-------|
| `chat()` | `createBatchChat()` | Alias still works |
| `chatStream()` | `createStreamingChat()` | Alias still works |
| `chatStreamComplete()` | `chatStreamComplete()` | Unchanged |
| `ConversationManager` | `ConversationManager` | Unchanged |
| Custom error handling | `ChatAPIError` | New error class |
| Hardcoded URLs | Environment variables | Better configuration |

All existing code continues to work without changes!
