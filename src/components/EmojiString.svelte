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

	let tintHue = $derived(active ? 'rgb(255, 255, 255)' : viewState.tintHue);
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
		line-height: 1;
		font-size: 0.8em;
		filter: grayscale(1) sepia(1) hue-rotate(calc(var(--emoji-tint, 0deg) - 36deg)) saturate(3);
	}

	.emoji-string__text {
		font-family: 'CaskaydiaCove NFM Light', monospace;
		font-size: 1em;
		line-height: 1.2;
		color: white;
		font-weight: bold;
	}

	.active .emoji-string__text {
		font-weight: bold;
		text-decoration: underline;
		color: var(--primary-color);
		text-shadow:
			0 0 5px color-mix(in srgb, var(--primary-color) 55%, transparent),
			0 0 10px color-mix(in srgb, var(--primary-color) 40%, transparent),
			0 0 15px color-mix(in srgb, white 40%, transparent);
		transition: text-shadow 0.2s ease;
	}

	.active .emoji-string__emoji {
	}
</style>
