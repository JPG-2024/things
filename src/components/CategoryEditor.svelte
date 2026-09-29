<script lang="ts">
	import { onMount } from 'svelte';
	import { viewState } from '@/stores/viewStore.svelte';
	import {
		assignCategoriesToArticle,
		getCategories,
		saveCategory,
		updateTaskDataById
	} from '@/stores/webStore';
	import { slugifyCategoryId } from '@/lib/utils/categories';
	import { syncCategoryEmbedding } from '@/lib/utils/categoryEmbeddings';
	import { workflowManager } from '@/runners/workflowManager.svelte';
	import CategoryItem from './CategoryItem.svelte';
	import Icon from './Icon.svelte';
	import SearchDropdown from './inputs/SearchDropdown.component.svelte';

	interface Props {
		articleUrl?: string | null;
		runId?: string | null;
		value?: string[];
		onChange?: (ids: string[]) => void;
	}

	let { articleUrl = null, runId = null, value = [], onChange }: Props = $props();

	let selectedIds = $state<string[]>([]);
	let searchValue = $state('');
	let seededKey = '';

	const options = $derived(
		viewState.categories
			.filter((category) => !selectedIds.includes(category.id))
			.map((category) => ({
				label: category.name,
				value: category.id,
				description: category.description ?? undefined
			}))
	);

	function categoryLabel(id: string): string {
		return viewState.categories.find((category) => category.id === id)?.name ?? id;
	}

	async function loadCategories() {
		viewState.categories = await getCategories();
	}

	function dedupeIds(ids: string[]): string[] {
		return ids.filter((id, i, arr) => arr.indexOf(id) === i);
	}

	async function persist(nextIds: string[]) {
		selectedIds = nextIds;
		onChange?.(nextIds);
		if (!articleUrl) return;

		await assignCategoriesToArticle({ articleUrl, categoryIds: dedupeIds(nextIds) });
		await updateTaskDataById(articleUrl, 'category', nextIds);
		if (runId) {
			workflowManager.setTaskData(runId, 'category', nextIds);
		}
	}

	async function handleSelect(option: { value: string }) {
		searchValue = '';
		if (selectedIds.includes(option.value)) return;
		await persist([...selectedIds, option.value]);
	}

	async function handleCreate(query: string) {
		searchValue = '';
		const name = query.trim();
		if (!name) return;

		const id = slugifyCategoryId(name);
		let category = viewState.categories.find((entry) => entry.id === id);
		if (!category) {
			await saveCategory({ id, name });
			await loadCategories();
			category = viewState.categories.find((entry) => entry.id === id);
			try {
				await syncCategoryEmbedding({ id, name });
			} catch (error) {
				console.error(`Error indexing category "${id}" embedding:`, error);
			}
		}

		const resolvedId = category?.id ?? id;
		if (selectedIds.includes(resolvedId)) return;
		await persist([...selectedIds, resolvedId]);
	}

	async function removeId(id: string) {
		await persist(selectedIds.filter((entry) => entry !== id));
	}

	$effect(() => {
		const incoming = value ?? [];
		const key = incoming.join('\u0000');
		if (key === seededKey) return;
		seededKey = key;
		selectedIds = [...incoming];
	});

	onMount(() => {
		void loadCategories();
	});
</script>

<div class="category-editor">
	<div class="category-pills">
		{#each selectedIds as id (id)}
			<span class="category-pill">
				<CategoryItem value={categoryLabel(id)} />
				<button
					type="button"
					class="remove-btn"
					onclick={() => removeId(id)}
					aria-label="Remove {categoryLabel(id)}"
				>
					<Icon name="Trash" size={12} />
				</button>
			</span>
		{/each}

		<div class="category-search">
			<SearchDropdown
				bind:value={searchValue}
				{options}
				placeholder="Add category"
				searchPlaceholder="Search or create..."
				allowCreate
				createLabel={(query) => `Create "${query}"`}
				onSelect={handleSelect}
				onCreate={handleCreate}
				triggerTooltip="add category"
			>
				{#snippet trigger()}
					<Icon name="CirclePlus" size={18} />
				{/snippet}
			</SearchDropdown>
		</div>
	</div>
</div>

<style>
	.category-editor {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		width: 100%;
	}

	.category-pills {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.4rem;
	}

	.category-pill {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		min-height: 30px;
		text-transform: capitalize;
	}

	.remove-btn {
		opacity: 0.5;
		transition: opacity 0.15s;
		cursor: pointer;
		border: none;
		background: none;
		padding: 0 0.2rem;
		color: var(--primary-color);
		line-height: 1;
	}

	.remove-btn:hover {
		opacity: 1;
	}

	.category-search {
		width: auto;
	}
</style>
