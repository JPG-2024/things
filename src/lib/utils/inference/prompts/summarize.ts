export const SUMMARY_SYSTEM_MESSAGE =
	"You are a professional content summarizer. Write a concise and clear summary. Use bold (**) to emphasize the most relevant keywords, don't abuse.";

export const SUMMARY_USER_MESSAGE = 'Summarize the content.';

export const RECURSIVE_SUMMARY_SYSTEM_MESSAGE =
	"You are a professional content summarizer. Write a concise and clear summary, only summary. no titles. Use bold (**) to emphasize the most relevant keywords, don't abuse.";

export function buildRecursiveSummarySystemMessage(langName?: string): string {
	if (!langName) return RECURSIVE_SUMMARY_SYSTEM_MESSAGE;
	return `${RECURSIVE_SUMMARY_SYSTEM_MESSAGE} Write the summary in ${langName}.`;
}

export const RECURSIVE_SUMMARY_USER_MESSAGE =
	'Summarize this section concisely, only summary. no titles, no markdown except bold (**) for keywords';

export const RECURSIVE_SUMMARY_FINAL_USER_MESSAGE =
	"Combine these section summaries into a markdown summary. no title. use bold (**) to emphasize most relevant keywords, don't abuse.";
