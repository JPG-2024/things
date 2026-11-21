<script lang="ts">
	import type { RawSearchMatch } from '@/stores/viewStore.svelte';

	interface Props {
		match: RawSearchMatch;
	}

	let { match }: Props = $props();
</script>

<div class="article-match-snippet">
	<span class="snippet-context">{match.before}</span><mark>{match.matchText}</mark><span
		class="snippet-context">{match.after}</span
	>
</div>

<style>
	.article-match-snippet {
		font-family: var(--font-secondary);
		font-size: 0.8rem;
		padding: 0.25rem 0;
		line-height: 1.5rem;
		padding: 0 1rem;
		color: var(--gray-500);
	}

	.article-match-snippet mark {
		background: white;
		color: black;
		border-radius: 2px;
		padding: 0 10px;
	}
</style>
