<script lang="ts">
	import Icon from './Icon.svelte';

	let { reasoning, streaming = false }: { reasoning: string; streaming?: boolean } = $props();

	let open = $state(false);
	let wasStreaming = false;
	// Expand while the thinking stream runs and collapse once the answer starts;
	// the user can still toggle it freely afterwards.
	$effect(() => {
		if (streaming !== wasStreaming) {
			wasStreaming = streaming;
			open = streaming;
		}
	});

	let bodyEl = $state<HTMLDivElement | null>(null);
	$effect(() => {
		if (!streaming) return;
		if (reasoning.length === 0) return;
		if (bodyEl) bodyEl.scrollTop = bodyEl.scrollHeight;
	});
</script>

<div class="reasoning">
	<button
		type="button"
		class="reasoning__toggle"
		onclick={() => (open = !open)}
		aria-expanded={open}
		aria-label="Toggle reasoning"
	>
		<Icon name="Lightbulb" size={18} color="var(--primary-color)" />
		<span class="reasoning__label">{streaming ? 'Thinking…' : 'Reasoning'}</span>
	</button>
	{#if open}
		<div class="reasoning__body" bind:this={bodyEl}>{reasoning}</div>
	{/if}
</div>

<style>
	.reasoning {
		margin-bottom: 2rem;
		border-left: 2px solid rgba(255, 255, 255, 0.12);
	}

	.reasoning__toggle {
		all: unset;
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		cursor: pointer;
		padding: 0.5rem;
	}

	.reasoning__toggle:hover .reasoning__label {
		color: rgba(255, 255, 255, 0.75);
	}

	.reasoning__label {
		font-size: 0.72rem;
		color: var(--bg-color);
		padding-top: 2px;
	}

	.reasoning__body {
		margin: 1rem;
		max-height: 12rem;
		overflow-y: auto;
		padding-right: 0.4rem;
		white-space: pre-wrap;
		word-wrap: break-word;
		font-size: 0.72rem;
		line-height: 1.55;
		color: rgba(255, 255, 255, 0.4);
	}
</style>
