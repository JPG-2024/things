/**
 * Default texts of the window/takeaways generator. They seed the prompt store
 * (`@/stores/promptStore.svelte`) and are what a run falls back to whenever
 * the stored value for a key is empty.
 *
 * No language instruction lives here: `chatCompletions` appends
 * `Respond in <language>.` to the last user message for every provider.
 */
export const TAKEAWAYS_SYSTEM_MESSAGE =
	'You extract the essential ideas of an article. Return only takeaways, never a title, introduction or conclusion.';

export const TAKEAWAYS_WINDOW_USER_MESSAGE =
	'Extract the key takeaways from this section of the article as a short markdown bullet list. Only the takeaways, no commentary.';

export const TAKEAWAYS_FINAL_USER_MESSAGE =
	'Produce exactly 5 distinct, non-redundant takeaways of the whole article from the following full article text or partial takeaways. Return only a markdown bullet list, with no heading, introduction or conclusion.';
