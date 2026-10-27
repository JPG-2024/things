<script lang="ts">
	import { onMount } from 'svelte';
	import type { Snippet } from 'svelte';
	import { viewState } from '@/stores/viewStore.svelte';
	import { getCategories, saveCategory } from '@/stores/webStore';
	import { slugifyCategoryId } from '@/lib/utils/categories';
	import CategoryItem from './CategoryItem.svelte';
	import Icon from './Icon.svelte';
	import SearchDropdown from './inputs/SearchDropdown.component.svelte';

	interface Props {
		/** Currently selected category ids. Seeded into the pills on change. */
		value?: string[];
		/** Fires with the full next selection; persisting is the caller's job. */
		onChange?: (ids: string[]) => void;
		/** Extra control rendered inside every pill, after its label. */
		pillActions?: Snippet<[id: string]>;
		/** Extra controls rendered at the end of the pills row (before search). */
		trailingActions?: Snippet;
	}

	let { value = [], onChange, pillActions, trailingActions }: Props = $props();

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

	/** Applies a new selection locally and hands it to the caller. */
	function commit(nextIds: string[]) {
		selectedIds = dedupeIds(nextIds);
		onChange?.(selectedIds);
	}

	async function handleSelect(option: { value: string }) {
		searchValue = '';
		if (selectedIds.includes(option.value)) return;
		commit([...selectedIds, option.value]);
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
		commit([...selectedIds, resolvedId]);
	}

	async function removeId(id: string) {
		commit(selectedIds.filter((entry) => entry !== id));
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
				{#if pillActions}{@render pillActions(id)}{/if}
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

		{#if trailingActions}{@render trailingActions()}{/if}

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
