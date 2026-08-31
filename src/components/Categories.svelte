<script lang="ts">
	import { viewState } from '@/stores/viewStore.svelte';
	import { deleteCategory, getCategories, saveCategory } from '@/stores/webStore';
	import type { WebStoreCategoryRecord } from '@/stores/webStore';
	import { generateCategoryDescription, generateEmojiForText } from '@/runners/shared/sharedTasks';
	import Icon from './Icon.svelte';
	import Tooltip from './Tooltip.svelte';
	import Input from './inputs/Input.component.svelte';
	import Button from './inputs/Button.component.svelte';
	import EmojiString from './EmojiString.svelte';

	let isEditing = $state(false);
	let categoryFilter = $state('');

	async function loadCategories() {
		viewState.categories = await getCategories();
	}

	async function addCategory(name: string, description?: string) {
		const trimmed = name.trim();
		if (!trimmed) return;
		const id = trimmed.toLowerCase().replace(/\s+/g, '-');
		await saveCategory({ id, name: trimmed, description });
		await loadCategories();
	}

	async function removeCategory(id: string) {
		pruneCategory(id);
		await deleteCategory(id);
		await loadCategories();
	}

	async function saveCategoryDescription(category: WebStoreCategoryRecord) {
		let description = category.description?.trim() ?? '';
		if (!description) {
			description = await generateCategoryDescription(category.name);
			category.description = description;
		}
		await saveCategory({ id: category.id, name: category.name, description });
		await loadCategories();
	}

	function isSelected(id: string): boolean {
		return viewState.selectedCategories.includes(id);
	}

	function toggleCategory(id: string) {
		const list = viewState.selectedCategories;
		const i = list.indexOf(id);
		if (i >= 0) {
			viewState.selectedCategories = list.filter((_, idx) => idx !== i);
		} else {
			viewState.selectedCategories = [...list, id];
		}
	}

	function pruneCategory(id: string) {
		viewState.selectedCategories = viewState.selectedCategories.filter((c) => c !== id);
	}

	function clearSelectedCategories() {
		viewState.selectedCategories = [];
	}

	let filteredCategories = $derived(
		isEditing
			? viewState.categories.filter((c) => viewState.selectedCategories.includes(c.id))
			: categoryFilter
				? viewState.categories.filter((c) => {
						const term = categoryFilter.trim().toLowerCase();
						return (
							c.name.toLowerCase().includes(term) || c.description?.toLowerCase().includes(term)
						);
					})
				: viewState.categories
	);

	$effect(() => {
		if (viewState.selectedCategories.length === 0) {
			isEditing = false;
		}
	});

	$effect(() => {
		loadCategories();
	});

	async function handleCreateFromFilter() {
		const trimmed = categoryFilter.trim();
		if (!trimmed) return;
		const emoji = await generateEmojiForText(trimmed);
		const name = emoji ? `${emoji} ${trimmed}` : trimmed;
		const description = await generateCategoryDescription(trimmed);
		await addCategory(name, description);
		categoryFilter = '';
	}
</script>

<div class="categories">
	<div class="category-list">
		<span class="category-pill filter-pill">
			<Input type="text" bind:value={categoryFilter} placeholder="Filter" search />
		</span>

		<span class="category-pill icon-pill">
			{#if viewState.selectedCategories.length > 0}
				<Icon
					name="Edit"
					size={16}
					onClick={() => (isEditing = !isEditing)}
					style="opacity: {isEditing ? 1 : 0.5}"
				/>
			{/if}
		</span>

		{#each filteredCategories as category (category.id)}
			<span class="category-pill">
				<Tooltip content={category.description ?? ''}>
					<button
						type="button"
						class="pill tag"
						disabled={isEditing}
						onclick={() => toggleCategory(category.id)}
					>
						<EmojiString value={category.name} active={isSelected(category.id)} hideEmoji />
					</button>
				</Tooltip>
				{#if isEditing}
					<button
						class="remove-btn"
						onclick={() => removeCategory(category.id)}
						aria-label="Remove {category.name}"
					>
						<Icon name="Trash" size={14} />
					</button>
				{/if}
			</span>
		{/each}

		{#if viewState.selectedCategories.length > 0}
			<span class="category-pill icon-pill">
				<Icon name="X" size={16} onClick={clearSelectedCategories} style="opacity: 0.5" />
			</span>
		{/if}

		{#if filteredCategories.length === 0}
			{#if !isEditing && categoryFilter.trim()}
				<Button onClick={handleCreateFromFilter} icon="Plus">
					Create "{categoryFilter.trim()}"
				</Button>
			{:else}
				<button type="button" class="pill add-categories-pill" onclick={() => (isEditing = true)}>
					+ add categories
				</button>
			{/if}
		{/if}
	</div>
	{#if isEditing}
		{#each filteredCategories as category (category.id)}
			<div class="category-edit">
				<span class="category-edit-name"
					><EmojiString value={category.name} active={isSelected(category.id)} /></span
				>
				<input
					autocomplete="off"
					type="text"
					bind:value={category.description}
					onblur={() => saveCategoryDescription(category)}
					onkeydown={(event) => {
						if (event.key === 'Enter') saveCategoryDescription(category);
					}}
					placeholder="Description (auto if empty)"
					class="add-input"
				/>
			</div>
		{/each}
	{/if}
</div>

<style>
	.categories {
		display: flex;
		position: relative;
		flex-direction: column;
		gap: 0.75rem;
		width: 100%;
		padding-top: 3rem;
	}

	.filter-pill {
		display: flex;
		align-items: center;
		min-width: 80px;
		padding: 0 1rem;
	}

	.icon-pill {
		display: flex;
		align-items: center;
		padding: 7px 8px;
	}

	.category-list {
		width: 100%;
		display: flex;
		flex-wrap: wrap;
		gap: 0.8rem;
		justify-items: flex-start;
	}

	.category-pill {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		text-transform: capitalize;
	}

	.pill {
		text-transform: capitalize;
		cursor: pointer;
		border: none;
		border-radius: var(--radius-lg);
		background-size: 200% 200%;
		background-color: transparent;
		padding: 7px 20px;
		width: max-content;
	}

	.pill:disabled {
		cursor: default;
	}

	.pill.error {
		border: 1px solid rgb(255, 140, 109);
	}

	.pill.tag {
		border-radius: var(--radius-sm);
	}
	.add-categories-pill {
		opacity: 0.6;
		transition: opacity 0.15s;
		border: 1px dashed var(--primary-color);
		background: transparent;
	}

	.add-categories-pill:hover {
		opacity: 1;
	}

	.remove-btn {
		opacity: 0.6;
		transition: opacity 0.15s;
		cursor: pointer;
		border: none;
		background: none;
		padding: 0 0.25rem;
		color: var(--primary-color);
		font-size: 1rem;
		line-height: 1;
	}

	.remove-btn:hover {
		opacity: 1;
	}

	.category-edit {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.category-edit-name {
		color: var(--primary-color);
		font-size: 0.8rem;
		opacity: 0.7;
		text-transform: capitalize;
		white-space: nowrap;
		min-width: 100px;
	}

	.add-input {
		flex: 1;
		outline: none;
		border: 1px solid var(--primary-color);
		border-radius: var(--radius-sm);
		background: black;
		padding: 6px 12px;
		color: var(--primary-color);
		font-size: 0.88rem;
	}

	.add-input::placeholder {
		opacity: 0.4;
		color: var(--primary-color);
	}

	.add-input:focus {
		box-shadow: 0 0 0 1px var(--primary-color);
		border-color: var(--primary-color);
	}
</style>
