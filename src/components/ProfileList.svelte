<script lang="ts">
	import ProfileWidget from '@/components/ProfileWidget.svelte';
	import ToggleIcon from '@/components/ToggleIcon.svelte';
	import { viewState } from '@/stores/viewStore.svelte';
	import type { ArticleProfile } from '@/stores/webStore';

	interface Props {
		items: ArticleProfile[];
	}

	let { items }: Props = $props();
</script>

<div class="profile-list">
	<div class="list-header">
		<span class="count">{items.length}</span>
		<ToggleIcon
			name={viewState.collapseProfiles ? 'ChevronsDownUp' : 'ChevronsUpDown'}
			bind:checked={viewState.collapseProfiles}
			size={15}
			tooltipProps={{ content: viewState.collapseProfiles ? 'Expand all' : 'Collapse all' }}
		/>
	</div>
	{#each items as profile (profile.id)}
		<div class="profile-row">
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
