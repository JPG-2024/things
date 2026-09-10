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
		const raw =
			keywords.length > 0 ? keywords : Array.isArray(task?.data) ? task.data.map(String) : [];
		return [...new Set(raw.map((k) => String(k).trim()))].filter(Boolean);
	});
</script>

<div class="keywords">
	{#each parsedKeywords as keyword (keyword)}
		<Pill status="idle" text={keyword} showPoint {...componentProps} />
	{/each}
</div>

<style>
	.keywords {
		font-size: var(--keywords-font-size, 1rem);
		display: flex;
		flex-wrap: wrap;
		gap: 0.8rem;
		padding: 0rem 0;
	}
</style>
