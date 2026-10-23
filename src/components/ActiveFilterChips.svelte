<script lang="ts">
	import Icon from '@/components/Icon.svelte';
	import { articleFilters, type ArticleFilterKind } from '@/stores/viewStore.svelte';

	const KIND_ICONS: Record<ArticleFilterKind, string> = {
		profiles: 'Users',
		domains: 'Globe',
		categories: 'Tags'
	};

	const KIND_LABELS: Record<ArticleFilterKind, string> = {
		profiles: 'profile',
		domains: 'domain',
		categories: 'category'
	};
</script>

<div class="active-filter-chips">
	{#each ['profiles', 'domains', 'categories'] as const as kind (kind)}
		{#each articleFilters.entries(kind) as entry (entry.id)}
			<button
				type="button"
				class="filter-chip"
				onclick={() => articleFilters.toggle(kind, entry.id, entry.name)}
				aria-label={`Remove ${KIND_LABELS[kind]} filter ${entry.name}`}
			>
				<Icon name={KIND_ICONS[kind]} size={13} />
				<span class="chip-name">{entry.name}</span>
				<Icon name="X" size={12} />
			</button>
		{/each}
	{/each}
</div>

<style>
	.active-filter-chips {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		width: 100%;
	}

	.filter-chip {
		all: unset;
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		cursor: pointer;
		font-family: var(--font-secondary);
		border-radius: 999px;
		padding: 3px 12px;
		color: white;
		font-size: 0.75rem;
		transition:
			opacity 0.15s,
			border-color 0.15s;
	}

	.filter-chip:hover {
		border-color: var(--primary-color);
	}

	.chip-name {
		text-transform: capitalize;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 200px;
	}

	.clear-chip {
		all: unset;
		cursor: pointer;
		opacity: 0.5;
		color: var(--gray-100);
		font-size: 0.72rem;
		text-decoration: underline;
		transition: opacity 0.15s;
	}

	.clear-chip:hover {
		opacity: 1;
	}
</style>
