<script lang="ts">
	import Modal from './Modal.svelte';
	import MarkdownRenderer from './MarkdownRenderer.svelte';
	import ToggleIcon from './ToggleIcon.svelte';

	interface Props {
		show?: boolean;
		content?: string | null;
		loading?: boolean;
		title?: string | null;
		onClose: () => void;
	}

	let { show = false, content = null, loading = false, title = null, onClose }: Props = $props();

	/** `true` shows the stored markdown source verbatim instead of rendering it. */
	let showRaw = $state(false);
</script>

<Modal {show} {onClose}>
	<div class="full-content-modal">
		<div class="full-content-header">
			{#if title}
				<h2 class="full-content-title">{title}</h2>
			{/if}
			{#if content}
				<ToggleIcon
					name="Code"
					bind:checked={showRaw}
					size={18}
					label={showRaw ? 'Raw' : 'Markdown'}
					tooltipProps={{ content: showRaw ? 'show rendered markdown' : 'show raw source' }}
				/>
			{/if}
		</div>
		{#if content}
			<div class="full-content-body">
				{#if showRaw}
					<pre class="full-content-raw">{content}</pre>
				{:else}
					<MarkdownRenderer {content} />
				{/if}
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
		padding: 3rem;
		overflow-y: auto;
		width: 100%;
	}

	.full-content-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1.5rem;
		margin: 0 0 1.5rem 0;
	}

	.full-content-title {
		font-family: var(--font-secondary);
		font-size: 1.5rem;
		font-weight: 600;
		margin: 0;
		color: var(--text-color);
	}

	.full-content-body {
		font-size: 1rem;
		line-height: 1.6;
		color: var(--text-color);
	}

	.full-content-raw {
		font-family: monospace;
		font-size: 0.875rem;
		line-height: 1.6;
		margin: 0;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
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
