<script lang="ts">
	import { onMount } from 'svelte';
	import EntityBar from '@/components/EntityBar.svelte';
	import type { EntityBarItem } from '@/components/EntityBar.svelte';
	import { viewState, articleFilters, type ArticleFilterKind } from '@/stores/viewStore.svelte';
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

	// Full lists (no paging): getProfiles without offset/limit returns every
	// entity of the requested kind; categories come from the page-level state.
	// Runs on each open: the panel only mounts while visible.
	onMount(async () => {
		const [profileItems, domainItems] = await Promise.all([
			getProfiles({ kind: 'profile' }),
			getProfiles({ kind: 'domain' })
		]);
		profiles = profileItems;
		domains = domainItems;
	});

	// Narrowed by the search draft — the same term EntityBar applies — so
	// typing in the page search filters the panel lists in live, while the
	// applied filter (committed on Enter) drives the rest of the page.
	const sections = $derived.by<FilterSection[]>(() => {
		const query = viewState.unifiedFilterDraft.trim().toLowerCase();
		const matches = (name: string) => !query || name.toLowerCase().includes(query);
		return [
			{
				kind: 'categories',
				label: 'Categories',
				separators: true,
				// Categories have no picture: EntityBar falls back to EmojiString.
				items: viewState.categories
					.map((category) => ({
						id: category.id,
						name: category.name,
						profilePictureSrc: null
					}))
					.filter((item) => matches(item.name))
			},
			{
				kind: 'profiles',
				label: 'Profiles',
				items: profiles
					.map((profile) => ({
						id: profile.id,
						name: profile.name,
						profilePictureSrc: profile.profilePictureSrc ?? null
					}))
					.filter((item) => matches(item.name))
			},
			{
				kind: 'domains',
				label: 'Domains',
				items: domains
					.map((domain) => ({
						id: domain.id,
						name: domain.name,
						profilePictureSrc: domain.profilePictureSrc ?? null
					}))
					.filter((item) => matches(item.name))
			}
		];
	});
</script>

{#each sections as section (section.kind)}
	{#if section.items.length > 0}
		<div class="section-title">{section.label}</div>
		<div class="entity-bar-container">
			<EntityBar
				items={section.items}
				activeIds={articleFilters.ids(section.kind)}
				separators={section.separators ?? false}
				onSelect={(item) => articleFilters.toggle(section.kind, item.id, item.name)}
			/>
		</div>
	{/if}
{/each}

<style>
	.entity-bar-container {
		padding: 2rem;
	}

	.section-title {
		font-size: 0.7rem;
		font-weight: 600;
		font-family: var(--font-secondary);
		letter-spacing: 0.05em;
		opacity: 0.2;
		color: white;
		padding-top: 1rem;
	}

	.section-title:first-child {
		margin-top: 0;
	}
</style>
