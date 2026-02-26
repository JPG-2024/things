import { fetch } from "@tauri-apps/plugin-http"
import { MISTRAL_MODELS } from "@/constants"

interface MistralChatMessage {
	role: "system" | "user" | "assistant"
	content: string
}

interface MistralChatParams {
	prompt: string
	systemPrompt?: string
	model?: string
	maxTokens?: number
	temperature?: number
	topP?: number
	stream?: boolean
	// zod schema
	responseFormat?: any
}

interface MistralChatResponse {
	id: string
	object: string
	created: number
	model: string
	choices: Array<{
		index: number
		message: {
			role: string
			content: string
		}
		finish_reason: string
	}>
	usage: {
		prompt_tokens: number
		completion_tokens: number
		total_tokens: number
	}
}

/**
 * Call Mistral AI chat completion API
 * @param params - Chat completion parameters
 * @param callback - Optional callback for streaming responses
 * @returns The completion response or streams chunks via callback
 */
export async function callMistralChat(
	params: MistralChatParams,
	callback?: (chunk: string) => void,
): Promise<string | null> {
	const API_KEY = import.meta.env.VITE_MISTRAL_API_KEY

	const {
		prompt,
		systemPrompt,
		model = MISTRAL_MODELS.MICRO,
		maxTokens = 2048,
		temperature = 0.7,
		topP = 1.0,
		stream = !!callback,
		responseFormat,
	} = params

	// Build messages array
	const messages: MistralChatMessage[] = []

	if (systemPrompt) {
		messages.push({
			role: "system",
			content: systemPrompt,
		})
	}

	messages.push({
		role: "user",
		content: prompt,
	})

	// Build request payload
	const payload = {
		model,
		messages,
		max_tokens: maxTokens,
		temperature,
		top_p: topP,
		stream,
		response_format: responseFormat,
	}

	try {
		const response = await fetch("https://api.mistral.ai/v1/chat/completions", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${API_KEY}`,
			},
			body: JSON.stringify(payload),
		})

		if (!response.ok) {
			const errorText = await response.text()
			throw new Error(`Mistral API error [${response.status}]: ${errorText}`)
		}

		// Handle streaming response
		if (stream && callback) {
			const reader = response.body?.getReader()
			if (!reader) {
				throw new Error("Response body is not readable")
			}

			const decoder = new TextDecoder()
			let buffer = ""
			let fullContent = ""

			while (true) {
				const { done, value } = await reader.read()
				if (done) break

				buffer += decoder.decode(value, { stream: true })

				// Process complete lines
				while (buffer.includes("\n")) {
					const lineEnd = buffer.indexOf("\n")
					const line = buffer.slice(0, lineEnd).trim()
					buffer = buffer.slice(lineEnd + 1)

					// Skip empty lines and comments
					if (!line || line === ":") continue

					// Parse Server-Sent Events format
					if (line.startsWith("data: ")) {
						const data = line.slice(6)

						if (data === "[DONE]") {
							return fullContent
						}

						try {
							const parsed = JSON.parse(data)
							const content = parsed.choices?.[0]?.delta?.content

							if (content) {
								fullContent += content
								callback(content)
							}
						} catch (e) {
							console.warn("Error parsing Mistral stream chunk:", e)
						}
					}
				}
			}

			return fullContent
		} else {
			// Handle non-streaming response
			const data: MistralChatResponse = await response.json()
			const content = data.choices?.[0]?.message?.content

			if (!content) {
				throw new Error("No content in Mistral response")
			}

			return content
		}
	} catch (error) {
		console.error("Mistral chat error:", error)
		throw error
	}
}
