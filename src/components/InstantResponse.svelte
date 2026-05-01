<script lang="ts">
import type {
	LlamaChatCompletionsRequest,
	LlamaChatCompletionsResponse,
} from "@/lib/utils/llama-completions"
import { chatCompletions } from "@/lib/utils/llama-completions"
import Input from "./inputs/Input.component.svelte"

const DEFAULT_COMPLETION_PARAMETERS: LlamaChatCompletionsRequest = {
	model: "ggml-alpaca-7b-q4.bin",
	temperature: 0.3,
	messages: [
		{
			role: "system",
			content:
				"Eres un asistente encargado de resolver dudas. sé conciso y claro en tus respuestas.",
		},
	],
}

interface Props {
	model?: string
	maxTokens?: number
	content?: string
	completionParameters?: LlamaChatCompletionsRequest
}

let { completionParameters = DEFAULT_COMPLETION_PARAMETERS, content = "" }: Props = $props()

let response = $state<LlamaChatCompletionsResponse | null>(null)
let loading = $state(false)
let error = $state<string | null>(null)
let streamedText = $state("")

async function handleSubmit(prompt: string) {
	if (!prompt.trim()) return

	loading = true
	error = null
	streamedText = ""
	response = null

	try {
		const completionRequest: LlamaChatCompletionsRequest = {
			...completionParameters,
			messages: [
				...completionParameters.messages,
				{ role: "user", content: `CONTEXT: ${content} \n\n PROMPT: ${prompt}.` },
			],
		}

		const result = await chatCompletions(completionRequest, {
			onToken: (token) => {
				streamedText += token
			},
		})

		streamedText = result.choices[0]?.message?.content ?? ""
		console.log("Final completion result:", result)
	} catch (err) {
		error = err instanceof Error ? err.message : "Unknown error occurred"
		console.error("Completion error:", err)
	} finally {
		loading = false
	}
}
</script>

<div class="instant-response-container">
  <Input placeholder="Ask something..." disabled={loading} onEnter={handleSubmit} />

  {#if loading}
    <div class="loading">Generating response...</div>
  {/if}

  {#if error}
    <div class="error">Error: {error}</div>
  {/if}

  {#if streamedText}
    <div class="response">
      <p>{streamedText}</p>
    </div>
  {/if}
</div>

<style>
  .instant-response-container {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    width: 100%;
    max-width: 800px;
  }

  .loading {
    text-align: center;
    color: var(--primary-color);
    font-style: italic;
  }

  .error {
    padding: 1rem;
    border-radius: 8px;
    background-color: rgba(255, 0, 0, 0.1);
    color: #ff4444;
    border: 1px solid rgba(255, 0, 0, 0.3);
  }

  .response {
    padding: 1rem;
    border-radius: 8px;
    background-color: rgba(154, 154, 154, 0.2);
    backdrop-filter: blur(8px);
    border: 1px solid rgba(154, 154, 154, 0.3);
  }

  .response p {
    margin: 0;
    line-height: 1.6;
    white-space: pre-wrap;
    word-wrap: break-word;
  }
</style>
