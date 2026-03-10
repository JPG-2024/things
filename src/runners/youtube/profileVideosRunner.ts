import { invoke } from "@tauri-apps/api/core";
import { taskRunner } from "@/runners/taskRunner.svelte";
import type { Task } from "@/types/taskRunner.types";

type YouTubeVideo = {
	url: string;
};

//#region Task Names
enum TaskNames {
	GET_PROFILE = "Getting profile info & videos",
	GET_PROFILE_VIDEOS_INFO = "Getting profile videos info",
}

type YouTubeTaskState = {
	[TaskNames.GET_PROFILE]: YouTubeVideo[];
};

function extractProfileTasks(url: string): Task[] {
	return [
		{
			id: TaskNames.GET_PROFILE,
			dependencies: [],
			type: "script",
			name: "Getting profile videos",
			run: async () => {
				const profileInfo = await invoke("get_page_elements", {
					url,
					selectors: [
						{ name: "channelName", selector: "h1 > span" },
						{
							name: "channelPicSrc",
							selector: "yt-avatar-shape img",
							attribute: "src",
						},
						{
							name: "videoId",
							selector: "a#video-title-link",
							attribute: "href",
						},
					],
					attempts: 5,
					interval_ms: 2000,
				});

				return profileInfo;
			},
		},
	];
}

export async function extractProfileRunner(url: string): Promise<Task[]> {
	try {
		const tasks = extractProfileTasks(url);
		taskRunner.setTasks(tasks);
		const runResult = await taskRunner.run();

		console.log("All tasks completed:", runResult);

		console.log("Tasks saved to store and database.");

		return runResult.tasks;
	} catch (invokeErr) {
		throw new Error(`Error: ${invokeErr}`);
	}
}
