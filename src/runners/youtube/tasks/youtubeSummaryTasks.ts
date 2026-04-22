import { viewState } from "@/stores/viewStore.svelte";
import {
	defaultCompletionOptions,
	getContentFromState,
	TaskNames,
	type YouTubeTaskRegistrySubset,
} from "./youtubeTasks.shared";

type SummaryTaskIds =
	| TaskNames.SUMMARY
	| TaskNames.TITLE_SUMMARY
	| TaskNames.KEYWORDS
	| TaskNames.KEYPOINTS;

export const summaryTaskRegistry: YouTubeTaskRegistrySubset<SummaryTaskIds> = {
	[TaskNames.SUMMARY]: ({ language, freshRun }) => ({
		id: TaskNames.SUMMARY,
		name: "Summary",
		dependencies: [TaskNames.CONTENT],
		component: "taskBase",
		componentProps: {
			autoplayTTS: freshRun,
		},
		type: "ia",
		systemMessage: `You are a professional summarizer. Your task is to extract the main ideas from the provided text. Limit to 60 words maximum. Maintain a formal tone. CRITICAL answer in ${language === "es" ? "Spanish" : "English"}.`,
		run: getContentFromState,
		userMessage:
			"Summarize the context clearly in a single paragraph with a short conclusion.",
		completionOptions: defaultCompletionOptions,
	}),

	[TaskNames.TITLE_SUMMARY]: ({ language }) => ({
		id: TaskNames.TITLE_SUMMARY,
		name: "Title Summary",
		dependencies: [TaskNames.CONTENT],
		component: "taskBase",
		type: "ia",
		systemMessage: `Generate a short, catchy, and relevant summary for this YouTube video. Limit to 20 words maximum. Avoid words like summary, video, etc. CRITICAL answer in ${language === "es" ? "Spanish" : "English"}.`,
		run: getContentFromState,
		userMessage: `Generate a short summary for this video. Answer in ${language === "es" ? "Spanish" : "English"}.`,
		completionOptions: defaultCompletionOptions,
	}),

	[TaskNames.KEYWORDS]: () => ({
		id: TaskNames.KEYWORDS,
		dependencies: [TaskNames.CONTENT],
		component: "keywords",
		type: "ia",
		systemMessage: "Return only valid JSON that matches the provided schema.",
		run: ({ state }) => {
			const content = state[TaskNames.CONTENT];

			if (typeof content !== "string") {
				throw new Error("Content is missing or invalid");
			}

			return content;
		},
		userMessage: "extract 5 keywords. add representative emoji at start.",
		completionOptions: {
			...defaultCompletionOptions,
			temperature: 1.0,
			top_p: 0.95,
			top_k: 20,
			min_p: 0.0,
			presence_penalty: 1.5,
			repeat_penalty: 1.0,
			response_format: {
				type: "json_schema",
				json_schema: {
					name: "keywords",
					strict: true,
					schema: {
						type: "object",
						properties: {
							keywords: {
								type: "array",
								items: { type: "string" },
								minItems: 5,
								maxItems: 5,
							},
						},
						required: ["keywords"],
						additionalProperties: false,
					},
				},
			},
		},
	}),

	[TaskNames.KEYPOINTS]: () => ({
		id: TaskNames.KEYPOINTS,
		name: "Key points",
		dependencies: [TaskNames.CONTENT],
		component: "listItems",
		type: "ia",
		systemMessage: `Return only valid JSON that matches the provided schema. Response in language: ${viewState.language === "es" ? "Spanish" : "English"}.`,
		run: ({ state }) => {
			const content = state[TaskNames.CONTENT];

			if (typeof content !== "string") {
				throw new Error("Content is missing or invalid");
			}

			return content;
		},
		userMessage:
			"extract 5 key points titles in one line. add representative emoji at start.",
		completionOptions: {
			...defaultCompletionOptions,
			temperature: 1.0,
			top_p: 0.95,
			top_k: 20,
			min_p: 0.0,
			presence_penalty: 1.5,
			repeat_penalty: 1.0,
			response_format: {
				type: "json_schema",
				json_schema: {
					name: "keypointsTitles",
					strict: true,
					schema: {
						type: "object",
						properties: {
							keypointsTitles: {
								type: "array",
								items: { type: "string" },
								minItems: 5,
								maxItems: 5,
							},
						},
						required: ["keypointsTitles"],
						additionalProperties: false,
					},
				},
			},
		},
	}),
};
