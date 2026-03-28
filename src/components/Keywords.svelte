<script lang="ts">
import type { Task, TaskComponentProps } from "@/types/taskRunner.types";
import Pill from "./Pill.svelte";

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

	if (typeof data === "object" && data !== null && "keywords" in data) {
		const value = data.keywords;
		return Array.isArray(value)
			? value.map((keyword) => String(keyword).trim()).filter(Boolean)
			: [];
	}

	if (typeof data === "string") {
		try {
			const parsed = JSON.parse(data) as { keywords?: unknown };
			return Array.isArray(parsed.keywords)
				? parsed.keywords
						.map((keyword) => String(keyword).trim())
						.filter(Boolean)
				: [];
		} catch {
			return [];
		}
	}

	return [];
});
</script>

<div class="keywords">
	{#each parsedKeywords as keyword}
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
