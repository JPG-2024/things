import { invoke } from "@tauri-apps/api/core"

interface GenerateResponseParams {
	prompt: string
	systemPrompt: string
	temperature?: number
}

export async function generateResponse({
	prompt,
	systemPrompt,
	temperature = 0.2,
}: GenerateResponseParams): Promise<string> {
	const response = await invoke<string>("generate_response", {
		prompt: prompt,
		stream: true,
		options: {
			system_prompt: systemPrompt,
			temperature: temperature,
		},
	})

	return response
}
