<script lang="ts">
	import { onMount } from 'svelte';
	import { fly } from 'svelte/transition';
	import EntityBar from '@/components/EntityBar.svelte';
	import type { EntityBarItem } from '@/components/EntityBar.svelte';
	import {
		viewState,
		articleFilters,
		type ArticleFilterEntry,
		type ArticleFilterKind
	} from '@/stores/viewStore.svelte';
	import { getProfiles, type ArticleProfile } from '@/stores/webStore';

	interface FilterSection {
		kind: ArticleFilterKind;
		label: string;
		items: EntityBarItem[];
		/** Text-only rows (categories) use vertical dividers between items. */
		separators?: boolean;
	}

	let profiles = $state<ArticleProfile[]>([]);
	let domains = $state<ArticleProfile[]>([]);
	/** Sections render (and fly in) only once both lists arrive. The open flow
	 * pre-warms the kind-only getProfiles cache, so this flip is instant on
	 * reopens and only waits on the very first one. */
	let loading = $state(true);

	// Full lists (no paging): getProfiles without offset/limit returns every
	// entity of the requested kind; categories come from the page-level state.
	// Runs on each open: the panel only mounts while visible.
	onMount(async () => {
		try {
			const [profileItems, domainItems] = await Promise.all([
				getProfiles({ kind: 'profile' }),
				getProfiles({ kind: 'domain' })
			]);
			profiles = profileItems;
			domains = domainItems;
		} finally {
			loading = false;
		}
	});

	/**
	 * Entries a facet section should render. Selected entries always stay visible
	 * so they can be deselected; a typed term adds the entities that match it.
	 * With an empty term, profile/domain sections collapse to just the selection,
	 * which keeps the panel from dumping the full entity lists. Categories opt
	 * into `showAllWhenEmpty` so they remain the browseable facet.
	 */
	function sectionItems(
		entities: EntityBarItem[],
		kind: ArticleFilterKind,
		query: string,
		showAllWhenEmpty: boolean
	): EntityBarItem[] {
		const active: ArticleFilterEntry[] = articleFilters.entries(kind);
		const activeIds = new Set(active.map((entry) => entry.id));
		const items = entities.filter(
			(item) =>
				activeIds.has(item.id) ||
				(query ? item.name.toLowerCase().includes(query) : showAllWhenEmpty)
		);
		// Selected entities missing from the fetched list (stale cache) still
		// render so the selection is never invisible.
		const visibleIds = new Set(items.map((item) => item.id));
		for (const entry of active) {
			if (!visibleIds.has(entry.id)) {
				items.push({ id: entry.id, name: entry.name, profilePictureSrc: null });
			}
		}
		return items;
	}

	// Narrowed by the search draft: typing filters the panel lists in live,
	// while the applied filter (committed on Enter) drives the rest of the page.
	const sections = $derived.by<FilterSection[]>(() => {
		const query = viewState.unifiedFilterDraft.trim().toLowerCase();
		return [
			{
				kind: 'categories',
				label: 'Categories',
				separators: true,
				// Categories have no picture: EntityBar falls back to EmojiString.
				items: sectionItems(
					viewState.categories.map((category) => ({
						id: category.id,
						name: category.name,
						profilePictureSrc: null
					})),
					'categories',
					query,
					true
				)
			},
			{
				kind: 'profiles',
				label: 'Profiles',
				items: sectionItems(
					profiles.map((profile) => ({
						id: profile.id,
						name: profile.name,
						profilePictureSrc: profile.profilePictureSrc ?? null
					})),
					'profiles',
					query,
					false
				)
			},
			{
				kind: 'domains',
				label: 'Domains',
				items: sectionItems(
					domains.map((domain) => ({
						id: domain.id,
						name: domain.name,
						profilePictureSrc: domain.profilePictureSrc ?? null
					})),
					'domains',
					query,
					false
				)
			}
		];
	});
</script>

{#if !loading}
	<div class="filter-sections" in:fly={{ y: 8, duration: 200 }}>
		{#each sections as section (section.kind)}
			{#if section.items.length > 0}
				<div class="filter-section">
					<div class="section-title">{section.label}</div>
					<div class="entity-bar-container">
						<EntityBar
							items={section.items}
							activeIds={articleFilters.ids(section.kind)}
							separators={section.separators ?? false}
							onSelect={(item) => articleFilters.toggle(section.kind, item.id, item.name)}
						/>
					</div>
				</div>
			{/if}
		{/each}
	</div>
{/if}

<style>
	/* The strip is short and wide: sections sit side by side and the row
	   scrolls horizontally when its columns exceed the viewport. */
	.filter-sections {
		display: flex;
		align-items: flex-start;
		gap: 2rem;
		min-height: 0;
		padding: 0.25rem 0;
		overflow-x: auto;
		overflow-y: hidden;
	}

	.filter-section {
		display: flex;
		flex-direction: column;
		flex: 0 0 auto;
	}

	/* One line per section; the strip scrolls instead of wrapping items into
	   rows that would not fit in the strip height. */
	.filter-section :global(.entity-bar) {
		width: max-content;
		flex-wrap: nowrap;
		justify-content: flex-start;
	}

	.entity-bar-container {
		padding: 0.25rem 0;
	}

	.section-title {
		font-size: 0.7rem;
		font-weight: 600;
		font-family: var(--font-secondary);
		letter-spacing: 0.05em;
		color: var(--primary-color);
		padding: 0.25rem 0;
	}
</style>
