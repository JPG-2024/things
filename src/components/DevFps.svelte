<script lang="ts">
	import { onMount } from 'svelte';

	/**
	 * Development-only frame counter. It is the measuring instrument of the
	 * wheel scroll work: without a number, "the scroll looks choppy" cannot be
	 * compared before and after a change.
	 *
	 * Enable it with `?fps=1` in the URL. It renders nothing in production.
	 */
	let enabled = $state(false);
	let fps = $state(0);

	onMount(() => {
		if (!import.meta.env.DEV) return;
		enabled = new URLSearchParams(window.location.search).has('fps');
		if (!enabled) return;

		let frames = 0;
		let last = performance.now();
		let raf = 0;

		const loop = (now: number) => {
			frames += 1;
			if (now - last >= 1000) {
				fps = Math.round((frames * 1000) / (now - last));
				frames = 0;
				last = now;
			}
			raf = requestAnimationFrame(loop);
		};
		raf = requestAnimationFrame(loop);

		return () => cancelAnimationFrame(raf);
	});
</script>

{#if enabled}
	<div class="dev-fps" aria-hidden="true">{fps} fps</div>
{/if}

<style>
	.dev-fps {
		position: fixed;
		top: 0.5rem;
		left: 0.5rem;
		z-index: 99999;
		padding: 0.15rem 0.45rem;
		border-radius: var(--radius-sm);
		background: rgba(0, 0, 0, 0.85);
		color: var(--primary-color);
		font-family: var(--font-secondary);
		font-size: 0.7rem;
		font-weight: bold;
		pointer-events: none;
	}
</style>
