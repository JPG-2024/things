import { invoke } from "@tauri-apps/api/core";
import { SIMPLE_SUMMARY_SYSTEM_PROMPT_EN, SIMPLE_SUMMARY_SYSTEM_PROMPT_ES } from "@/constants";
import { downloadImageUrl } from "@/lib/utils/files";
import { getImageColor } from "@/lib/utils/getImageColor";
import { getYouTubeThumbnailUrl } from "@/lib/utils/youtube";
import type {
	Chapter,
	ChapterCaption,
	TimedCaption,
} from "@/lib/utils/youtube/joinCaptionsByChapters";
import { joinCaptionsByChapters } from "@/lib/utils/youtube/joinCaptionsByChapters";
import { taskRunner } from "@/runners/taskRunner.svelte";
import { currentDuration } from "@/stores/ttsStore";
import { primaryColor } from "@/stores/uiStore";
import type { Task } from "@/types/taskRunner.types";
import type { TTSLanguage, TTSResult } from "$lib/utils/tts";
import { synthesizeSpeech } from "$lib/utils/tts";

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

type ChapterContext = {
	chapterCaptions: ChapterCaption[];
};

export enum TaskNames {
	INIT = "init",
	THUMBNAIL = "thumbnail",
	MAIN_COLOR = "main-color",
	SUMMARY = "Summary",
	KEY_POINTS = "key-points",
	CHAPTERS = "chapters",
	TIMED_CAPTIONS = "timed-captions",
	CONTENT = "content",
	VIDEO_INFO = "video-info",
	TTS = "tts",
	Title = "title",
}

export type YouTubeTaskState = {
	[TaskNames.INIT]: InitContext;
	[TaskNames.THUMBNAIL]: YouTubePlayerContext;
	[TaskNames.MAIN_COLOR]: string;
	[TaskNames.VIDEO_INFO]: VideoInfoContext;
	[TaskNames.TIMED_CAPTIONS]: TimedCaption[];
	[TaskNames.CONTENT]: string;
	[TaskNames.CHAPTERS]: ChapterContext;
	[TaskNames.SUMMARY]: string;
	[TaskNames.KEY_POINTS]: string;
	[TaskNames.TTS]: TTSResult | null;
	[TaskNames.Title]: string;
};

export type YouTubeTaskId = keyof YouTubeTaskState & string;

export type YouTubeTaskFactoryContext = {
	url: string;
	language: TTSLanguage;
};

type YouTubeTaskFactory = (context: YouTubeTaskFactoryContext) => Task<YouTubeTaskState>;

function buildChapterSummaryTasks(chapterCaptions: ChapterCaption[], language: TTSLanguage): Task[] {
	return chapterCaptions.map((chapter, index) => ({
		id: `chapter-summary-${index}`,
		name: chapter.title,
		widget: false,
		type: "ia",
		component: "base",
		dependencies: index === 0 ? [TaskNames.CHAPTERS] : [`chapter-summary-${index - 1}`],
		systemMessage:
			language === "es"
				? "Eres un asistente que resume cap\u00edtulos de video."
				: "You are an assistant that summarizes video chapters.",
		run: () => `Title: ${chapter.title}\n\n${chapter.content}`,
		userMessage:
			language === "es"
				? "Resume este cap\u00edtulo en 2-3 l\u00edneas."
				: "Summarize this chapter in 2-3 lines.",
		completionOptions: {
			model: "llama-server",
			temperature: 0.2,
			stream: true,
		},
	}));
}

export const youtubeTaskRegistry: Record<YouTubeTaskId, YouTubeTaskFactory> = {
	[TaskNames.INIT]: ({ url, language }) => ({
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

			return { url, videoId, preferredLanguage: language } satisfies InitContext;
		},
	}),
	[TaskNames.THUMBNAIL]: () => ({
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
	}),
	[TaskNames.MAIN_COLOR]: () => ({
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

			return mainColor satisfies string;
		},
	}),
	[TaskNames.VIDEO_INFO]: () => ({
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
	}),
	[TaskNames.TIMED_CAPTIONS]: () => ({
		id: TaskNames.TIMED_CAPTIONS,
		name: "Get timed captions",
		dependencies: [TaskNames.INIT],
		type: "script",
		persist: true,
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
	}),
	[TaskNames.CONTENT]: () => ({
		id: TaskNames.CONTENT,
		name: "Get content",
		dependencies: [TaskNames.TIMED_CAPTIONS],
		type: "script",
		persist: true,
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
	}),
	[TaskNames.CHAPTERS]: () => ({
		id: TaskNames.CHAPTERS,
		name: "Process Chapters",
		dependencies: [TaskNames.INIT, TaskNames.VIDEO_INFO, TaskNames.TIMED_CAPTIONS],
		type: "script",
		persist: true,
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

			taskRunner.enqueueTasks(chapterSummaryTasks);

			return { chapterCaptions } satisfies ChapterContext;
		},
	}),
	[TaskNames.SUMMARY]: ({ language }) => ({
		id: TaskNames.SUMMARY,
		name: "Summary",
		dependencies: [TaskNames.CONTENT],
		component: "base",
		type: "ia",
		systemMessage:
			language === "es"
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
			language === "es"
				? "Resume el contexto de manera concisa y clara en un solo p\u00e1rrafo. maximo 4 lineas."
				: "Summarize the context concisely and clearly in a single paragraph. maximum 4 lines.",
		completionOptions: {
			model: "llama-server",
			temperature: 0.7,
			stream: true,
		},
	}),
	[TaskNames.KEY_POINTS]: ({ language }) => ({
		id: TaskNames.KEY_POINTS,
		name: "Key Points",
		dependencies: [TaskNames.CONTENT],
		component: "base",
		type: "ia",
		systemMessage:
			language === "es"
				? "Eres un asistente que extrae los puntos clave de un video."
				: "You are an assistant that extracts key points from a video.",
		run: (state) => {
			const transcriptText = state[TaskNames.CONTENT];
			if (!transcriptText) {
				return "";
			}
			return transcriptText;
		},
		userMessage:
			language === "es"
				? "Extrae los 10 puntos clave m\u00e1s importantes del video en una lista numerada."
				: "Extract the 10 most important key points from the video in a numbered list.",
		completionOptions: {
			model: "llama-server",
			temperature: 0.7,
			stream: true,
		},
	}),
	[TaskNames.TTS]: ({ language }) => ({
		id: TaskNames.TTS,
		name: "Generate TTS",
		dependencies: [TaskNames.SUMMARY],
		type: "script",
		persist: true,
		run: async (state) => {
			const summary = String(state[TaskNames.SUMMARY] || "");
			if (!summary.trim()) {
				return null;
			}

			const result = await synthesizeSpeech(
				summary,
				language,
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
	}),
	[TaskNames.Title]: () => ({
		id: TaskNames.Title,
		name: "Title",
		dependencies: [TaskNames.VIDEO_INFO],
		type: "script",
		run: (state) => {
			const info = state[TaskNames.VIDEO_INFO];
			return info?.videoMeta.find((item) => item.name === "title")?.textContent ?? "";
		},
	}),
};
