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
	language: TTSLanguage;
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
	CHAPTERS_SUMMARY = "chapters-summary",
	TIMED_CAPTIONS = "timed-captions",
	CONTENT = "content",
	VIDEO_INFO = "video-info",
	TTS = "tts",
	TITLE_SUMMARY = "title-summary"
}

export type YouTubeTaskState = {
	[TaskNames.INIT]: InitContext;
	[TaskNames.THUMBNAIL]: YouTubePlayerContext;
	[TaskNames.MAIN_COLOR]: string;
	[TaskNames.VIDEO_INFO]: VideoMetaItem[];
	[TaskNames.TIMED_CAPTIONS]: TimedCaption[];
	[TaskNames.CONTENT]: string;
	[TaskNames.CHAPTERS]: Chapter[];
	[TaskNames.CHAPTERS_SUMMARY]: ChapterContext;
	[TaskNames.SUMMARY]: string;
	[TaskNames.KEY_POINTS]: string;
	[TaskNames.TTS]: TTSResult | null;
	[TaskNames.TITLE_SUMMARY]: string;
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
		dependencies: index === 0 ? [TaskNames.CHAPTERS_SUMMARY] : [`chapter-summary-${index - 1}`],
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
			temperature: 0.7,
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

			return { url, videoId, language };
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
			};
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

			return mainColor;
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
			const params = {
				url: context.url,
				attempts: 5,
				intervalMs: 2000,
			};

			const videoMeta = await invoke<VideoMetaItem[]>("get_page_elements", {
					...params,
					selectors: [
						{ name: "title", selector: "#title h1 yt-formatted-string" },
						{ name: "views", selector: "span.view-count" },
						{ name: "uploadDate", selector: "div#info-strings yt-formatted-string" },
						{ name: "channel", selector: "#channel-name a", attribute: "href" },
					],
				});


			return videoMeta;
		},
	}),
	[TaskNames.CHAPTERS]: () => ({
		id: TaskNames.CHAPTERS,
		name: "Crawling",
		dependencies: [TaskNames.INIT],
		component: "videoInfo",
		type: "script",
		run: async (state) => {
			const context = state[TaskNames.INIT];
			if (!context) {
				throw new Error("Missing init context");
			}
			const params = {
				url: context.url,
				attempts: 5,
				intervalMs: 2000,
			};

			const chapters = await invoke<Chapter[]>("extract_chapters", params);

			return chapters;
		},
	}),
	[TaskNames.TIMED_CAPTIONS]: () => ({
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
				language: context.language,
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
	[TaskNames.CHAPTERS_SUMMARY]: () => ({
		id: TaskNames.CHAPTERS_SUMMARY,
		name: "Process Chapters",
		dependencies: [TaskNames.INIT, TaskNames.CHAPTERS, TaskNames.TIMED_CAPTIONS],
		type: "script",
		persist: true,
		run: async (state) => {
			const context = state[TaskNames.INIT];
			const chapters = state[TaskNames.CHAPTERS];
			const timedCaptions = state[TaskNames.TIMED_CAPTIONS];

			if (!context || !chapters || !timedCaptions) {
				throw new Error("Missing prerequisites for chapter processing");
			}

			if (!chapters.length) {
				return { chapterCaptions: [] };
			}

			const chapterCaptions = joinCaptionsByChapters(timedCaptions, chapters);
			const chapterSummaryTasks = buildChapterSummaryTasks(
				chapterCaptions,
				context.language,
			);

			taskRunner.enqueueTasks(chapterSummaryTasks);

			return { chapterCaptions };
		},
	}),
	[TaskNames.SUMMARY]: ({ language }) => ({
		id: TaskNames.SUMMARY,
		name: "Summary",
		dependencies: [TaskNames.CONTENT],
		component: "base",
		type: "ia",
		systemMessage: `You are a professional summarizer. Your task is to extract the main ideas from the provided text. Limit to 60 words maximum. Maintain a formal tone. CRITICAL answer in ${language === 'es' ? 'Spanish' : 'English'}.`,
		run: (state) => {
			const transcriptText = state[TaskNames.CONTENT];
			if (!transcriptText) {
				return "";
			}
			return transcriptText;
		},
		userMessage: "Summarize the context clearly in a single paragraph with a short conclusion.",
		completionOptions: {
			model: "llama-server",
			temperature: 0.7,
			stream: true,
		},
	}),
		[TaskNames.TITLE_SUMMARY]: ({ language }) => ({
		id: TaskNames.TITLE_SUMMARY,
		name: "Title Summary",
		dependencies: [TaskNames.CONTENT],
		component: "base",
		type: "ia",
		systemMessage: `Generate a short, catchy, and relevant summary for this YouTube video. Limit to 20 words maximum. Avoid words like summary, video, etc. CRITICAL answer in ${language === 'es' ? 'Spanish' : 'English'}.`,
		run: (state) => {
			const transcriptText = state[TaskNames.CONTENT];
			if (!transcriptText) {
				return "";
			}
			return transcriptText;
		},
		userMessage: `Generate a short summary for this video. Answer in ${language === 'es' ? 'Spanish' : 'English'}.`,
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
			"Return only valid JSON that matches the provided schema.",
		run: (state) => {
			const transcriptText = state[TaskNames.CONTENT];
			if (!transcriptText) {
				return "";
			}
			return transcriptText;
		},
		userMessage:
			"extract 5 keywords that represent the main topics of the video.",
		completionOptions: {
			model: "llama-server",
			temperature: 0.7,
			stream: true,
			 response_format: {
				type: 'json_schema',
				json_schema: {
				name: 'summary_keywords',
				strict: true,
				schema: {
					type: 'object',
					properties: {
					keywords: {
						type: 'array',
						items: { type: 'string' },
						minItems: 5,
						maxItems: 5
					}
					},
					required: ['keywords'],
					additionalProperties: false
				}
				}
			}
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
					total_step: 6,
				},
			);

			currentDuration.set(result.duration);
			invoke("play_tts_file", { filePath: result.file_path }).catch((err) => {
				console.error("Error playing TTS:", err);
			});

			return result;
		},
	})
};
