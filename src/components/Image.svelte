<script lang="ts">
	import { toVTName } from '@/lib/utils/url';

	type Props = {
		src: string;
		alt?: string;
		/** Key used for the view-transition name; the article url by default. */
		transitionKey?: string;
	};

	let { src, alt = 'Image', transitionKey = 'image' }: Props = $props();
</script>

{#if src}
	<div class="image-wrapper">
		<img
			{src}
			{alt}
			class="image"
			style={`view-transition-name: vt-main-image-${toVTName(transitionKey)}`}
		/>
	</div>
{/if}

<style>
	.image-wrapper {
		position: relative;
		width: 100%;
		border-radius: var(--radius-lg);
		overflow: hidden;
		background: color-mix(in srgb, var(--color-surface, #111) 18%, transparent);
	}

	.image-wrapper::before {
		display: block;
		padding-top: 56.25%;
		content: '';
	}

	.image {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: cover;
		border-radius: var(--radius-lg);
	}
</style>
