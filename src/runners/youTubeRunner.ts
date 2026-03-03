import { invoke } from "@tauri-apps/api/core";
import { SIMPLE_SUMMARY_SYSTEM_PROMPT_EN, SIMPLE_SUMMARY_SYSTEM_PROMPT_ES } from "@/constants";
import { taskRunner } from "@/stores/taskRunner.svelte";
import { saveTasks } from "@/stores/tasksStore";
import { currentDuration } from "@/stores/ttsStore";
import { primaryColor } from "@/stores/uiStore";
import { viewState } from "@/stores/viewStore.svelte";
import type { Task } from "@/types/taskRunner.types";
import type { TTSLanguage, TTSResult } from "$lib/utils/tts";
import { synthesizeSpeech } from "$lib/utils/tts";
import { getImageColor } from "@/lib/utils/getImageColor";
import { getYouTubeThumbnailUrl } from "@/lib/utils/youtube";
import type {
	Chapter,
	ChapterCaption,
	TimedCaption,
} from "@/lib/utils/youtube/joinCaptionsByChapters";
import { joinCaptionsByChapters } from "@/lib/utils/youtube/joinCaptionsByChapters";
import { downloadImageUrl } from "@/lib/utils/files";

//#region Types
type VideoMetaItem = {
	name: string;
	selector: string;
	textContent: string | null;
};

type InitContext = {
	url: string;
	videoId: string;
	preferredLanguage: TTSLanguage;
};

type YouTubePlayerContext = {
	mediaDirectory: string;
	thumbnailImage: string;
	thumbnailImageSrc: string;
	videoId: string;
};

type VideoInfoContext = {
	videoMeta: VideoMetaItem[];
	chapters: Chapter[];
};

type TranscriptContext = {
	timedCaptions: TimedCaption[];
	transcriptText: string;
};

type ChapterContext = {
	chapterCaptions: ChapterCaption[];
};
//#endregion

//#region Task Names
enum TaskNames {
	INIT = "init",
	THUMBNAIL = "thumbnail",
	MAIN_COLOR = "main-color",
	SUMMARY = "summary",
	CHAPTERS = "chapters",
	TIMED_CAPTIONS = "timed-captions",
	CONTENT = "content",
	VIDEO_INFO = "video-info",
	TTS = "tts",
	Title = "title",
}

type YouTubeTaskState = {
	[TaskNames.INIT]: InitContext;
	[TaskNames.THUMBNAIL]: YouTubePlayerContext;
	[TaskNames.MAIN_COLOR]: { mainColor: string };
	[TaskNames.VIDEO_INFO]: VideoInfoContext;
	[TaskNames.TIMED_CAPTIONS]: TimedCaption[];
	[TaskNames.CONTENT]: string;
	[TaskNames.CHAPTERS]: ChapterContext;
	[TaskNames.SUMMARY]: string;
	[TaskNames.TTS]: TTSResult | null;
	[TaskNames.Title]: string;
};
//#endregion

function buildChapterSummaryTasks(
	chapterCaptions: ChapterCaption[],
	language: TTSLanguage,
): Task[] {
	return chapterCaptions.map((chapter, index) => ({
		id: `chapter-summary-${index}`,
		name: chapter.title,
		widget: false,
		type: "ia",
		component: "base",
		dependencies: index === 0 ? [TaskNames.CHAPTERS] : [`chapter-summary-${index - 1}`],
		systemMessage:
			language === "es"
				? "Eres un asistente que resume capítulos de video."
				: "You are an assistant that summarizes video chapters.",
		run: () => `Title: ${chapter.title}\n\n${chapter.content}`,
		userMessage:
			language === "es"
				? "Resume este capítulo en 2-3 líneas."
				: "Summarize this chapter in 2-3 lines.",
		completionOptions: {
			model: "llama-server",
			temperature: 0.5,
			stream: true,
		},
	}));
}

export function createYouTubeTasks(url: string, language?: TTSLanguage): Task<YouTubeTaskState>[] {
	const selectedLanguage = language ?? viewState.language;

	return [
		{
			id: TaskNames.INIT,
			name: "Initialize YouTube Context",
			dependencies: [],
			type: "script",
			run: () => {
				const urlObj = new URL(url);
				const videoId = urlObj.searchParams.get("v");
				if (!videoId) {
					throw new Error("Invalid YouTube URL");
				}

				return { url, videoId, preferredLanguage: selectedLanguage } satisfies InitContext;
			},
		},
		{
			id: TaskNames.THUMBNAIL,
			name: "Get thumbnail",
			dependencies: [TaskNames.INIT],
			type: "script",
			component: "player",
			run: async (state) => {
				const urlData = state[TaskNames.INIT];

				if (!urlData) {
					throw new Error("Missing dependency context");
				}

				const ytThumbnailUrl = getYouTubeThumbnailUrl(urlData.videoId);

				const {
					mediaDirectory,
					fileName: thumbnailImage,
					imageSrc: thumbnailImageSrc,
				} = await downloadImageUrl(ytThumbnailUrl);

				return {
					mediaDirectory,
					thumbnailImage,
					thumbnailImageSrc,
					videoId: urlData.videoId,
				} satisfies YouTubePlayerContext;
			},
		},
		{
			id: TaskNames.MAIN_COLOR,
			name: "Get main color",
			dependencies: [TaskNames.THUMBNAIL],
			type: "script",
			run: async (state) => {
				const thumbnail = state[TaskNames.THUMBNAIL];
				if (!thumbnail) {
					throw new Error("Missing thumbnail context");
				}
				let mainColor = "";
				try {
					mainColor = await getImageColor(thumbnail.thumbnailImageSrc || "");
					if (mainColor) {
						primaryColor.set(mainColor);
					}
				} catch (colorError) {
					console.error("Error extracting main color:", colorError);
				}

				return { mainColor } satisfies { mainColor: string };
			},
		},
		{
			id: TaskNames.VIDEO_INFO,
			name: "Crawling",
			dependencies: [TaskNames.INIT],
			component: "videoInfo",
			type: "script",
			run: async (state) => {
				const context = state[TaskNames.INIT];
				if (!context) {
					throw new Error("Missing init context");
				}
				const [videoMeta = [], chapters = []] = await invoke<[VideoMetaItem[], Chapter[]]>(
					"get_youtube_info",
					{
						url: context.url,
						selectors: [
							{ name: "title", selector: "#title h1 yt-formatted-string" },
							{ name: "channel", selector: "#text-container yt-formatted-string" },
							{ name: "views", selector: "span.view-count" },
							{ name: "uploadDate", selector: "div#info-strings yt-formatted-string" },
							{ name: "channel", selector: "#channel-name a" },
						],
						intervalTime: 5,
						maxAttempts: 200,
					},
				);

				return { videoMeta, chapters } satisfies VideoInfoContext;
			},
		},
		{
			id: TaskNames.TIMED_CAPTIONS,
			name: "Get timed captions",
			dependencies: [TaskNames.INIT],
			type: "script",
			run: async (state) => {
				const context = state[TaskNames.INIT];
				if (!context) {
					throw new Error("Missing init context");
				}
				const timedCaptions = await invoke<TimedCaption[]>("get_youtube_transcript_timed", {
					id: context.videoId,
					language: context.preferredLanguage,
				});

				return timedCaptions;
			},
		},
		{
			id: TaskNames.CONTENT,
			name: "Get content",
			dependencies: [TaskNames.TIMED_CAPTIONS],
			type: "script",
			run: async (state) => {
				const timedCaptions = state[TaskNames.TIMED_CAPTIONS];
				if (!timedCaptions) {
					throw new Error("Missing timed captions context");
				}

				const transcriptText = timedCaptions
					.map((item) => item.caption)
					.join(" ")
					.trim();

				return transcriptText;
			},
		},
		{
			id: TaskNames.CHAPTERS,
			name: "Process Chapters",
			dependencies: [TaskNames.INIT, TaskNames.VIDEO_INFO, TaskNames.CONTENT],
			type: "script",
			run: async (state) => {
				const context = state[TaskNames.INIT];
				const info = state[TaskNames.VIDEO_INFO];
				const timedCaptions = state[TaskNames.TIMED_CAPTIONS];

				if (!context || !info || !timedCaptions) {
					throw new Error("Missing prerequisites for chapter processing");
				}

				if (!info.chapters.length) {
					return { chapterCaptions: [] } satisfies ChapterContext;
				}

				const chapterCaptions = joinCaptionsByChapters(timedCaptions, info.chapters);
				const chapterSummaryTasks = buildChapterSummaryTasks(
					chapterCaptions,
					context.preferredLanguage,
				);

				// this will create new tasks in runner and run them after the current task finishes, because they are added with dependencies to the current task.
				taskRunner.enqueueTasks(chapterSummaryTasks);

				return { chapterCaptions } satisfies ChapterContext;
			},
		},
		{
			id: TaskNames.SUMMARY,
			name: "Summary",
			dependencies: [TaskNames.INIT, TaskNames.CONTENT],
			component: "base",
			type: "ia",
			systemMessage:
				selectedLanguage === "es"
					? SIMPLE_SUMMARY_SYSTEM_PROMPT_ES
					: SIMPLE_SUMMARY_SYSTEM_PROMPT_EN,
			run: (state) => {
				const transcriptText = state[TaskNames.CONTENT];
				if (!transcriptText) {
					return "";
				}
				return transcriptText;
			},
			userMessage:
				selectedLanguage === "es"
					? "Resume el contexto de manera concisa y clara en un solo párrafo. maximo 4 lineas."
					: "Summarize the context concisely and clearly in a single paragraph. maximum 4 lines.",
			completionOptions: {
				model: "llama-server",
				temperature: 0.7,
				stream: true,
			},
			baseUrl: "http://localhost:8080",
		},
		{
			id: TaskNames.TTS,
			name: "Generate TTS",
			dependencies: [TaskNames.SUMMARY],
			type: "script",
			run: async (state) => {
				const summary = String(state[TaskNames.SUMMARY] || "");
				if (!summary.trim()) {
					return null;
				}

				const result = await synthesizeSpeech(
					summary,
					selectedLanguage,
					"/run/media/jhon/2ae745c3-9664-4fcc-a90a-586e6d5487a4/proyects/supertonic/assets/voice_styles/F1.json",
					{
						speed: 1.3,
						onnx_dir:
							"/run/media/jhon/2ae745c3-9664-4fcc-a90a-586e6d5487a4/proyects/supertonic/assets/onnx/",
						total_step: 4,
					},
				);

				currentDuration.set(result.duration);
				invoke("play_tts_file", { filePath: result.file_path }).catch((err) => {
					console.error("Error playing TTS:", err);
				});

				return result;
			},
		},
	];
}

export async function youTubeRunner(url: string, language?: TTSLanguage): Promise<Task[]> {
	try {
		const selectedLanguage = language ?? viewState.language;
		const tasks = createYouTubeTasks(url, selectedLanguage);
		taskRunner.setTasks(tasks);
		const runResult = await taskRunner.run();

		console.log("All tasks completed:", runResult);

		await saveTasks(url, runResult.tasks);

		console.log("Tasks saved to store and database.");

		return runResult.tasks;
	} catch (invokeErr) {
		throw new Error(`Error: ${invokeErr}`);
	}
}
