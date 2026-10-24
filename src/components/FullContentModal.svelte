<script lang="ts">
	import Modal from './Modal.svelte';
	import MarkdownRenderer from './MarkdownRenderer.svelte';

	interface Props {
		show?: boolean;
		content?: string | null;
		loading?: boolean;
		title?: string | null;
		onClose: () => void;
	}

	let { show = false, content = null, loading = false, title = null, onClose }: Props = $props();
</script>

<Modal {show} {onClose}>
	<div class="full-content-modal">
		{#if title}
			<h2 class="full-content-title">{title}</h2>
		{/if}
		{#if content}
			<div class="full-content-body">
				<MarkdownRenderer {content} />
			</div>
		{:else if loading}
			<div class="full-content-empty">
				<p>Loading content...</p>
			</div>
		{:else}
			<div class="full-content-empty">
				<p>No content available for this article.</p>
			</div>
		{/if}
	</div>
</Modal>

<style>
	.full-content-modal {
		padding: 1rem;
		max-height: 85vh;
		overflow-y: auto;
		width: 100%;
	}

	.full-content-title {
		font-family: var(--font-secondary);
		font-size: 1.5rem;
		font-weight: 600;
		margin: 0 0 1.5rem 0;
		color: var(--text-color);
		padding-right: 2rem;
	}

	.full-content-body {
		font-size: 1rem;
		line-height: 1.6;
		color: var(--text-color);
	}

	.full-content-empty {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 200px;
		color: var(--text-color-muted, #999);
		font-style: italic;
	}
</style>
