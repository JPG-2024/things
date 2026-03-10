import {
	defaultCompletionOptions,
	getContentFromState,
	TaskNames,
	type YouTubeTaskRegistrySubset,
} from "./youtubeTasks.shared";

type SummaryTaskIds =
	| TaskNames.SUMMARY
	| TaskNames.TITLE_SUMMARY
	| TaskNames.KEY_POINTS;

export const summaryTaskRegistry: YouTubeTaskRegistrySubset<SummaryTaskIds> = {
	[TaskNames.SUMMARY]: ({ language }) => ({
		id: TaskNames.SUMMARY,
		name: "Summary",
		dependencies: [TaskNames.CONTENT],
		component: "base",
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
		component: "base",
		type: "ia",
		systemMessage: `Generate a short, catchy, and relevant summary for this YouTube video. Limit to 20 words maximum. Avoid words like summary, video, etc. CRITICAL answer in ${language === "es" ? "Spanish" : "English"}.`,
		run: getContentFromState,
		userMessage: `Generate a short summary for this video. Answer in ${language === "es" ? "Spanish" : "English"}.`,
		completionOptions: defaultCompletionOptions,
	}),

	[TaskNames.KEY_POINTS]: () => ({
		id: TaskNames.KEY_POINTS,
		name: "Key Points",
		dependencies: [TaskNames.CONTENT],
		component: "base",
		type: "ia",
		systemMessage: "Return only valid JSON that matches the provided schema.",
		run: getContentFromState,
		userMessage:
			"extract 5 keywords that represent the main topics of the video.",
		completionOptions: {
			...defaultCompletionOptions,
			response_format: {
				type: "json_schema",
				json_schema: {
					name: "summary_keywords",
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
};
