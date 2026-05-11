import {
	defaultCompletionOptions,
	getContentFromState,
	WebTaskNames,
	type WebTaskRegistrySubset,
} from "./webTasks.shared";

type SummaryTaskIds =
	| WebTaskNames.SUMMARY
	| WebTaskNames.KEYWORDS
	| WebTaskNames.KEYPOINTS;

export const summaryTaskRegistry: WebTaskRegistrySubset<SummaryTaskIds> = {
	[WebTaskNames.SUMMARY]: ({ language, freshRun }) => ({
		id: WebTaskNames.SUMMARY,
		dependencies: [WebTaskNames.CONTENT],
		component: "taskBase",
		componentProps: {
			autoplayTTS: freshRun,
		},
		type: "ia",
		systemMessage: `You are a professional article summarizer. Write a concise and clear summary . Keep the response under 80 words.`,
		run: getContentFromState,
		userMessage: `Summarize the article context in one paragraph. start with a short keywords summary. Answer in in ${language === "es" ? "Spanish" : "English"}`,
		completionOptions: defaultCompletionOptions,
	}),

	[WebTaskNames.KEYWORDS]: ({ language }) => ({
		id: WebTaskNames.KEYWORDS,
		dependencies: [WebTaskNames.CONTENT],
		type: "ia",
		component: "keywords",
		systemMessage: `Return only valid JSON that matches the provided schema. The keywords must be in ${language === "es" ? "Spanish" : "English"}.`,
		run: getContentFromState,
		userMessage: "Extract 5 representative keywords from the article.",
		completionOptions: {
			...defaultCompletionOptions,
			temperature: 0.9,
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

	[WebTaskNames.KEYPOINTS]: ({ language }) => ({
		id: WebTaskNames.KEYPOINTS,
		dependencies: [WebTaskNames.CONTENT],
		component: "listItems",
		type: "ia",
		systemMessage: `Return only valid JSON that matches the provided schema. Keep all key points in ${language === "es" ? "Spanish" : "English"}.`,
		run: getContentFromState,
		userMessage: "Extract 5 insights in one line each.",
		completionOptions: {
			...defaultCompletionOptions,
			temperature: 0.9,
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
