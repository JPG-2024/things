import type {
	Task,
	TaskGlobalState,
	TaskRuntime,
} from "@/types/taskRunner.types";
import type { TTSLanguage, TTSResult } from "$lib/utils/tts";

export type WebInitContext = {
	url: string;
	language: TTSLanguage;
	extraction: {
		metadata: Record<string, string>;
		content: string;
	};
};

export type WebThumbnailContext = {
	mediaDirectory: string;
	thumbnailImage: string;
	thumbnailImageSrc: string;
};

export enum WebTaskNames {
	INIT = "init",
	METADATA = "metadata",
	THUMBNAIL = "thumbnail",
	MAIN_COLOR = "main-color",
	TITLE = "title",
	CONTENT = "content",
	SUMMARY = "summary",
	KEYWORDS = "keywords",
	KEYPOINTS = "key-points",
	TTS = "tts",
}

export type WebTaskState = {
	[WebTaskNames.INIT]: WebInitContext;
	[WebTaskNames.METADATA]: Record<string, string>;
	[WebTaskNames.THUMBNAIL]: WebThumbnailContext;
	[WebTaskNames.TITLE]: string;
	[WebTaskNames.CONTENT]: string;
	[WebTaskNames.SUMMARY]: string;
	[WebTaskNames.KEYWORDS]: string;
	[WebTaskNames.KEYPOINTS]: string;
	[WebTaskNames.TTS]: TTSResult | null;
};

export type WebTaskId = keyof WebTaskState & string;

export type WebTaskFactoryContext = {
	url: string;
	language: TTSLanguage;
	freshRun: boolean;
};

export type WebTaskFactory = (
	context: WebTaskFactoryContext
) => Task<WebTaskState>;

export type WebTaskRegistrySubset<TIds extends WebTaskId> = Pick<
	Record<WebTaskId, WebTaskFactory>,
	TIds
>;

export const defaultCompletionOptions = {
	model: "llama-server",
	temperature: 0.7,
	top_p: 0.8,
	top_k: 20,
	min_p: 0.0,
	presence_penalty: 1.5,
	repetition_penalty: 1.0,
	stream: true,
} as const;

export function getContentFromState(
	runtime: Pick<TaskRuntime<WebTaskState>, "state">
): string {
	return String(runtime.state[WebTaskNames.CONTENT] || "");
}

export function getRequiredTaskState<TId extends WebTaskId>(
	state: Readonly<TaskGlobalState<WebTaskState>>,
	taskId: TId,
	errorMessage = `Missing task state for "${taskId}"`
): WebTaskState[TId] {
	const value = state[taskId];
	if (value === undefined) {
		throw new Error(errorMessage);
	}

	return value;
}
