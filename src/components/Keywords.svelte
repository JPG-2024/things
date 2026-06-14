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

	function parseKeywordsFromObject(value: unknown): string[] {
		if (Array.isArray(value)) {
			return value.map((keyword) => String(keyword).trim()).filter(Boolean);
		}

		if (typeof value !== 'object' || value === null) {
			return [];
		}

		const record = value as Record<string, unknown>;

		if (Array.isArray(record.keywords)) {
			return record.keywords.map((keyword) => String(keyword).trim()).filter(Boolean);
		}

		return Object.values(record)
			.filter((v): v is string => typeof v === 'string')
			.map((v) => v.trim())
			.filter(Boolean);
	}

	const parsedKeywords = $derived.by(() => {
		if (keywords.length > 0) {
			return keywords;
		}

		const data = task?.data;

		if (typeof data === 'string') {
			try {
				return parseKeywordsFromObject(JSON.parse(data) as unknown);
			} catch {
				return [];
			}
		}

		return parseKeywordsFromObject(data);
	});
</script>

<div class="keywords">
	{#each parsedKeywords as keyword (keyword)}
		<Pill status="idle" text={keyword} tag />
	{/each}
</div>

<style>
	.keywords {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}
</style>
