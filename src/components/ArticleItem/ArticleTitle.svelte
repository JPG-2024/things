<script lang="ts">
	interface Props {
		title: string | null;
	}

	let { title }: Props = $props();
</script>

<div class="article-title">
	<span>{title}</span>
</div>

<style>
	.article-title {
		font-family: var(--font-secondary);
		text-align: left;
		font-size: 0.6rem;
		flex: 1;
		min-width: 0;
	}
</style>
