<script lang="ts">
	import Keywords from '@/components/Keywords.svelte';
	import PillWithEmbeddings from '@/components/PillWithEmbeddings.component.svelte';
	import { searchSimilarByTexts } from '@/lib/utils/embeddingTasks';
	import type { SearchChunkResult } from '@/lib/utils/embeddingStore';
	import { viewState } from '@/stores/viewStore.svelte';

	type Props = {
		/** Query texts to search for (topics, keywords, …). */
		texts: string[];
		/** Embedding table to search, typically the owning task's id. */
		table: string;
		/** Hides the search (and shows the plain text list) while true. */
		disabled?: boolean;
		/** Maximum article pills rendered per text. */
		limit?: number;
		maxDistance?: number;
		excludeArticleUrl?: string | null;
	};

	let {
		texts = [],
		table,
		disabled = false,
		limit = 3,
		maxDistance = 0.4,
		excludeArticleUrl = viewState.url
	}: Props = $props();

	// Search is decoupled from indexing flags: the table is shared across
	// articles, so these texts can be searched against other articles' indexed
	// texts regardless of whether this task indexed anything itself.
	const enabled = $derived(!disabled && viewState.embeddingsServiceUp && texts.length > 0);

	let results = $state<Map<string, SearchChunkResult[]> | null>(null);

	// One batched inference call for all texts, re-run when the texts change
	// (e.g. after a task re-run).
	$effect(() => {
		let cancelled = false;
		results = null;
		if (!enabled) return;
		const query = texts;
		void searchSimilarByTexts(query, {
			table,
			excludeArticleUrl: excludeArticleUrl ?? undefined,
			limit,
			maxDistance
		}).then((found) => {
			if (cancelled) return;
			results = found;
		});
		return () => {
			cancelled = true;
		};
	});
</script>

{#if enabled}
	<div class="similar-by-texts">
		{#each texts as text (text)}
			<PillWithEmbeddings text={text} results={results?.get(text)} />
		{/each}
	</div>
{:else}
	<Keywords keywords={texts} />
{/if}

<style>
	.similar-by-texts {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.4rem;
		min-width: 0;
		max-width: 100%;
	}
</style>
