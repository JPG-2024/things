<script lang="ts">
	import { viewState } from '@/stores/viewStore.svelte';

	interface Props {
		value: string;
		hideEmoji?: boolean;
		active?: boolean;
	}

	let { value, hideEmoji = false, active = false }: Props = $props();

	let firstChar = $derived(Array.from(value)[0] ?? '');
	let emoji = $derived(/\p{L}|\p{N}/u.test(firstChar) ? '' : firstChar);
	let text = $derived(emoji ? Array.from(value).slice(1).join('').trimStart() : value);

	let tintHue = $derived(active ? viewState.primaryTintHue : viewState.tintHue);
</script>

<span
	class="emoji-string"
	class:emoji-hidden={hideEmoji}
	class:active
	style={`--emoji-tint: ${tintHue}deg`}
>
	{#if emoji && !hideEmoji}
		<span class="emoji-string__emoji">{emoji}</span>
	{/if}
	<span class="emoji-string__text">{text}</span>
</span>

<style>
	.emoji-string {
		display: flex;
		align-items: center;
		gap: 0.3rem;
		text-wrap: nowrap;
	}

	.emoji-string__emoji {
		font-family: 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif;
		line-height: 1;
		font-size: 0.8rem;
		filter: grayscale(1) sepia(1) hue-rotate(calc(var(--emoji-tint, 0deg) - 36deg)) saturate(3);
	}

	.emoji-string__text {
		font-size: 1rem;
		line-height: 1.2;
		font-family: Noto Sans;
		color: white;
		text-transform: capitalize;
	}

	.active .emoji-string__text {
		font-weight: bold;
		text-decoration: underline;
	}

	.active .emoji-string__emoji {
		font-size: 1.1rem;
	}
</style>
