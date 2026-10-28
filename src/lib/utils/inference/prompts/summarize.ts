/**
 * Default texts of the window/final summariser. They seed the prompt store
 * (`@/stores/promptStore.svelte`) and are what a run falls back to whenever
 * the stored value for a key is empty.
 *
 * No language instruction lives here: `chatCompletions` appends
 * `Respond in <language>.` to the last user message for every provider.
 */
export const RECURSIVE_SUMMARY_SYSTEM_MESSAGE =
	"You are a professional content summarizer. Write a concise and clear summary, only summary. no titles. Use bold (**) to emphasize the most relevant keywords, don't abuse.";

export const RECURSIVE_SUMMARY_USER_MESSAGE =
	'Summarize this section concisely, only summary. no titles, no markdown except bold (**) for keywords';

export const RECURSIVE_SUMMARY_FINAL_USER_MESSAGE =
	"Combine these section summaries into a markdown summary. no title. use bold (**) to emphasize most relevant keywords, don't abuse.";
