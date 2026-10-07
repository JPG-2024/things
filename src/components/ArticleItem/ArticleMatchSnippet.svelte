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
		font-size: 0.93rem;
		opacity: 0.95;
		padding: 0.25rem 0;
		font-style: italic;
		line-height: 1.4;
	}

	.article-match-snippet mark {
		background: color-mix(in srgb, var(--bg-color) 40%, transparent);
		color: inherit;
		border-radius: 2px;
		padding: 5px 0;
	}

	.snippet-context {
		opacity: 0.6;
	}
</style>
