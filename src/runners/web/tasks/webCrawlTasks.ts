import {
	getRequiredTaskState,
	WebTaskNames,
	type WebTaskRegistrySubset,
} from "./webTasks.shared";

type CrawlTaskIds = WebTaskNames.CONTENT;

export const crawlTaskRegistry: WebTaskRegistrySubset<CrawlTaskIds> = {
	[WebTaskNames.CONTENT]: () => ({
		id: WebTaskNames.CONTENT,
		name: "Get content",
		dependencies: [WebTaskNames.INIT],
		type: "script",
		persist: true,
		run: ({ state }) => {
			const init = getRequiredTaskState(state, WebTaskNames.INIT);
			return init.extraction.content;
		},
	}),
};
