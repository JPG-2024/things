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
	}
</style>
