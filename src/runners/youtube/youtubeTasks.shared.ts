import type {
	Chapter,
	ChapterCaption,
	TimedCaption,
} from "@/lib/utils/youtube/joinCaptionsByChapters";
import type { Task, TaskGlobalState } from "@/types/taskRunner.types";
import type { TTSLanguage, TTSResult } from "$lib/utils/tts";

export type VideoMetaItem = {
	name: string;
	selector: string;
	textContent: string | null;
};

export type InitContext = {
	url: string;
	videoId: string | null;
	language: TTSLanguage;
};

export type YouTubePlayerContext = {
	mediaDirectory: string;
	thumbnailImage: string;
	thumbnailImageSrc: string;
	videoId: string;
};

export type ChapterContext = {
	chapterCaptions: ChapterCaption[];
};

export type GetChannelVideosContext = {
	channelName: string;
	channelPicSrc: string;
	videoIds: string[];
};

export enum TaskNames {
	INIT = "init",
	THUMBNAIL = "thumbnail",
	MAIN_COLOR = "main-color",
	SUMMARY = "Summary",
	GET_CHANNEL_VIDEOS = "Getting channel videos",
	EXTRACT_CHANNEL_VIDEOS = "Extract channel videos",
	KEY_POINTS = "key-points",
	CHAPTERS = "chapters",
	CHAPTERS_SUMMARY = "chapters-summary",
	TIMED_CAPTIONS = "timed-captions",
	CONTENT = "content",
	VIDEO_INFO = "video-info",
	TTS = "tts",
	TITLE_SUMMARY = "title-summary",
}

export type YouTubeTaskState = {
	[TaskNames.INIT]: InitContext;
	[TaskNames.THUMBNAIL]: YouTubePlayerContext;
	[TaskNames.MAIN_COLOR]: string;
	[TaskNames.VIDEO_INFO]: VideoMetaItem[];
	[TaskNames.TIMED_CAPTIONS]: TimedCaption[];
	[TaskNames.CONTENT]: string;
	[TaskNames.GET_CHANNEL_VIDEOS]: GetChannelVideosContext;
	[TaskNames.EXTRACT_CHANNEL_VIDEOS]: unknown;
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

export type YouTubeTaskFactory = (
	context: YouTubeTaskFactoryContext
) => Task<YouTubeTaskState>;

export type YouTubeTaskRegistrySubset<TIds extends YouTubeTaskId> = Pick<
	Record<YouTubeTaskId, YouTubeTaskFactory>,
	TIds
>;

export const defaultCompletionOptions = {
	model: "llama-server",
	temperature: 0.7,
	stream: true,
} as const;

export function getContentFromState(
	state: Readonly<TaskGlobalState<YouTubeTaskState>>
): string {
	return String(state[TaskNames.CONTENT] || "");
}

export function getRequiredTaskState<TId extends YouTubeTaskId>(
	state: Readonly<TaskGlobalState<YouTubeTaskState>>,
	taskId: TId,
	errorMessage = `Missing task state for "${taskId}"`
): YouTubeTaskState[TId] {
	const value = state[taskId];
	if (value === undefined) {
		throw new Error(errorMessage);
	}

	return value;
}

export function buildVideoPageParams(url: string) {
	return {
		url,
		attempts: 5,
		intervalMs: 2000,
	};
}
