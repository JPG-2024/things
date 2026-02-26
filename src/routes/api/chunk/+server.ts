import type { RequestHandler } from "@sveltejs/kit"

export const POST: RequestHandler = async ({ request, url }) => {
	const articleId = url.searchParams.get("articleId")
	const category = url.searchParams.get("category")
	const strategy = url.searchParams.get("strategy")

	try {
		// Get the text body from the request
		const text = await request.text()

		if (!text) {
			return new Response("Request body is empty", { status: 400 })
		}

		const queryString = new URLSearchParams({
			articleId: articleId || "",
			category: category || "",
			strategy: strategy || "",
		}).toString()

		const response = await fetch(`http://localhost:3000/api/chunk?${queryString}`, {
			method: "POST",
			headers: {
				"Content-Type": "text/plain",
			},
			body: text,
		})

		const data = await response.text()
		return new Response(data, {
			status: response.status,
			headers: {
				"Content-Type": response.headers.get("Content-Type") || "text/plain",
			},
		})
	} catch (error) {
		console.error("API chunk error:", error)
		return new Response("Internal server error", { status: 500 })
	}
}
