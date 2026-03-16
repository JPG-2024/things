import { invoke } from "@tauri-apps/api/core";
import { currentDuration } from "@/stores/ttsStore";
import {
	TaskNames,
	type YouTubeTaskRegistrySubset,
} from "./youtubeTasks.shared";
import { synthesizeSpeech } from "$lib/utils/tts";

type AudioTaskIds = TaskNames.TTS;

export const audioTaskRegistry: YouTubeTaskRegistrySubset<AudioTaskIds> = {
	[TaskNames.TTS]: ({ language }) => ({
		id: TaskNames.TTS,
		name: "Generate TTS",
		dependencies: [TaskNames.SUMMARY],
		type: "script",
		persist: true,
		run: async ({ state }) => {
			const summary = String(state[TaskNames.SUMMARY] || "");
			if (!summary.trim()) {
				return null;
			}

			const result = await synthesizeSpeech(
				summary,
				language,
				"/run/media/jhon/2ae745c3-9664-4fcc-a90a-586e6d5487a4/proyects/supertonic/assets/voice_styles/M1.json",
				{
					speed: 1.3,
					onnx_dir:
						"/run/media/jhon/2ae745c3-9664-4fcc-a90a-586e6d5487a4/proyects/supertonic/assets/onnx/",
					total_step: 6,
				}
			);

			currentDuration.set(result.duration);
			invoke("play_tts_file", { filePath: result.file_path }).catch((err) => {
				console.error("Error playing TTS:", err);
			});

			return result;
		},
	}),
};
