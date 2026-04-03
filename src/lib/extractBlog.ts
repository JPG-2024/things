import { invoke } from "@tauri-apps/api/core";
import {
	BLOG_SUMMARY_SYSTEM_PROMPT,
	DOCS_SUMMARY_SYSTEM_PROMPT,
} from "@/constants";
import { viewState } from "@/stores/viewStore.svelte";
import { getImageSrc } from "./utils/files";
import { compactMarkdown } from "./utils/splitter";

export async function extractBlog(
	url: string
): Promise<{ content: string; summary: string }> {
	try {
		const response = await invoke<{
			metadata: Record<string, string>;
			markdown: string;
		}>("extract_blog", { url, selectors: ["#primary-inner", "article"] });

		if (response.metadata["og:image"]) {
			const _mediaDir = await invoke<string>("url_to_folder_name", { url });
			viewState.mediaDirectory = _mediaDir;
			const _mainImage = await invoke<string>("download_and_save_image", {
				url: response.metadata["og:image"],
				folderName: _mediaDir,
			});
			viewState.mainImage = _mainImage;
			viewState.mainImageSrc = await getImageSrc(_mediaDir, _mainImage);
		}

		const compactedMarkdown = compactMarkdown(response.markdown);
		const system_prompt = "Follow rules. Answer in spanish";

		const prompt =
			viewState.prompt ||
			`dame un resumen breve. 5 puntos clave y una conclusión.`;

		const summaryPrompt = `context: ${compactedMarkdown} \n\n ${prompt}`;

		viewState.summary = null;

		const llmResponse = await invoke<string>("generate_response", {
			prompt: summaryPrompt,
			stream: true,
			options: {
				system_prompt: system_prompt,
				model: "not-necessary",
			},
		});

		viewState.summary = llmResponse;

		return {
			content: compactedMarkdown,
			summary: llmResponse,
		};
	} catch (err) {
		console.error("Error extracting blog:", err);
		return { content: "", summary: "" };
	}
}
