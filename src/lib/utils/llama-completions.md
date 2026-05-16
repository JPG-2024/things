# llama-completions: Minimal usage

This helper calls `llama-server` OpenAI-compatible endpoint:

- `POST /v1/chat/completions`
- Base URL default: `http://localhost:8080`

Import:

```ts
import { chatCompletions } from './llama-completions';
```

## 1) Minimal non-stream request

```ts
const response = await chatCompletions({
	model: 'gpt-3.5-turbo',
	messages: [
		{ role: 'system', content: 'You are concise.' },
		{ role: 'user', content: 'Say hello in one sentence.' }
	]
});

console.log(response.choices[0]?.message?.content);
```

## 2) Stream tokens for UI

Use `onToken` to receive each streamed text chunk.

```ts
let uiText = '';

const response = await chatCompletions(
	{
		model: 'gpt-3.5-turbo',
		messages: [{ role: 'user', content: 'Write a short haiku about the sea.' }],
		stream: true
	},
	'http://localhost:8080',
	{
		onToken: (token) => {
			uiText += token;
			// update your UI store/state here
			// e.g. setStreamingContent(uiText)
		}
	}
);

console.log('final:', response.choices[0]?.message?.content);
```

## 3) Minimal tool-calling request

```ts
const response = await chatCompletions({
	model: 'gpt-3.5-turbo',
	messages: [{ role: 'user', content: 'What is the weather in Istanbul?' }],
	tools: [
		{
			type: 'function',
			function: {
				name: 'get_current_weather',
				description: 'Get current weather in a city',
				parameters: {
					type: 'object',
					properties: {
						location: { type: 'string' }
					},
					required: ['location']
				}
			}
		}
	],
	tool_choice: 'auto',
	parallel_tool_calls: true
});

const toolCalls = response.choices[0]?.message?.tool_calls ?? [];
console.log(toolCalls);
```

## 3.1) Tool-calls agent loop (implementación real del tool)

`get_current_weather` en el ejemplo anterior es solo una definición para el modelo.
La ejecución real la haces en tu app con un loop como este:

```ts
const toolHandlers: Record<string, (args: any) => Promise<any>> = {
	get_current_weather: async ({ location }) => {
		// Reemplaza con tu API real
		return { location, temperature_c: 18, condition: 'Cloudy' };
	}
};

const messages = [
	{ role: 'system' as const, content: 'You are a weather assistant.' },
	{ role: 'user' as const, content: 'What is the weather in Istanbul?' }
];

const first = await chatCompletions({
	model: 'gpt-3.5-turbo',
	messages,
	tools: [
		{
			type: 'function',
			function: {
				name: 'get_current_weather',
				description: 'Get current weather in a city',
				parameters: {
					type: 'object',
					properties: { location: { type: 'string' } },
					required: ['location']
				}
			}
		}
	],
	tool_choice: 'auto'
});

const assistantMsg = first.choices[0]?.message;
const toolCalls = assistantMsg?.tool_calls ?? [];

// si el modelo pidió tools, los ejecutas tú
if (toolCalls.length > 0) {
	messages.push({
		role: 'assistant',
		content: assistantMsg?.content ?? '',
		tool_calls: toolCalls
	} as any);

	for (const tc of toolCalls) {
		const toolName = tc.function.name;
		const toolArgs = JSON.parse(tc.function.arguments || '{}');
		const result = await toolHandlers[toolName]?.(toolArgs);

		messages.push({
			role: 'tool',
			tool_call_id: tc.id ?? '',
			content: JSON.stringify(result ?? { error: `Unknown tool: ${toolName}` })
		} as any);
	}

	// segunda llamada: respuesta final ya con resultado del tool
	const second = await chatCompletions({
		model: 'gpt-3.5-turbo',
		messages
	});

	console.log('final answer:', second.choices[0]?.message?.content);
}
```

## 4) Stream + inspect tool-call chunks

```ts
const response = await chatCompletions(
	{
		model: 'gpt-3.5-turbo',
		messages: [{ role: 'user', content: 'Call any tool you need for this task.' }],
		tools: [
			{
				type: 'function',
				function: {
					name: 'python',
					parameters: {
						type: 'object',
						properties: {
							code: { type: 'string' }
						},
						required: ['code']
					}
				}
			}
		],
		stream: true
	},
	undefined,
	{
		onToken: (token) => {
			// text stream for UI
			console.log('token:', token);
		},
		onChunk: (chunk) => {
			const delta = chunk.choices[0]?.delta;
			if (delta?.tool_calls?.length) {
				console.log('tool delta:', delta.tool_calls);
			}
		}
	}
);

console.log('final tool calls:', response.choices[0]?.message?.tool_calls);
```

## 5) Structured JSON response (`json_schema`)

Use `response_format` to force a typed JSON output.

```ts
const response = await chatCompletions({
	model: 'gpt-3.5-turbo',
	messages: [
		{
			role: 'system',
			content: 'Return only valid JSON that matches the provided schema.'
		},
		{
			role: 'user',
			content: 'Summarize this text and extract 3 keywords: Llama.cpp adds local inference options.'
		}
	],
	response_format: {
		type: 'json_schema',
		json_schema: {
			name: 'summary_keywords',
			strict: true,
			schema: {
				type: 'object',
				properties: {
					summary: { type: 'string' },
					keywords: {
						type: 'array',
						items: { type: 'string' },
						minItems: 3,
						maxItems: 3
					}
				},
				required: ['summary', 'keywords'],
				additionalProperties: false
			}
		}
	}
});

const raw = response.choices[0]?.message?.content ?? '{}';
const data = JSON.parse(raw) as { summary: string; keywords: string[] };

console.log(data.summary);
console.log(data.keywords);
```

If your server/model ignores `json_schema`, fallback to `response_format: { type: 'json_object' }` and validate client-side.

## Notes

- For tool calling in `llama-server`, start server with `--jinja` and a tool-aware template.
- If your UI needs live text, use `stream: true` + `onToken`.
- Tool calls are planned by the model, but executed by your app (agent loop outside this service).
- The function returns a normalized final response even in stream mode.
