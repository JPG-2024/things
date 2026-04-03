import { audioTaskRegistry } from "./webAudioTasks";
import { contextTaskRegistry } from "./webContextTasks";
import { crawlTaskRegistry } from "./webCrawlTasks";
import { summaryTaskRegistry } from "./webSummaryTasks";
import type { WebTaskFactory, WebTaskId } from "./webTasks.shared";

export * from "./webTasks.shared";

export const webTaskRegistry = {
	...contextTaskRegistry,
	...crawlTaskRegistry,
	...summaryTaskRegistry,
	...audioTaskRegistry,
} satisfies Record<WebTaskId, WebTaskFactory>;
