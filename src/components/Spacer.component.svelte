<script lang="ts">
	import type { Snippet } from 'svelte';
	import Icon from '@/components/Icon.svelte';
	import { scale, slide } from 'svelte/transition';

	type Props = {
		size?: number | string;
		title?: string;
		icon?: string;
		defaultOpen?: boolean;
		children?: Snippet;
	};

	let { size = 5, title, icon, defaultOpen = false, children }: Props = $props();

	let open = $state(defaultOpen);
	let resolvedSize = $derived(typeof size === 'number' ? `${size}px` : size);

	function toggle() {
		open = !open;
	}
</script>

{#if title}
	<div class="spacer-accordion">
		<button class="spacer-header" onclick={toggle}>
			<Icon
				name="ChevronRight"
				size={14}
				color="rgba(255, 255, 255, 0.6)"
				class="chevron"
				style={open
					? 'transform: rotate(90deg); transition: transform 0.2s'
					: 'transition: transform 0.2s'}
			/>
			{#if icon}
				<Icon name={icon} size={16} color="rgba(255, 255, 255, 0.6)" />
			{/if}
			<span class="spacer-title">{title}</span>
		</button>
		{#if open}
			<div
				class="spacer-content"
				style="padding-top: {resolvedSize}"
				transition:slide={{ axis: 'y', duration: 100 }}
			>
				{@render children?.()}
			</div>
		{/if}
	</div>
{:else}
	<div class="spacer" style="height: {resolvedSize}"></div>
{/if}

<style>
	.spacer {
		width: 100%;
		flex-shrink: 0;
	}

	.spacer-accordion {
		display: flex;
		flex-direction: column;
		width: 100%;
		padding-left: 1rem;
	}

	.spacer-header {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		background: none;
		border: none;
		padding: 0.25rem 0;
		cursor: pointer;
		width: max-content;
	}

	.spacer-header :global(.chevron) {
		transition: transform 0.2s;
	}

	.spacer-header :global(.chevron.open) {
		transform: rotate(90deg);
	}

	.spacer-title {
		font-size: 0.88rem;
		color: rgba(255, 255, 255, 0.65);
		color: var(--primary-color);
		font-weight: bold;
		font-size: 1.1rem;
		color: var(--primary-color, #000);
	}

	.spacer-header:hover .spacer-title {
		color: rgba(255, 255, 255, 0.9);
	}

	.spacer-content {
		width: 100%;
	}
</style>
