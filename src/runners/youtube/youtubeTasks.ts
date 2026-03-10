import { audioTaskRegistry } from "./youtubeAudioTasks";
import { chapterTaskRegistry } from "./youtubeChapterTasks";
import { contextTaskRegistry } from "./youtubeContextTasks";
import { crawlTaskRegistry } from "./youtubeCrawlTasks";
import { summaryTaskRegistry } from "./youtubeSummaryTasks";
import { profileTaskRegistry } from "./youTubeProfileTasks";
import type { YouTubeTaskFactory, YouTubeTaskId } from "./youtubeTasks.shared";

export * from "./youtubeTasks.shared";

export const youtubeTaskRegistry = {
	...contextTaskRegistry,
	...crawlTaskRegistry,
	...chapterTaskRegistry,
	...summaryTaskRegistry,
	...audioTaskRegistry,
	...profileTaskRegistry,
} satisfies Record<YouTubeTaskId, YouTubeTaskFactory>;
