import { contextTaskRegistry } from './webContextTasks';
import { crawlTaskRegistry } from './webCrawlTasks';
import { summaryTaskRegistry } from './webSummaryTasks';
import type { WebTaskFactory, WebTaskId } from './webTasks.shared';

export * from './webTasks.shared';

export const webTaskRegistry = {
	...contextTaskRegistry,
	...crawlTaskRegistry,
	...summaryTaskRegistry
} satisfies Record<WebTaskId, WebTaskFactory>;
