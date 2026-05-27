import type { QueryClient } from '@tanstack/svelte-query';
import { getProfilesWithArticlesAfter, getArticlesByProfile } from '@/stores/tasksStore';

export async function prefetchHomeData(queryClient: QueryClient) {
	const profiles = await queryClient.ensureQueryData({
		queryKey: ['profiles'],
		queryFn: () => getProfilesWithArticlesAfter(Date.now() - 5 * 24 * 60 * 60 * 1000)
	});
	const thirtyDaysAgo = Date.now() - 1000 * 60 * 60 * 24 * 30;
	await Promise.all(
		profiles.map((p) =>
			queryClient.ensureQueryData({
				queryKey: ['articles', p.id],
				queryFn: () => getArticlesByProfile(p.id, { limit: 20, createdAtFrom: thirtyDaysAgo })
			})
		)
	);
}
