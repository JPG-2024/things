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
		flex: 1;
		min-width: 0;
		padding-bottom: 1.2rem;
	}
</style>
