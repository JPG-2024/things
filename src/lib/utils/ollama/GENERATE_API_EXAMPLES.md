# Ollama Generate API - Usage Examples

Complete examples for using the Ollama generate API with different parameters and use cases.

## Table of Contents
- [Basic Usage](#basic-usage)
- [Streaming Responses](#streaming-responses)
- [Advanced Options](#advanced-options)
- [JSON Mode](#json-mode)
- [System Prompts](#system-prompts)
- [Image Input (Multimodal)](#image-input-multimodal)
- [Think Mode](#think-mode)
- [Log Probabilities](#log-probabilities)
- [Context Management](#context-management)

---

## Basic Usage

### Simple Question

```typescript
import { generate } from './generate';

const response = await generate({
  model: 'llama2',
  prompt: 'Why is the sky blue?'
});

console.log(response.response);
// Output: The sky appears blue because...
```

### With Temperature Control

```typescript
const response = await generate({
  model: 'llama2',
  prompt: 'Write a creative story opening',
  options: {
    temperature: 0.9,  // Higher = more creative
    top_p: 0.9
  }
});

console.log(response.response);
```

### Deterministic Output (Reproducible)

```typescript
const response = await generate({
  model: 'llama2',
  prompt: 'What is 2+2?',
  options: {
    temperature: 0,  // Deterministic
    seed: 42         // Reproducible results
  }
});

console.log(response.response);
// Always the same answer with same seed
```

### Text Summarization

```typescript
const article = `
Artificial intelligence is revolutionizing many industries. From healthcare to finance,
AI systems are helping professionals make better decisions. Machine learning models can
analyze vast amounts of data and identify patterns that humans might miss. However, there
are concerns about privacy, bias, and job displacement. Many organizations are investing
heavily in AI research and development to stay competitive.
`;

const response = await generate({
  model: 'mistral',
  prompt: `Summarize the following text in 2-3 sentences:\n\n${article}`,
  options: {
    temperature: 0.3,  // Lower temperature for consistent summarization
    num_predict: 150   // Limit to ~150 tokens
  }
});

console.log('Summary:');
console.log(response.response);
// Output: AI is transforming multiple industries including healthcare and finance by
// helping professionals make better decisions through data analysis and pattern recognition.
// While there are concerns about privacy and job displacement, organizations continue to
// invest significantly in AI development to remain competitive.
```

---

## Streaming Responses

### Basic Streaming

```typescript
import { generateStream } from './generate';

console.log('AI: ');
for await (const chunk of generateStream({
  model: 'llama2',
  prompt: 'Tell me a short story'
})) {
  process.stdout.write(chunk.response);
  
  if (chunk.done) {
    console.log('\n\nGeneration complete!');
    console.log(`Tokens: ${chunk.eval_count}`);
    console.log(`Duration: ${chunk.total_duration}ns`);
  }
}
```

### Streaming with Performance Metrics

```typescript
import { generateStream, formatDurations } from './generate';

let fullText = '';
for await (const chunk of generateStream({
  model: 'mistral',
  prompt: 'Explain quantum computing'
})) {
  fullText += chunk.response;
  process.stdout.write(chunk.response);
  
  if (chunk.done) {
    const metrics = formatDurations(chunk);
    console.log('\n\n--- Performance ---');
    console.log(`Total time: ${metrics.totalMs.toFixed(2)}ms`);
    console.log(`Speed: ${metrics.tokensPerSecond.toFixed(2)} tokens/sec`);
    console.log(`Tokens generated: ${chunk.eval_count}`);
  }
}
```

### Collect Full Streaming Response

```typescript
import { generateStreamComplete } from './generate';

const response = await generateStreamComplete({
  model: 'llama2',
  prompt: 'Write a poem about the ocean'
});

console.log(response.response);  // Complete poem
console.log(`Generated ${response.eval_count} tokens`);
```

---

## Advanced Options

### Token Limit and Stop Sequences

```typescript
const response = await generate({
  model: 'llama2',
  prompt: 'List the planets:',
  options: {
    num_predict: 100,           // Max 100 tokens
    stop: ['\n\n', 'Conclusion'],  // Stop at these sequences
    temperature: 0.7
  }
});

console.log(response.response);
```

### Fine-tuned Sampling

```typescript
const response = await generate({
  model: 'mixtral',
  prompt: 'Explain artificial intelligence',
  options: {
    temperature: 0.8,
    top_k: 40,              // Consider top 40 tokens
    top_p: 0.9,             // Nucleus sampling
    min_p: 0.05,            // Minimum probability threshold
    repeat_penalty: 1.1,    // Penalize repetition
    presence_penalty: 0.5,  // Encourage diversity
    frequency_penalty: 0.5  // Reduce common words
  }
});

console.log(response.response);
```

### Mirostat Sampling (Alternative)

```typescript
const response = await generate({
  model: 'llama2',
  prompt: 'Write a technical article',
  options: {
    mirostat: 2,         // Enable Mirostat 2.0
    mirostat_tau: 5.0,   // Target entropy
    mirostat_eta: 0.1    // Learning rate
  }
});

console.log(response.response);
```

---

## JSON Mode

### Structured JSON Output

```typescript
const response = await generate({
  model: 'llama2',
  prompt: 'Generate a user profile with name, age, and hobbies',
  format: 'json'
});

const data = JSON.parse(response.response);
console.log(data);
// {
//   "name": "Alice Johnson",
//   "age": 28,
//   "hobbies": ["reading", "hiking", "photography"]
// }
```

### JSON with Schema Hint

```typescript
const response = await generate({
  model: 'mistral',
  prompt: `Generate a product inventory item as JSON with this schema:
{
  "id": "string",
  "name": "string",
  "price": number,
  "inStock": boolean,
  "tags": ["string"]
}`,
  format: 'json'
});

const product = JSON.parse(response.response);
console.log(product);
```

---

## System Prompts

### Custom Behavior with System Prompt

```typescript
const response = await generate({
  model: 'llama2',
  system: 'You are a pirate captain. Speak like a pirate in all responses.',
  prompt: 'Tell me about your ship'
});

console.log(response.response);
// Arr matey! Me ship be the finest vessel...
```

### Expert Assistant

```typescript
const response = await generate({
  model: 'mixtral',
  system: `You are an expert Python developer. Provide concise, 
           production-ready code with best practices.`,
  prompt: 'Write a function to validate email addresses'
});

console.log(response.response);
```

### Multi-turn Conversation

```typescript
// First message
const response1 = await generate({
  model: 'llama2',
  system: 'You are a helpful math tutor.',
  prompt: 'What is calculus?'
});

console.log('AI:', response1.response);

// Follow-up using context
const response2 = await generate({
  model: 'llama2',
  system: 'You are a helpful math tutor.',
  prompt: 'Can you give me an example?',
  context: response1.context  // Maintain conversation context
});

console.log('AI:', response2.response);
```

---

## Image Input (Multimodal)

### Analyze an Image

```typescript
import { readFileSync } from 'fs';

// Read image and convert to base64
const imageBuffer = readFileSync('./photo.jpg');
const base64Image = imageBuffer.toString('base64');

const response = await generate({
  model: 'llava',  // Multimodal model
  prompt: 'What do you see in this image?',
  images: [base64Image]
});

console.log(response.response);
```

### Multiple Images

```typescript
const image1 = readFileSync('./image1.jpg').toString('base64');
const image2 = readFileSync('./image2.jpg').toString('base64');

const response = await generate({
  model: 'llava',
  prompt: 'Compare these two images. What are the differences?',
  images: [image1, image2]
});

console.log(response.response);
```

### Image with Specific Instructions

```typescript
const imageBase64 = readFileSync('./diagram.png').toString('base64');

const response = await generate({
  model: 'llava',
  prompt: 'Extract all text from this diagram and format it as a list',
  images: [imageBase64],
  format: 'json'
});

console.log(JSON.parse(response.response));
```

---

## Think Mode

### Extended Reasoning

```typescript
const response = await generate({
  model: 'deepseek-r1',  // Model with thinking capabilities
  prompt: 'Solve this logic puzzle: If all cats are animals, and some animals are pets, can we conclude that some cats are pets?',
  think: true
});

console.log('Thinking:', response.thinking);
console.log('\nAnswer:', response.response);
```

### Problem Solving with Thinking

```typescript
for await (const chunk of generateStream({
  model: 'deepseek-r1',
  prompt: 'Calculate the optimal route for visiting 5 cities',
  think: true
})) {
  if (chunk.thinking) {
    console.log('[Thinking]', chunk.thinking);
  }
  if (chunk.response) {
    console.log('[Response]', chunk.response);
  }
}
```

---

## Log Probabilities

### Get Token Probabilities

```typescript
const response = await generate({
  model: 'llama2',
  prompt: 'The capital of France is',
  logprobs: true,
  top_logprobs: 5,  // Top 5 alternatives per token
  options: {
    num_predict: 10
  }
});

console.log('Response:', response.response);
console.log('\nToken probabilities:');
response.logprobs?.forEach(tokenProb => {
  console.log(`\nToken: "${tokenProb.token}"`);
  console.log(`  Probability: ${Math.exp(tokenProb.logprob).toFixed(4)}`);
  
  if (tokenProb.top_logprobs) {
    console.log('  Alternatives:');
    tokenProb.top_logprobs.forEach(alt => {
      console.log(`    "${alt.token}": ${Math.exp(alt.logprob).toFixed(4)}`);
    });
  }
});
```

---

## Context Management

### Keep Model Loaded

```typescript
// Keep model in memory for 10 minutes
const response = await generate({
  model: 'llama2',
  prompt: 'Hello',
  keep_alive: '10m'  // Can use: '5m', '30s', '1h', etc.
});

console.log(response.response);
```

### Keep Indefinitely

```typescript
const response = await generate({
  model: 'llama2',
  prompt: 'Start session',
  keep_alive: -1  // Keep loaded until explicitly unloaded
});
```

### Unload Immediately

```typescript
const response = await generate({
  model: 'llama2',
  prompt: 'Final message',
  keep_alive: 0  // Unload immediately after response
});
```

### Conversation with Context Persistence

```typescript
let conversationContext: number[] | undefined;

// Message 1
const msg1 = await generate({
  model: 'llama2',
  prompt: 'My name is Alice and I love pizza.',
  keep_alive: '5m'
});
conversationContext = msg1.context;
console.log('AI:', msg1.response);

// Message 2 (remembers previous context)
const msg2 = await generate({
  model: 'llama2',
  prompt: 'What is my name and favorite food?',
  context: conversationContext,
  keep_alive: '5m'
});
conversationContext = msg2.context;
console.log('AI:', msg2.response);
// AI: Your name is Alice and your favorite food is pizza.
```

---

## Raw Mode (Template Bypass)

### Use Raw Prompt Without Template

```typescript
const response = await generate({
  model: 'llama2',
  prompt: '<|im_start|>user\nHello<|im_end|>\n<|im_start|>assistant\n',
  raw: true  // Bypass automatic prompt templating
});

console.log(response.response);
```

---

## Complete Real-World Example

### Interactive Chat with All Features

```typescript
import { generateStream, formatDurations } from './generate';

async function chat(userMessage: string) {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`You: ${userMessage}`);
  console.log(`${'='.repeat(50)}\n`);
  
  let fullResponse = '';
  let thinking = '';
  
  console.log('AI: ');
  
  for await (const chunk of generateStream({
    model: 'mistral',
    prompt: userMessage,
    system: 'You are a helpful, friendly AI assistant.',
    think: true,
    options: {
      temperature: 0.7,
      top_p: 0.9,
      repeat_penalty: 1.1,
      num_predict: 500
    },
    keep_alive: '5m'
  })) {
    // Show thinking process
    if (chunk.thinking) {
      thinking += chunk.thinking;
    }
    
    // Stream response
    process.stdout.write(chunk.response);
    fullResponse += chunk.response;
    
    // Show metrics when done
    if (chunk.done) {
      const metrics = formatDurations(chunk);
      
      console.log('\n');
      console.log(`${'─'.repeat(50)}`);
      console.log(`⚡ ${metrics.tokensPerSecond.toFixed(1)} tokens/sec`);
      console.log(`📊 ${chunk.eval_count} tokens in ${metrics.totalMs.toFixed(0)}ms`);
      console.log(`🧠 Load: ${metrics.loadMs.toFixed(0)}ms`);
      
      if (thinking) {
        console.log(`\n💭 Thinking: ${thinking}`);
      }
    }
  }
}

// Usage
await chat('Explain quantum entanglement in simple terms');
await chat('Can you give me a real-world analogy?');
```

---

## Error Handling

### Robust Error Handling

```typescript
import { generate } from './generate';

async function safeGenerate(prompt: string) {
  try {
    const response = await generate({
      model: 'llama2',
      prompt,
      options: {
        num_predict: 100
      }
    });
    
    return response.response;
  } catch (error) {
    if (error instanceof Error) {
      console.error('Generation failed:', error.message);
      
      // Check for specific errors
      if (error.message.includes('404')) {
        console.error('Model not found. Try: ollama pull llama2');
      } else if (error.message.includes('connection')) {
        console.error('Cannot connect to Ollama. Is it running?');
      }
    }
    return null;
  }
}

const result = await safeGenerate('Hello!');
if (result) {
  console.log('Response:', result);
}
```

---

## Custom Base URL

### Connect to Remote Ollama Instance

```typescript
const response = await generate(
  {
    model: 'llama2',
    prompt: 'Hello from remote!'
  },
  'http://192.168.1.100:11434'  // Remote server
);

console.log(response.response);
```

### Docker Container

```typescript
const response = await generate(
  {
    model: 'mistral',
    prompt: 'Hello from Docker!'
  },
  'http://ollama-container:11434'
);

console.log(response.response);
```
