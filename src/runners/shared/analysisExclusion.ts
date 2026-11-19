/**
 * Automatic-analysis exclusion.
 *
 * A profile (channel or domain) tagged with one of the category ids configured
 * in Settings → Analysis → "Exclude auto analysis" is captured without running
 * the LLM pipeline. The decision is made by the runner before its analysis
 * step, so an explicit analysis rerun is still possible.
 */
import { errorStore } from '@/stores/errorStore.svelte';
import { viewState } from '@/stores/viewStore.svelte';
import { getProfileCategories } from '@/stores/webStore';
import { hasExcludedCategory } from '@/lib/utils/categoryIds';

/**
 * Reads the category ids linked to a profile and checks them against the
 * configured exclusion list.
 *
 * Best effort: a failed read falls back to "analyse", so a database hiccup
 * never silently drops an analysis.
 */
export async function isAutoAnalysisExcluded(
	profileId: string | null | undefined
): Promise<boolean> {
	const excluded = viewState.autoAnalysisExcludedCategoryIds;
	if (!profileId || excluded.length === 0) return false;

	try {
		const profileCategoryIds = await getProfileCategories(profileId);
		return hasExcludedCategory(profileCategoryIds, excluded);
	} catch (error) {
		errorStore.report(error, {
			feature: 'db',
			userMessage: 'Could not read the categories of a profile — the article will be analysed',
			context: { profileId },
			level: 'warn'
		});
		return false;
	}
}
