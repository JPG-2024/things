<script lang="ts">
	import type { Task, TaskComponentProps } from '@/types/taskRunner.types';
	import Pill from './Pill.svelte';

	interface Props {
		task?: Task;
		keywords?: string[];
		componentProps?: TaskComponentProps;
	}

	let { task = undefined, keywords = [], componentProps = {} }: Props = $props();

	void componentProps;

	const parsedKeywords = $derived.by(() => {
		if (keywords.length > 0) {
			return keywords;
		}

		const data = task?.data;
		if (Array.isArray(data)) {
			return data.map((keyword) => String(keyword).trim()).filter(Boolean);
		}

		return [];
	});
</script>

<div class="keywords">
	{#each parsedKeywords as keyword (keyword)}
		<Pill status="idle" text={keyword} showPoint {...componentProps} />
	{/each}
</div>

<style>
	.keywords {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}
</style>
