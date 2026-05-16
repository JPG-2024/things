import type { ChapterCaption } from '@/lib/utils/youtube/joinCaptionsByChapters';
import { joinCaptionsByChapters } from '@/lib/utils/youtube/joinCaptionsByChapters';
import type { Task } from '@/types/taskRunner.types';
import type { TTSLanguage } from '$lib/utils/tts';
import {
	type YouTubeTaskState,
	defaultCompletionOptions,
	getRequiredTaskState,
	TaskNames,
	type YouTubeTaskRegistrySubset
} from './youtubeTasks.shared';

function buildChapterSummaryTasks(
	chapterCaptions: ChapterCaption[],
	language: TTSLanguage
): Task<YouTubeTaskState>[] {
	return chapterCaptions.map((chapter, index) => ({
		id: `chapter-summary-${index}`,
		name: chapter.title,
		widget: false,
		type: 'ia',
		component: 'taskBase',
		dependencies: index === 0 ? [TaskNames.CHAPTERS_SUMMARY] : [`chapter-summary-${index - 1}`],
		systemMessage: `You are a helpful assistant that summarizes YouTube video chapters. Answer in ${language === 'es' ? 'Spanish' : 'English'}.`,
		run: () => `Title: ${chapter.title}\n\n${chapter.content}`,
		userMessage:
			'Summarize this chapter in 2 lines. add a relevant emoji at the beginning of the summary.',
		completionOptions: defaultCompletionOptions
	}));
}

type ChapterTaskIds = TaskNames.CHAPTERS_SUMMARY;

export const chapterTaskRegistry: YouTubeTaskRegistrySubset<ChapterTaskIds> = {
	[TaskNames.CHAPTERS_SUMMARY]: () => ({
		id: TaskNames.CHAPTERS_SUMMARY,
		dependencies: [TaskNames.INIT, TaskNames.CHAPTERS, TaskNames.TIMED_CAPTIONS],
		type: 'script',
		persist: false,
		run: async ({ state, enqueueTasks }) => {
			const context = getRequiredTaskState(state, TaskNames.INIT);
			const chapters = getRequiredTaskState(state, TaskNames.CHAPTERS);
			const timedCaptions = getRequiredTaskState(state, TaskNames.TIMED_CAPTIONS);

			if (!chapters.length) {
				return { chapterCaptions: [] };
			}

			const chapterCaptions = joinCaptionsByChapters(timedCaptions, chapters);
			const chapterSummaryTasks = buildChapterSummaryTasks(chapterCaptions, context.language);

			enqueueTasks(chapterSummaryTasks);

			return { chapterCaptions };
		}
	})
};
