<script lang="ts">
	import { fly } from 'svelte/transition';
	import { errorStore } from '@/stores/errorStore.svelte';
	import Icon from '@/components/Icon.svelte';

	/** Live error entries (`warn` ones do not light the badge up). */
	const errorCount = $derived(errorStore.errors.filter((entry) => entry.level === 'error').length);
	/** Keyed by the newest entry id so the pulse animation replays on it. */
	const lastErrorId = $derived(errorStore.errors[errorStore.errors.length - 1]?.id ?? 0);
</script>

{#if errorCount > 0}
	<button
		type="button"
		class="error-center"
		onclick={() => (errorStore.open = true)}
		aria-label="Open the error log ({errorCount} errors)"
		in:fly={{ x: -20, duration: 200 }}
	>
		<Icon name="TriangleAlert" size={20} color="#ff8a8a" />
		{#key lastErrorId}
			<span class="error-center__badge">{errorCount}</span>
		{/key}
	</button>
{/if}

<style>
	.error-center {
		position: fixed;
		left: 1.5rem;
		bottom: 1.3rem;
		/* Above the app, below the modal layer (the backdrop is 9999). */
		z-index: 9000;
		display: flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.5rem 0.7rem;
		border: 1px solid var(--article-border);
		border-radius: 999px;
		background: rgba(0, 0, 0, 0.92);
		cursor: pointer;
	}

	.error-center:hover {
		border-color: var(--gray-500);
	}

	.error-center__badge {
		font-family: var(--font-secondary);
		font-size: 0.7rem;
		color: #ff8a8a;
		animation: badge-pop 0.3s ease-out;
	}

	@keyframes badge-pop {
		from {
			transform: scale(1.6);
		}
		to {
			transform: scale(1);
		}
	}
</style>
