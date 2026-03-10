import type { ChapterCaption } from "@/lib/utils/youtube/joinCaptionsByChapters";
import { joinCaptionsByChapters } from "@/lib/utils/youtube/joinCaptionsByChapters";
import { taskRunner } from "@/runners/taskRunner.svelte";
import type { Task } from "@/types/taskRunner.types";
import type { TTSLanguage } from "$lib/utils/tts";
import {
	defaultCompletionOptions,
	getRequiredTaskState,
	TaskNames,
	type YouTubeTaskRegistrySubset,
} from "./youtubeTasks.shared";

function buildChapterSummaryTasks(
	chapterCaptions: ChapterCaption[],
	language: TTSLanguage
): Task[] {
	return chapterCaptions.map((chapter, index) => ({
		id: `chapter-summary-${index}`,
		name: chapter.title,
		widget: false,
		type: "ia",
		component: "base",
		dependencies:
			index === 0
				? [TaskNames.CHAPTERS_SUMMARY]
				: [`chapter-summary-${index - 1}`],
		systemMessage:
			language === "es"
				? "Eres un asistente que resume cap\u00edtulos de video."
				: "You are an assistant that summarizes video chapters.",
		run: () => `Title: ${chapter.title}\n\n${chapter.content}`,
		userMessage:
			language === "es"
				? "Resume este cap\u00edtulo en 2-3 l\u00edneas."
				: "Summarize this chapter in 2-3 lines.",
		completionOptions: defaultCompletionOptions,
	}));
}

type ChapterTaskIds = TaskNames.CHAPTERS_SUMMARY;

export const chapterTaskRegistry: YouTubeTaskRegistrySubset<ChapterTaskIds> = {
	[TaskNames.CHAPTERS_SUMMARY]: () => ({
		id: TaskNames.CHAPTERS_SUMMARY,
		name: "Process Chapters",
		dependencies: [
			TaskNames.INIT,
			TaskNames.CHAPTERS,
			TaskNames.TIMED_CAPTIONS,
		],
		type: "script",
		persist: true,
		run: async (state) => {
			const context = getRequiredTaskState(state, TaskNames.INIT);
			const chapters = getRequiredTaskState(state, TaskNames.CHAPTERS);
			const timedCaptions = getRequiredTaskState(
				state,
				TaskNames.TIMED_CAPTIONS
			);

			if (!chapters.length) {
				return { chapterCaptions: [] };
			}

			const chapterCaptions = joinCaptionsByChapters(timedCaptions, chapters);
			const chapterSummaryTasks = buildChapterSummaryTasks(
				chapterCaptions,
				context.language
			);

			taskRunner.enqueueTasks(chapterSummaryTasks);

			return { chapterCaptions };
		},
	}),
};
