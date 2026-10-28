<script lang="ts">
	import { getMediaSrc, isResolvedMediaSrc } from '@/lib/utils/files';
	import { tooltip as tooltipAction, type TooltipOptions } from '@/lib/actions/tooltip';

	interface Props {
		/** Raw media filename or an already-resolved src (asset src, dev `/@fs` path, remote favicon, data URI). */
		src?: string | null;
		alt?: string;
		/** When set, the thumb shows this text on hover. */
		tooltip?: string;
		/** Extra tooltip options (position, ignoreMenuCtx…). */
		tooltipProps?: TooltipOptions;
		/** Thumb edge length in px. */
		size?: number;
		shape?: 'circle' | 'rounded';
		/** When set, the thumb renders as a clickable button. */
		onclick?: () => void;
	}

	let {
		src = null,
		alt = '',
		tooltip = undefined,
		tooltipProps = undefined,
		size = 40,
		shape = 'circle',
		onclick = undefined
	}: Props = $props();

	let resolvedSrc = $state<string | null>(null);

	const tooltipOptions = $derived<TooltipOptions | undefined>(
		tooltip ? { content: tooltip, ...tooltipProps } : tooltipProps
	);

	$effect(() => {
		const raw = src;
		if (!raw) {
			resolvedSrc = null;
			return;
		}
		// Already a resolved src (converted asset src, dev `/@fs` media path,
		// remote favicon, data/blob URI): use as-is.
		if (isResolvedMediaSrc(raw)) {
			resolvedSrc = raw;
			return;
		}
		let active = true;
		getMediaSrc(raw)
			.then((resolved) => {
				if (active) resolvedSrc = resolved;
			})
			.catch(() => {
				if (active) resolvedSrc = null;
			});
		return () => {
			active = false;
		};
	});
</script>

{#snippet img(withTooltip: boolean)}
	<img
		class="profile-thumb"
		class:rounded={shape === 'rounded'}
		src={resolvedSrc}
		{alt}
		style:width="{size}px"
		style:height="{size}px"
		use:tooltipAction={withTooltip ? tooltipOptions : undefined}
	/>
{/snippet}

{#snippet thumbBody()}
	{#if onclick}
		<button
			type="button"
			class="thumb-btn"
			{onclick}
			aria-label={tooltip ?? alt}
			use:tooltipAction={tooltipOptions}
		>
			{@render img(false)}
		</button>
	{:else}
		{@render img(true)}
	{/if}
{/snippet}

{#if resolvedSrc}
	{@render thumbBody()}
{/if}

<style>
	.thumb-btn {
		all: unset;
		cursor: pointer;
		display: inline-flex;
		padding: 0;
		flex-shrink: 0;
	}

	.profile-thumb {
		display: block;
		border-radius: 50%;
		object-fit: cover;
		flex-shrink: 0;
		transition: transform 0.1s;
	}

	.profile-thumb.rounded {
		border-radius: var(--radius-sm);
	}
</style>
