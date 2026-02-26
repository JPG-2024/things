import ollama from "ollama"
import z from "zod"

interface KeywordResult {
	keywords: Array<{
		term: string
		frequency: number
		relevance: number
	}>
	summary: string
}

export async function extractKeywords(
	content: string,
	config: { maxKeywords?: number } = { maxKeywords: 10 },
): Promise<KeywordResult> {
	const maxKeywords = config.maxKeywords || 10

	try {
		const response = await ollama.chat({
			model: "gpt-oss",
			format: "json",
			messages: [
				{
					role: "system",
					content: `You are an expert keyword extraction assistant. Extract keywords from text with precision.
You MUST respond with ONLY valid JSON, no additional text.`,
				},
				{
					role: "user",
					content: `Extract the top ${maxKeywords} keywords from this text. Analyze frequency and relevance.
Return ONLY this JSON structure:
{
  "keywords": [
    {"term": "word", "frequency": 1, "relevance": 0.9}
  ],
  "summary": "brief summary"
}

TEXT:
${content}`,
				},
			],
		})

		// Extract and clean the response content
		let content_text = response.message.content.trim()

		// Remove any markdown code blocks if present
		if (content_text.includes("```json")) {
			content_text = content_text.replace(/```json\n?/g, "").replace(/```\n?/g, "")
		} else if (content_text.includes("```")) {
			content_text = content_text.replace(/```\n?/g, "")
		}

		const result: KeywordResult = JSON.parse(content_text)
		console.log("Extracted keywords:", result)
		return result
	} catch (error) {
		console.error("Error extracting keywords:", error)
		throw new Error(`Failed to extract keywords: ${error}`)
	}
}
