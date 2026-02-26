import { invoke } from "@tauri-apps/api/core"

export async function extractMetadata(url: string) {
	let metadata = ""
	try {
		invoke("extract_metadata", { url })
		metadata = await invoke("extract_metadata", { url })
		return metadata
	} catch (err) {
		console.error("Error extracting metadata:", err)
		return ""
	}
}
