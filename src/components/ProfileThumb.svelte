<script lang="ts">
	import { tooltip as tooltipAction, type TooltipOptions } from '@/lib/actions/tooltip';
	import { getMediaSrc, isResolvedMediaSrc } from '@/lib/utils/files';

	interface Props {
		/** Raw media filename or an already-resolved src (asset src, dev `/@fs` path, remote favicon, data URI). */
		src?: string | null;
		alt?: string;
		/** Text shown on hover. */
		tooltip?: string;
		/** Extra tooltip options (position, ignoreMenuCtx…). */
		tooltipProps?: TooltipOptions;
		/** Thumb edge length in px. */
		size?: number;
		shape?: 'circle' | 'rounded';
		/** When set, the component owns the button and fires this on click. */
		onClick?: () => void;
		/** Hover forwarding for callers that used to own the wrapper button. */
		onMouseEnter?: () => void;
		onMouseLeave?: () => void;
		/** Accessible name of the button (defaults to `tooltip ?? alt`). */
		ariaLabel?: string;
		disabled?: boolean;
		/** Keep a plain `img`: for thumbs that live inside a caller-owned button
		 * (nested buttons are invalid HTML). */
		decorative?: boolean;
	}

	let {
		src = null,
		alt = '',
		tooltip = undefined,
		tooltipProps = undefined,
		size = 40,
		shape = 'circle',
		onClick = undefined,
		onMouseEnter = undefined,
		onMouseLeave = undefined,
		ariaLabel = undefined,
		disabled = false,
		decorative = false
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

{#snippet thumbImg(hidden: boolean)}
	<img
		class="profile-thumb"
		class:rounded={shape === 'rounded'}
		src={resolvedSrc}
		{alt}
		aria-hidden={hidden ? true : undefined}
		style:width="{size}px"
		style:height="{size}px"
		use:tooltipAction={tooltipOptions}
	/>
{/snippet}

{#if resolvedSrc}
	{#if decorative || !onClick}
		{@render thumbImg(decorative)}
	{:else}
		<button
			type="button"
			class="thumb-btn"
			class:rounded={shape === 'rounded'}
			onclick={() => onClick?.()}
			onmouseenter={() => onMouseEnter?.()}
			onmouseleave={() => onMouseLeave?.()}
			aria-label={ariaLabel ?? tooltip ?? alt}
			{disabled}
		>
			{@render thumbImg(false)}
		</button>
	{/if}
{/if}

<style>
	.thumb-btn {
		all: unset;
		cursor: pointer;
		display: inline-flex;
		padding: 0;
		flex-shrink: 0;
		border-radius: 50%;
	}

	.thumb-btn.rounded {
		border-radius: var(--radius-sm);
	}

	.thumb-btn:disabled {
		cursor: default;
		opacity: 0.5;
	}

	/* `all: unset` removes the native focus ring; restore a visible one. */
	.thumb-btn:focus-visible {
		outline: 2px solid var(--primary-color);
		outline-offset: 2px;
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
