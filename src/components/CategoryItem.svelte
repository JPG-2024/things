<script lang="ts">
	import { goto } from '$app/navigation';
	import EmojiString from '@/components/EmojiString.svelte';

	interface Props {
		value: string;
		hideEmoji?: boolean;
		categoryId?: string;
	}

	let { value, hideEmoji = false, categoryId }: Props = $props();

	function handleClick() {
		if (categoryId) {
			goto(`/category/${categoryId}?name=${encodeURIComponent(value)}`);
		}
	}
</script>

{#if categoryId}
	<button type="button" class="category-item category-item--link" onclick={handleClick}>
		<EmojiString {value} {hideEmoji} />
	</button>
{:else}
	<span class="category-item">
		<EmojiString {value} {hideEmoji} />
	</span>
{/if}

<style>
	.category-item {
		--emoji-string-text-color: var(--bg-color);
	}

	.category-item--link {
		all: unset;
		cursor: pointer;
		display: inline-flex;
		align-items: center;
	}

	.category-item--link:hover {
		opacity: 0.8;
	}
</style>
