<script lang="ts">
	import ProfileWidget from '@/components/ProfileWidget.svelte';
	import ToggleIcon from '@/components/ToggleIcon.svelte';
	import { viewState } from '@/stores/viewStore.svelte';
	import type { ArticleProfile } from '@/stores/webStore';
	import type { ItemTransition } from '@/lib/utils/itemTransitions';

	interface Props {
		items: ArticleProfile[];
		itemTransition: ItemTransition;
	}

	let { items, itemTransition }: Props = $props();

	// Mirror items after mount so the keyed {#each} sees them as added. Svelte
	// suppresses intro transitions for elements present during the initial
	// render, which is the case when re-entering a tab with cached data.
	// The suggested writable $derived would evaluate during the initial render and
	// defeat this.
	// eslint-disable-next-line svelte/prefer-writable-derived
	let renderedItems = $state<ArticleProfile[]>([]);

	$effect(() => {
		renderedItems = items;
	});
</script>

<div class="profile-list">
<!-- 	<div class="list-header">
		<span class="count">{items.length}</span>
		<ToggleIcon
			name={viewState.collapseProfiles ? 'ChevronsDownUp' : 'ChevronsUpDown'}
			bind:checked={viewState.collapseProfiles}
			size={15}
			tooltipProps={{ content: viewState.collapseProfiles ? 'Expand all' : 'Collapse all' }}
		/>
	</div> -->
	{#each renderedItems as profile (profile.id)}
		<div class="profile-row" in:itemTransition out:itemTransition>
			<ProfileWidget
				profileWithArticles={profile}
				showTitle={false}
				collapsed={viewState.collapseProfiles}
			/>
		</div>
	{/each}
</div>

<style>
	.profile-list {
		display: flex;
		flex-direction: column;
		align-items: center;
		width: 100%;
		gap: 2rem;
	}

	.list-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		width: 100%;
		max-width: 860px;
	}

	.count {
		font-size: 0.75rem;
		opacity: 0.4;
	}

	.profile-row {
		width: 100%;
		max-width: 860px;
		margin: 0 auto;
	}
</style>
