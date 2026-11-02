<script lang="ts">
	import ArticleFiltersPanel from '@/components/ArticleFiltersPanel.svelte';
</script>

<div class="filters-sidebar">
	<ArticleFiltersPanel />
</div>

<style>
	.filters-sidebar {
		width: 100%;
		box-sizing: border-box;
		padding: 0 0.5rem;
		border-radius: var(--radius-sm);
	}
</style>
