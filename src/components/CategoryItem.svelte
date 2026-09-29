<script lang="ts">
	import EmojiString from '@/components/EmojiString.svelte';

	interface Props {
		value: string;
		active?: boolean;
		hideEmoji?: boolean;
	}

	let { value, active = false, hideEmoji = false }: Props = $props();
</script>

<span class="category-item" class:active>
	<EmojiString {value} {active} {hideEmoji} />
</span>

<style>
	.category-item {
		--emoji-string-text-color: var(--bg-color);
	}
</style>
