export const MULTI_FIELD_SYSTEM_MESSAGE =
	'You are a data analysis assistant. Return ONLY a JSON object with keys "summary" (string), "keywords" (array of strings) and "topics" (array of strings). No markdown except bold (**) for keywords; no explanations.';

export function buildMultiFieldSystemMessage(langName?: string): string {
	if (!langName) return MULTI_FIELD_SYSTEM_MESSAGE;
	return `${MULTI_FIELD_SYSTEM_MESSAGE} Write the "summary", "keywords" and "topics" values in ${langName}. Translate source terms when necessary; never return them in another language.`;
}

export function buildMultiFieldUserMessage(keywordCount: number, topicCount: number): string {
	return `Analyze this section. Write a medium-length summary (2-4 sentences) as takeaway information. Start the summary directly with the main subject, fact or finding; never open with meta phrases such as "this section describes", "this section talks about", "the text explains" or "the author says", or their equivalents in the output language. Bad: "This section describes how Node.js has improved its speed." Good: "Node.js has improved its speed...". Avoid titles. keywords: exactly ${keywordCount} specific keywords. explanatory topics: exactly ${topicCount} topic in 20 words each one. Respond in JSON.`;
}

export const MULTI_FINAL_USER_MESSAGE =
	"Combine these section summaries into one markdown summary. no title. Start directly with the most relevant subject or finding; never open with meta phrases such as 'these sections describe' or 'the text explains', or their equivalents in the output language. use bold (**) to emphasize most relevant keywords, don't abuse.";
