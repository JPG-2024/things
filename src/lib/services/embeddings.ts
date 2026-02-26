const BASE_URL = "http://localhost:3000"

interface ChunkParams {
	articleId: string
	category: string
	strategy: string
}

interface Document {
	id?: string
	content?: string
	articleId?: string
	category?: string
	score?: number
	[key: string]: any
}

export async function saveEmbeddings(params: ChunkParams, body: string): Promise<Response> {
	const queryString = new URLSearchParams({
		articleId: params.articleId,
		category: params.category,
		strategy: params.strategy,
	}).toString()

	const url = `${BASE_URL}/api/chunk?${queryString}`

	return fetch(url, {
		method: "POST",
		headers: {
			"Content-Type": "text/plain",
		},
		body,
	})
}

interface RetrieveParams {
	query: string
	topK?: number
	articleId?: string
	category?: string
}

// New function to call POST /api/retrieve and return documents
export async function getDocuments(params: RetrieveParams): Promise<Document[]> {
	if (!params || !params.query) {
		throw new Error('getDocuments requires a "query" field in params.')
	}

	const url = `${BASE_URL}/api/retrieve`
	const response = await fetch(url, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
		},
		body: JSON.stringify(params),
	})

	if (!response.ok) {
		const errorText = await response.text().catch(() => "")
		throw new Error(
			`Failed to retrieve documents: ${response.status} ${response.statusText} ${errorText}`,
		)
	}

	const data = await response.json()

	console.log("Retrieved documents:", data)

	return data
	// Assume the API returns an array of documents; adapt if it returns a different structure
	return Array.isArray(data) ? data : (data.documents ?? [])
}
