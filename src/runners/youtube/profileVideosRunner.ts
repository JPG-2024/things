import { invoke } from "@tauri-apps/api/core";
import { taskRunner } from "@/stores/taskRunner.svelte";
import type { Task } from "@/types/taskRunner.types";


type YouTubeVideo = {
    url: string;
};

//#region Task Names
enum TaskNames {
	GET_PROFILE_VIDEOS = "Getting profile videos",
    GET_PROFILE_VIDEOS_INFO = "Getting profile videos info",
}

type YouTubeTaskState = {
    [TaskNames.GET_PROFILE_VIDEOS]: YouTubeVideo[];
};

function extractProfileTasks( url: string): Task[] {
    return [
        {
            id: TaskNames.GET_PROFILE_VIDEOS,
            dependencies: [],
            type: "script",
            name: "Getting profile videos",
            run: async () => {
                const response = await invoke(
                    "get_video_info",
                    {
                        url,
                        selectors: [
                            { name: "videoId", selector: "a#video-title-link", attribute: "href"  },
                        ],
                        intervalTime: 5,
                        maxAttempts: 200,
                    },
                );

                

                return response
            }
        },
    ]
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