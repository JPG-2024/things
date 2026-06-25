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
			{#if icon}
				<Icon name={icon} size={16} color="var(--primary-color)" />
			{/if}
			<span class="spacer-title">{title}</span>
			<Icon
				name="ChevronRight"
				size={14}
				color="var(--primary-color)"
				class="chevron"
				style={open
					? 'transform: rotate(90deg); transition: transform 0.2s'
					: 'transition: transform 0.2s'}
			/>
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
		color: rgba(255, 255, 255, 0.9);
		font-size: 0.88rem;
		font-weight: bold;
		font-size: 1.1rem;
	}

	.spacer-header:hover .spacer-title {
	}

	.spacer-content {
		width: 100%;
	}
</style>
