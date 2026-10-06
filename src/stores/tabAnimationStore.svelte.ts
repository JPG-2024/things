import { untrack } from 'svelte';
import { PROFILE_ARTICLE_TABS } from './viewStore.svelte';
import {
	buildTransition,
	type AnimationPreset,
	type ItemTransition
} from '@/lib/utils/itemTransitions';

export type ProfileArticleTabId = 'articles' | 'categories' | 'domains' | 'profiles';

// After a tab switch, items that mount within this window inherit the switch
// direction. Later mounts (load-more, search swaps) fall back to the default.
const TAB_SWITCH_ANIM_WINDOW_MS = 500;

class TabAnimationState {
	activeTab = $state<ProfileArticleTabId>('articles');
	previousTab = $state<ProfileArticleTabId | null>(null);
	switchedAt = $state(0);
	presets = $state<Record<ProfileArticleTabId, AnimationPreset>>({
		articles: 'slide',
		categories: 'slide',
		domains: 'slide',
		profiles: 'slide'
	});

	/**
	 * Derived travel direction from the tab order: 1 = switched towards a tab on
	 * the right (items enter from the right), -1 = left. Defaults to entering
	 * from the left when there is no previous tab (first render).
	 */
	direction = $derived.by((): 1 | -1 => {
		const indexOf = (id: ProfileArticleTabId) =>
			PROFILE_ARTICLE_TABS.findIndex((tab) => tab.id === id);
		const prev = this.previousTab;
		if (!prev || prev === this.activeTab) return -1;
		return indexOf(this.activeTab) > indexOf(prev) ? 1 : -1;
	});

	/** Single link point; called from ProfileArticleTabs on tab activation. */
	recordTabChange(next: ProfileArticleTabId) {
		if (next === this.activeTab) return;
		this.previousTab = this.activeTab;
		this.activeTab = next;
		this.switchedAt = Date.now();
	}

	/** True while a tab switch is recent enough to use its direction. */
	private get isFreshSwitch(): boolean {
		return Date.now() - this.switchedAt < TAB_SWITCH_ANIM_WINDOW_MS;
	}

	/**
	 * Svelte transition factory. Store reads happen only at trigger time
	 * (element mount/unmount) and are wrapped in `untrack` so they never create
	 * reactive dependencies in the element's creation effect.
	 */
	transitionFor(tab: ProfileArticleTabId): ItemTransition {
		return (node, options) =>
			untrack(() =>
				buildTransition(node, options ?? {}, {
					preset: this.presets[tab],
					dir: this.isFreshSwitch ? this.direction : -1
				})
			);
	}
}

export const tabAnimationStore = new TabAnimationState();
