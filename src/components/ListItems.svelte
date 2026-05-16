<script lang="ts">
	import type { Task, TaskComponentProps } from '@/types/taskRunner.types';

	interface Props {
		task?: Task;
		items?: string[];
		componentProps?: TaskComponentProps;
	}

	let { task = undefined, items = [], componentProps = {} }: Props = $props();

	void componentProps;

	const parsedItems = $derived.by(() => {
		if (items.length > 0) {
			return items;
		}

		let data = task?.data;

		// Parse stringified JSON if needed
		if (typeof data === 'string') {
			try {
				data = JSON.parse(data);
			} catch {
				// If parse fails, treat as regular string
				return [];
			}
		}

		if (Array.isArray(data)) {
			return data.map((item) => String(item).trim()).filter(Boolean);
		}

		// Handle object with random key containing array of strings
		if (typeof data === 'object' && data !== null) {
			// Get the first value that is an array of strings
			for (const key in data) {
				const value = (data as Record<string, unknown>)[key];
				if (Array.isArray(value)) {
					return value.map((item) => String(item).trim()).filter(Boolean);
				}
			}
		}

		return [];
	});
</script>

{#if parsedItems.length > 0}
	<ul class="list-items">
		{#each parsedItems as item (item)}
			<li>{item}</li>
		{/each}
	</ul>
{/if}

<style>
	.list-items {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		font-weight: bold;
	}

	li {
		padding: 0.5rem 0;
		word-wrap: break-word;
		white-space: pre-wrap;
		color: var(--primary-color);
	}

	li::before {
		content: '• ';
		margin-right: 0.5rem;
		color: var(--primary-color);
	}
</style>
