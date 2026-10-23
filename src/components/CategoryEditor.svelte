<script lang="ts">
	import { onMount } from 'svelte';
	import { viewState } from '@/stores/viewStore.svelte';
	import {
		assignCategoriesToArticle,
		getCategories,
		getTasksByUrl,
		saveCategory,
		updateTaskDataById
	} from '@/stores/webStore';
	import { slugifyCategoryId } from '@/lib/utils/categories';
	import { addCategoryExemplar, buildCategoryText } from '@/lib/utils/categoryEmbeddings';
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
	let feedingId = $state<string | null>(null);
	let feedMessage = $state<string | null>(null);
	let feedError = $state(false);

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
		}

		const resolvedId = category?.id ?? id;
		if (selectedIds.includes(resolvedId)) return;
		await persist([...selectedIds, resolvedId]);
	}

	async function removeId(id: string) {
		await persist(selectedIds.filter((entry) => entry !== id));
	}

	/**
	 * Resolve the analysis result and the article title (the `title` task's
	 * data) for the current article: from the live run when available,
	 * otherwise from the persisted task state (history).
	 */
	async function resolveAnalysisAndTitle(): Promise<{ analysis: unknown; title: string | null }> {
		let analysis: unknown = null;
		let title: string | null = null;

		if (runId) {
			const liveAnalysis = workflowManager.getTaskData(runId, 'analysis');
			if (liveAnalysis !== undefined) analysis = liveAnalysis;
			const liveTitle = workflowManager.getTaskData(runId, 'title');
			if (typeof liveTitle === 'string' && liveTitle.trim()) title = liveTitle;
		}

		if ((analysis === null || title === null) && articleUrl) {
			const tasks = await getTasksByUrl(articleUrl);
			if (analysis === null) {
				analysis = tasks?.find((task) => task.id === 'analysis')?.data ?? null;
			}
			if (title === null) {
				const titleTask = tasks?.find((task) => task.id === 'title');
				if (typeof titleTask?.data === 'string' && titleTask.data.trim()) title = titleTask.data;
			}
		}

		return { analysis, title };
	}

	async function feedCategory(categoryId: string) {
		if (!articleUrl || feedingId) return;
		feedingId = categoryId;
		feedMessage = null;

		try {
			const { analysis, title } = await resolveAnalysisAndTitle();
			const text = buildCategoryText(analysis, title);
			if (!text) {
				feedError = true;
				feedMessage = 'No analysis text to feed';
				return;
			}
			await addCategoryExemplar({ categoryId, articleUrl, text });
			feedError = false;
			feedMessage = `Added to ${categoryLabel(categoryId)}`;
		} catch (error) {
			feedError = true;
			feedMessage = error instanceof Error ? error.message : 'Failed to add exemplar';
		} finally {
			feedingId = null;
		}
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
					class="feed-btn"
					onclick={() => feedCategory(id)}
					disabled={feedingId !== null}
					aria-label="Add this article to {categoryLabel(id)} embeddings"
				>
					{#if feedingId === id}
						<Icon name="LoaderCircle" size={12} />
					{:else}
						<Icon
							name="FileDigit"
							size={15}
							tooltipProps={{ content: 'Add this category as example for auto category' }}
						/>
					{/if}
				</button>
				<button
					type="button"
					class="remove-btn"
					onclick={() => removeId(id)}
					aria-label="Remove {categoryLabel(id)}"
				>
					<Icon name="Trash" size={15} />
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
			>
				{#snippet trigger()}
					<Icon name="CirclePlus" size={18} tooltipProps={{ content: 'Add category' }} />
					<span class="add-label">category</span>
				{/snippet}
			</SearchDropdown>
		</div>
	</div>

	{#if feedMessage}
		<div class="feed-status" class:feed-error={feedError}>{feedMessage}</div>
	{/if}
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

	.feed-btn {
		opacity: 0.55;
		transition: opacity 0.15s;
		cursor: pointer;
		border: none;
		background: none;
		padding: 0 0.15rem;
		color: var(--primary-color);
		line-height: 1;
		display: inline-flex;
		align-items: center;
	}

	.feed-btn:hover:not(:disabled) {
		opacity: 1;
	}

	.feed-btn:disabled {
		cursor: default;
		opacity: 0.3;
	}

	.feed-status {
		font-size: 0.72rem;
		opacity: 0.65;
		color: var(--primary-color);
	}

	.feed-status.feed-error {
		color: rgb(255, 140, 109);
		opacity: 0.9;
	}

	.category-search {
		width: auto;
	}

	.add-label {
		font-family: var(--font-secondary);
		color: var(--bg-color);
		font-size: 0.85rem;
		line-height: 1;
	}

	.category-search :global(.trigger:hover .add-label) {
		color: white;
	}
</style>
