<script lang="ts">
	import type { Snippet } from 'svelte';
	import { viewState } from '@/stores/viewStore.svelte';

	interface Props {
		children?: Snippet;
	}

	let { children }: Props = $props();
</script>

<div class="top-bar">
	<button onclick={() => history.back()} class="back-navigation">⬅</button>
	{#if viewState.domainUrl}
		<button type="button" class="favicon-btn" aria-label="Navigate back">
			<img
				class="favicon"
				src="https://www.google.com/s2/favicons?sz=64&domain={viewState.domainUrl}"
				alt=""
			/>
		</button>
	{/if}

	{@render children?.()}
</div>

<style>
	.top-bar {
		color: white;
		display: flex;
		position: fixed;
		top: 0px;
		flex-direction: row;
		justify-content: space-between;
		align-items: center;
		gap: 10px;
		-webkit-backdrop-filter: blur(10px);
		backdrop-filter: blur(10px);
		background: rgba(54, 54, 54, 0.5);
		min-height: 50px;
		right: 0;
		left: 0;
		z-index: 10;
		box-sizing: border-box;
		padding: 0 1rem;
		padding-right: 1.8em;
	}

	.top-bar::after {
		content: '';
		position: absolute;
		bottom: 0;
		right: 0;
		width: 100%;
		height: 1px;
		background: linear-gradient(
			270deg,
			rgba(255, 255, 255, 0.01) 0%,
			rgba(255, 255, 255, 0.334) 50%,
			rgba(255, 255, 255, 0.01) 100%,
			transparent 100%
		);
		border-radius: 0 0 30px 0;
	}

	.back-navigation {
		all: unset;
		cursor: pointer;
		border-radius: 8px;
		padding: 0px 5px;
		font-size: 25px;
		text-decoration: none;
	}

	.favicon-btn {
		all: unset;
		cursor: pointer;
		margin-right: auto;
		border-radius: 8px;
		padding: 0;
		display: inline-flex;
		align-items: center;
	}

	.favicon {
		border-radius: 8px;
		width: 32px;
		height: 32px;
	}
</style>
