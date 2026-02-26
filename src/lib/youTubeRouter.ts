import { invoke } from "@tauri-apps/api/core"
import {
	SIMPLE_SUMMARY_SYSTEM_PROMPT_EN,
	SIMPLE_SUMMARY_SYSTEM_PROMPT_ES,
	STRUCTURED_RESPONSE_SYSTEM_PROMPT_EN,
	STRUCTURED_SUMMARY_JSON_PROMPT_ES,
} from "@/constants"
import { chatCompletions } from "@/lib/utils/llama-completions"
import { currentDuration } from "@/stores/ttsStore"
import { primaryColor } from "@/stores/uiStore"
import { viewState } from "@/stores/viewStore.svelte"
import { synthesizeSpeech } from "$lib/utils/tts"
import { extractKeypoints } from "./extractKeypoints"
import { getImageSrc } from "./utils/dirs"
import { getImageColor } from "./utils/getImageColor"
import { getYouTubeThumbnailUrl } from "./utils/youtube"
import type { Chapter, ChapterCaption, TimedCaption } from "./utils/youtube/joinCaptionsByChapters"

import { joinCaptionsByChapters } from "./utils/youtube/joinCaptionsByChapters"
import { type ChapterSummaryItem, summarizeChapters } from "./utils/youtube/summarizeChapters"

type VideoMetaItem = {
	name: string
	selector: string
	textContent: string | null
}

export async function youTubeRouter(
	url: string,
	languages: string[] = ["en", "es"],
): Promise<{ content: string; summary: string }> {
	//extract video id from youtube link
	const urlObj = new URL(url)
	const videoId = urlObj.searchParams.get("v")
	if (!videoId) {
		throw new Error("Invalid YouTube URL")
	}

	try {
		viewState.summary = ""

		// Thumbnail and color setup
		const _mediaDir = await invoke<string>("url_to_folder_name", { url })
		viewState.mediaDirectory = _mediaDir
		const ytThumbnailUrl = getYouTubeThumbnailUrl(videoId)
		const _mainImage = await invoke<string>("download_and_save_image", {
			url: ytThumbnailUrl,
			folderName: _mediaDir,
		})
		viewState.mainImage = _mainImage
		viewState.mainImageSrc = await getImageSrc(_mediaDir, _mainImage)

		let mainColor = ""
		try {
			mainColor = await getImageColor(viewState.mainImageSrc || "")
			if (mainColor) {
				primaryColor.set(mainColor)
			}
		} catch (colorError) {
			console.error("Error extracting main color:", colorError)
		}

		const preferredLanguage = languages.includes(viewState.language)
			? viewState.language
			: languages[0] || "es"

		// Video Info
		const videoInfo = await invoke<[VideoMetaItem[], Chapter[]]>("get_youtube_info", {
			url,
			selectors: [
				{ name: "title", selector: "#title h1 yt-formatted-string" },
				{ name: "channel", selector: "#text-container yt-formatted-string" },
				{ name: "views", selector: "span.view-count" },
				{ name: "uploadDate", selector: "div#info-strings yt-formatted-string" },
				{ name: "channel", selector: "#channel-name a" },
			],
		})

		const [videoMeta = [], chapters = []] = videoInfo

		viewState.youtubeInfo = {
			title: videoMeta.find((info) => info.name === "title")?.textContent || "",
			channel: videoMeta.find((info) => info.name === "channel")?.textContent || "",
			withChapters: chapters.length > 0,
			chapters,
			chapterCaptions: [],
			chapterSummaries: [],
			transcript: "",
		}

		// Transcript
		const _transcript: TimedCaption[] = await invoke<TimedCaption[]>(
			"get_youtube_transcript_timed",
			{
				id: videoId,
				language: preferredLanguage,
			},
		)
		const transcriptText = _transcript
			.map((item) => item.caption)
			.join(" ")
			.trim()
		viewState.youtubeInfo.transcript = transcriptText

		if (viewState.youtubeInfo.withChapters) {
			const chapterCaptions: ChapterCaption[] = joinCaptionsByChapters(_transcript, chapters)
			viewState.youtubeInfo = {
				...viewState.youtubeInfo,
				chapterCaptions,
			}

			const chapterSummaries = await summarizeChapters(chapterCaptions, viewState.language)
			viewState.youtubeInfo = {
				...viewState.youtubeInfo,
				chapterSummaries,
			}
			console.log("[Chapter Summaries]:", chapterSummaries)
		}

		console.log("[YouTube Video Info]:", viewState.youtubeInfo)

		// Summary
		const summaryPromptEs = "Resume el contexto de manera concisa y clara en un solo párrafo."
		const summaryPromptEn = "Summarize the context concisely and clearly in a single paragraph."

		const chaptersummaryPromptEs = `Resume este capitulo de manera concisa y clara.`
		const chaptersummaryPromptEn = `Summarize this chapter concisely and clearly.`

		const system_prompt =
			viewState.language === "es"
				? SIMPLE_SUMMARY_SYSTEM_PROMPT_ES
				: SIMPLE_SUMMARY_SYSTEM_PROMPT_EN
		const summaryPrompt =
			viewState.language === "es"
				? `context: ${viewState.youtubeInfo.transcript} \n\n ${summaryPromptEs}`
				: `context: ${viewState.youtubeInfo.transcript} \n\n ${summaryPromptEn}`

		const response = await chatCompletions(
			{
				model: "gpt-3.5-turbo",
				messages: [
					{ role: "system", content: system_prompt },
					{ role: "user", content: summaryPrompt },
				],
				temperature: 0.7,
				//top_p: 0.95,
				//presence_penalty: 0.1,
				//frequency_penalty: 0.2,
				stream: true,
				stream_options: {
					//include_usage: true,
				},
			},
			{
				onToken: (chunk: string) => {
					viewState.summary = (viewState.summary || "") + chunk
				},
			},
		)

		// const keypoints = await extractKeypoints(_transcript);
		//console.log('[Extracted Keypoints]:', keypoints);

		console.log("[Summary Response]:", response)

		const result = await synthesizeSpeech(
			viewState.summary,
			viewState.language,
			"/run/media/jhon/2ae745c3-9664-4fcc-a90a-586e6d5487a4/proyects/supertonic/assets/voice_styles/F1.json",
			{
				speed: 1.3,
				onnx_dir:
					"/run/media/jhon/2ae745c3-9664-4fcc-a90a-586e6d5487a4/proyects/supertonic/assets/onnx/",
				total_step: 4,
			},
		)

		currentDuration.set(result.duration)

		invoke("play_tts_file", { filePath: result.file_path }).catch((err) => {
			console.error("Error playing TTS:", err)
		})

		return { content: viewState.content, summary: viewState.summary }
	} catch (invokeErr) {
		throw new Error(`Failed to fetch YouTube transcript: ${invokeErr}`)
	}
}

async function recursiveSummarize(
	text: string,
	language: string,
	maxTextLength: number = 12000,
): Promise<string> {
	// Base case: if text is small enough, summarize directly
	if (text.length <= maxTextLength) {
		const systemPrompt =
			language === "es" ? SIMPLE_SUMMARY_SYSTEM_PROMPT_ES : SIMPLE_SUMMARY_SYSTEM_PROMPT_EN
		const summaryPrompt =
			language === "es" ? `Resume de manera concisa: ${text}` : `Summarize concisely: ${text}`

		const response = await chatCompletions(
			{
				model: "gpt-3.5-turbo",
				messages: [
					{ role: "system", content: systemPrompt },
					{ role: "user", content: summaryPrompt },
				],
				temperature: 0.3,
				top_p: 0.95,
				presence_penalty: 0.1,
				frequency_penalty: 0.2,
				stream: false,
			},
			"http://localhost:8080",
		)

		return String(response.choices[0]?.message?.content || "")
	}

	// Split text into two equal parts and summarize each
	const midpoint = Math.floor(text.length / 2)
	const left = text.slice(0, midpoint)
	const right = text.slice(midpoint)

	const [leftSummary, rightSummary] = await Promise.all([
		recursiveSummarize(left, language, maxTextLength),
		recursiveSummarize(right, language, maxTextLength),
	])

	// Combine summaries and recursively summarize again
	const combinedSummaries = `${leftSummary}\n\n${rightSummary}`
	return recursiveSummarize(combinedSummaries, language, maxTextLength)
}
