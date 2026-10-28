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
		line-height: 1.4;
		text-align: left;
		font-size: 0.7rem;
		flex: 1;
		min-width: 0;
		font-weight: bold;
	}
</style>
