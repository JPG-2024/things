<script lang="ts">
	import { onMount } from 'svelte';
	import { viewState } from '@/stores/viewStore.svelte';
	import { articleState } from '@/stores/articleStore.svelte';
	import {
		assignCategoriesToArticle,
		getArticleCategories,
		getCategories,
		saveCategory
	} from '@/stores/webStore';
	import { slugifyCategoryId } from '@/lib/utils/categories';
	import { addCategoryExemplar, buildCategoryText } from '@/lib/utils/categoryEmbeddings';
	import { classifyArticleCategory } from '@/runners/shared/taskFactories';
	import CategoryItem from './CategoryItem.svelte';
	import Icon from './Icon.svelte';
	import SearchDropdown from './inputs/SearchDropdown.component.svelte';

	interface Props {
		articleUrl?: string | null;
		value?: string[];
		onChange?: (ids: string[]) => void;
	}

	let { articleUrl = null, value = [], onChange }: Props = $props();

	let selectedIds = $state<string[]>([]);
	let searchValue = $state('');
	let seededKey = '';
	let feedingId = $state<string | null>(null);
	let feedMessage = $state<string | null>(null);
	let feedError = $state(false);
	let reclassifying = $state(false);

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
		if (articleState.isCurrent(articleUrl)) {
			articleState.setCategories(dedupeIds(nextIds));
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
	 * Feeds the article into a category's exemplar set, using the same
	 * `title + summary` representation the classifier compares against.
	 */
	async function feedCategory(categoryId: string) {
		if (!articleUrl || feedingId) return;
		feedingId = categoryId;
		feedMessage = null;

		try {
			const analysis = articleState.currentArticle.analysis;
			const title = articleState.currentArticle.title;
			const text = buildCategoryText(analysis?.summary ?? '', title);
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

	/**
	 * Forces a re-classification of the article. The pipeline only classifies
	 * articles that have no categories, so this is the explicit way to
	 * recalculate them.
	 */
	async function reclassify() {
		if (!articleUrl || reclassifying) return;
		reclassifying = true;
		feedMessage = null;

		try {
			const analysis = articleState.currentArticle.analysis;
			const title = articleState.currentArticle.title;
			const categoryIds = await classifyArticleCategory({
				title,
				summary: analysis?.summary ?? '',
				windows: analysis?.windows ?? []
			});

			if (categoryIds.length === 0) {
				feedError = true;
				feedMessage = 'No category matched';
				return;
			}

			await persist(categoryIds);
			feedError = false;
			feedMessage = `Recalculated: ${categoryIds.map(categoryLabel).join(', ')}`;
		} catch (error) {
			feedError = true;
			feedMessage = error instanceof Error ? error.message : 'Failed to recalculate';
		} finally {
			reclassifying = false;
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

		// Load the persisted categories when the caller did not provide them.
		if (!articleUrl) return;
		void getArticleCategories(articleUrl).then((ids) => {
			if (ids.length === 0) return;
			if ((value ?? []).length > 0) return;
			selectedIds = ids;
			if (articleState.isCurrent(articleUrl)) {
				articleState.setCategories(ids);
			}
		});
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

		<button
			type="button"
			class="reclassify-btn"
			onclick={() => void reclassify()}
			disabled={reclassifying}
			aria-label="Recalculate the category of this article"
		>
			{#if reclassifying}
				<Icon name="LoaderCircle" size={14} />
			{:else}
				<Icon name="RefreshCcw" size={14} tooltipProps={{ content: 'recalculate category' }} />
			{/if}
		</button>

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

	.reclassify-btn {
		opacity: 0.55;
		transition: opacity 0.15s;
		cursor: pointer;
		border: none;
		background: none;
		padding: 0 0.2rem;
		color: var(--primary-color);
		line-height: 1;
		display: inline-flex;
		align-items: center;
	}

	.reclassify-btn:hover:not(:disabled) {
		opacity: 1;
	}

	.reclassify-btn:disabled {
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
