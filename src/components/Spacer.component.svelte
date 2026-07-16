<script lang="ts">
	import type { Snippet } from 'svelte';
	import Icon from '@/components/Icon.svelte';
	import { slide } from 'svelte/transition';

	type Props = {
		size?: number | string;
		title?: string;
		titleSlot?: Snippet;
		icon?: string;
		defaultOpen?: boolean;
		opened?: boolean;
		forcedClosed?: boolean;
		showOnlyContent?: boolean;
		children?: Snippet;
	};

	let {
		size = 5,
		title,
		titleSlot,
		icon,
		defaultOpen = false,
		opened,
		forcedClosed = false,
		showOnlyContent = false,
		children
	}: Props = $props();

	let open = $state(opened || defaultOpen);
	let resolvedSize = $derived(typeof size === 'number' ? `${size}px` : size);
	let effectiveOpen = $derived(forcedClosed ? false : open);

	function toggle() {
		if (!forcedClosed) {
			open = !open;
		}
	}
</script>

{#if showOnlyContent}
	<div class="spacer" style="padding-top: {resolvedSize}">
		{@render children?.()}
	</div>
{:else if title || titleSlot}
	<div class="spacer-accordion">
		<button class="spacer-header" onclick={toggle}>
			{#if icon}
				<Icon name={icon} size={16} color="var(--primary-color)" />
			{/if}
			{#if titleSlot}
				{@render titleSlot()}
			{:else}
				<span class="spacer-title">{title}</span>
			{/if}
			<span class="collapse-icon">
				<Icon
					name="ChevronRight"
					size={14}
					color="var(--primary-color)"
					class="chevron"
					style={open
						? 'transform: rotate(90deg); transition: transform 0.2s'
						: 'transition: transform 0.2s'}
				/>
			</span>
		</button>
		{#if effectiveOpen}
			<div class="spacer-content" transition:slide={{ axis: 'y', duration: 100 }}>
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
		color: white;
	}

	.spacer-header :global(.chevron) {
		transition: transform 0.2s;
	}

	.spacer-header :global(.chevron.open) {
		transform: rotate(90deg);
	}

	.spacer-title {
		color: rgba(255, 255, 255, 0.9);
		font-weight: bold;
		font-size: 1em;
	}

	.collapse-icon {
		opacity: 0.5;
	}

	.spacer-header:hover .spacer-title {
	}

	.spacer-content {
		width: 100%;
		padding-top: 15px;
	}
</style>
