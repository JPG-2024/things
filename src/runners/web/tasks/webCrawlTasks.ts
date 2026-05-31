import { getRequiredTaskState, WebTaskNames, type WebTaskRegistrySubset } from './webTasks.shared';

type CrawlTaskIds = WebTaskNames.CONTENT;

export const crawlTaskRegistry: WebTaskRegistrySubset<CrawlTaskIds> = {
	[WebTaskNames.CONTENT]: () => ({
		id: WebTaskNames.CONTENT,
		dependencies: [WebTaskNames.INIT_WEB_CONTEXT],
		component: 'ask',
		type: 'script',
		persist: true,
		run: ({ state }) => {
			const init = getRequiredTaskState(state, WebTaskNames.INIT_WEB_CONTEXT);
			return init.extraction.content;
		}
	})
};
