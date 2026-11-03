/**
 * Retrieval scope of the chat panel.
 *
 * The chat lives in the root layout, so it has no page props to tell it what is
 * on screen. Instead it derives a scope from the current route: reading an
 * article narrows retrieval to that article, a profile page to that profile,
 * and a category page to that category. Everywhere else the whole library is
 * searched.
 */
import { normalizeYouTubeUrl } from '@/lib/utils/youtube/helpers';

export type ChatScopeKind = 'article' | 'profile' | 'category' | 'library';

export interface ChatScope {
	kind: ChatScopeKind;
	/** Hard filter: only chunks of this article. */
	articleUrl?: string;
	/** Hard filter: only chunks of this profile (channel/domain id). */
	profileId?: string;
	/** Hard filter: only chunks whose category list contains this id. */
	category?: string;
	/** Short label for the chat header; `null` when the scope is the library. */
	label: string | null;
}

const LIBRARY_SCOPE: ChatScope = { kind: 'library', label: null };

/**
 * Maps a SvelteKit route id plus its params to a retrieval scope.
 *
 * `/youtube/[url]` carries every web article, not only YouTube videos, and the
 * pasted url may still be a `youtu.be` short link while the store keeps the
 * canonical `www.youtube.com/watch?v=…` form: normalize before filtering.
 * Params arrive already decoded from SvelteKit, so they are used as-is.
 */
export function resolveChatScope(
	routeId: string | null,
	params: Record<string, string | undefined>
): ChatScope {
	switch (routeId) {
		case '/youtube/[url]': {
			const url = params.url?.trim();
			if (!url) return LIBRARY_SCOPE;
			return { kind: 'article', articleUrl: normalizeYouTubeUrl(url), label: 'this article' };
		}
		case '/raw/[id]': {
			const id = params.id?.trim();
			if (!id) return LIBRARY_SCOPE;
			return { kind: 'article', articleUrl: id, label: 'this article' };
		}
		case '/profile/[profileId]': {
			const profileId = params.profileId?.trim();
			if (!profileId) return LIBRARY_SCOPE;
			return { kind: 'profile', profileId, label: 'this profile' };
		}
		case '/category/[categoryId]': {
			const category = params.categoryId?.trim();
			if (!category) return LIBRARY_SCOPE;
			return { kind: 'category', category, label: 'this category' };
		}
		default:
			return LIBRARY_SCOPE;
	}
}
