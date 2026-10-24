<script lang="ts">
	import PostView from '@/components/PostView.svelte';
	import ArticleLayout from '@/components/ArticleLayout.svelte';
</script>

<PostView headerContent={null} {contentSnippet} />

{#snippet contentSnippet()}
	<ArticleLayout />
{/snippet}

<style>
	@media (prefers-colorscheme: dark) {
		:root {
			background-color: #2f2f2f;
			color: #f6f6f6;
		}
	}
</style>
