<script lang="ts">
	import { onMount, onDestroy } from 'svelte';

	interface Props {
		onLoadMore: () => void | Promise<void>;
		disabled?: boolean;
		rootMargin?: string;
	}

	let { onLoadMore, disabled = false, rootMargin = '200px' }: Props = $props();

	let sentinel: HTMLDivElement | undefined = $state();
	let observer: IntersectionObserver | undefined;

	async function requestLoadMore() {
		if (disabled) return;
		try {
			await onLoadMore();
		} catch (error) {
			// Rejections inside the observer callback would otherwise be
			// unhandled. State mutated by the callee decides whether the sentinel
			// retries via its own re-observe cycle.
			console.error('Load more failed:', error);
		}
	}

	onMount(() => {
		if (!sentinel) return;

		observer = new IntersectionObserver(
			(entries) => {
				const entry = entries[0];
				if (entry?.isIntersecting && !disabled) {
					void requestLoadMore();
				}
			},
			{ rootMargin }
		);

		observer.observe(sentinel);
	});

	$effect(() => {
		if (!sentinel || !observer || disabled) return;
		observer.unobserve(sentinel);
		observer.observe(sentinel);
	});

	onDestroy(() => {
		observer?.disconnect();
	});
</script>

<div bind:this={sentinel} class="load-more-sentinel">
	{#if disabled}
		<!-- <div class="loading-indicator"></div> -->
	{/if}
</div>

<style>
	.load-more-sentinel {
		width: 100%;
		min-height: 40px;
		display: flex;
		justify-content: center;
		align-items: center;
	}

	.loading-indicator {
		width: 20px;
		height: 20px;
		border: 2px solid rgba(255, 255, 255, 0.2);
		border-top-color: var(--primary-color);
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
</style>
