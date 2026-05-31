import type {
	Chapter,
	ChapterCaption,
	TimedCaption
} from '@/lib/utils/youtube/joinCaptionsByChapters';
import type { Task, TaskGlobalState, TaskRuntime } from '@/types/taskRunner.types';
import type { TTSLanguage } from '$lib/utils/tts';

export type PageElementItem = {
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
	url: string;
};

export type ChapterContext = {
	chapterCaptions: ChapterCaption[];
};

export enum TaskNames {
	INIT_YOUTUBE_PROFILE = 'init-youtube-profile',
	INIT_YOUTUBE_VIDEO = 'init-youtube-video',
	THUMBNAIL = 'thumbnail',
	MAIN_COLOR = 'main-color',
	SUMMARY = 'summary',
	EXTRACT_CHANNEL_VIDEOS = 'extract-channel-videos',
	KEYWORDS = 'keywords',
	KEYPOINTS = 'key-points',
	CHAPTERS = 'chapters',
	CHAPTERS_SUMMARY = 'chapters-summary',
	TIMED_CAPTIONS = 'timed-captions',
	CONTENT = 'content',
	VIDEO_INFO = 'video-info',
	TITLE_SUMMARY = 'title-summary',
	TITLE = 'title',
	EXTRACT_PROFILE = 'extract-profile',
	PROFILE_FROM_VIDEO = 'profile-from-video'
}

export type YouTubeTaskState = {
	[TaskNames.INIT_YOUTUBE_PROFILE]: InitContext;
	[TaskNames.INIT_YOUTUBE_VIDEO]: InitContext;
	[TaskNames.THUMBNAIL]: YouTubePlayerContext;
	[TaskNames.MAIN_COLOR]: string;
	[TaskNames.VIDEO_INFO]: PageElementItem[];
	[TaskNames.TIMED_CAPTIONS]: TimedCaption[];
	[TaskNames.CONTENT]: string;
	[TaskNames.EXTRACT_CHANNEL_VIDEOS]: unknown;
	[TaskNames.CHAPTERS]: Chapter[];
	[TaskNames.CHAPTERS_SUMMARY]: ChapterContext;
	[TaskNames.SUMMARY]: string;
	[TaskNames.KEYWORDS]: string;
	[TaskNames.KEYPOINTS]: string;
	[TaskNames.TITLE_SUMMARY]: string;
	[TaskNames.TITLE]: string;
	[TaskNames.EXTRACT_PROFILE]: { name: string; profilePicture: string | null };
	[TaskNames.PROFILE_FROM_VIDEO]: { profileId: string; runId: string };
} & Record<`chapter-summary-${number}`, string>;

export type YouTubeTaskId = keyof YouTubeTaskState & string;

export type YouTubeTaskFactoryContext = {
	url: string;
	language: TTSLanguage;
	freshRun: boolean;
	profileId?: string;
	videosAmount?: number;
};

export type YouTubeTaskFactory = (context: YouTubeTaskFactoryContext) => Task<YouTubeTaskState>;

export type YouTubeTaskRegistrySubset<TIds extends YouTubeTaskId> = Pick<
	Record<YouTubeTaskId, YouTubeTaskFactory>,
	TIds
>;

export const defaultCompletionOptions = {
	model: 'llama-server',
	temperature: 0.8,
	min_p: 0.0,
	presence_penalty: 1.5,
	repetition_penalty: 1.0,
	stream: true
} as const;

export function getContentFromState(runtime: Pick<TaskRuntime<YouTubeTaskState>, 'state'>): string {
	return String(runtime.state[TaskNames.CONTENT] || '');
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
		intervalMs: 2000
	};
}
