<script lang="ts">
	import { viewState } from '@/stores/viewStore.svelte';
	import { deleteCategory, getCategories, saveCategory } from '@/stores/webStore';
	import type { WebStoreCategoryRecord } from '@/stores/webStore';
	import { generateCategoryDescription, generateEmojiForText } from '@/runners/shared/sharedTasks';
	import Icon from './Icon.svelte';
	import Tooltip from './Tooltip.svelte';

	let newCategoryName = $state('');
	let isEditing = $state(false);

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
		if (i >= 0) list.splice(i, 1);
		else list.push(id);
	}

	function pruneCategory(id: string) {
		viewState.selectedCategories = viewState.selectedCategories.filter((c) => c !== id);
	}

	function clearSelectedCategories() {
		viewState.selectedCategories = [];
	}

	$effect(() => {
		loadCategories();
	});

	async function handleAdd() {
		const trimmed = newCategoryName.trim();
		if (!trimmed) return;
		const emoji = await generateEmojiForText(trimmed);
		const name = emoji ? `${emoji} ${trimmed}` : trimmed;
		const description = await generateCategoryDescription(trimmed);
		await addCategory(name, description);
		newCategoryName = '';
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter') {
			handleAdd();
		}
	}
</script>

<div class="categories">
	<div class="categories-header">
		<Icon
			name="Edit"
			size={16}
			color="var(--primary-color)"
			onClick={() => (isEditing = !isEditing)}
			style="opacity: {isEditing ? 1 : 0.5}"
		/>
		{#if viewState.selectedCategories.length > 0}
			<Icon
				name="X"
				size={16}
				color="var(--primary-color)"
				onClick={clearSelectedCategories}
				style="opacity: 0.5"
			/>
		{/if}
	</div>
	<div class="category-list">
		{#each viewState.categories as category (category.id)}
			<span class="category-pill">
				<Tooltip content={category.description ?? ''}>
					<button
						type="button"
						class="pill tag"
						class:pill--active={isSelected(category.id)}
						disabled={isEditing}
						onclick={() => toggleCategory(category.id)}
					>
						{category.name}
					</button>
				</Tooltip>
				{#if isEditing}
					<button
						class="remove-btn"
						onclick={() => removeCategory(category.id)}
						aria-label="Remove {category.name}"
					>
						&times;
					</button>
				{/if}
			</span>
		{/each}
		{#if viewState.categories.length === 0}
			<button type="button" class="pill add-categories-pill" onclick={() => (isEditing = true)}>
				+ add categories
			</button>
		{/if}
	</div>
	{#if isEditing}
		{#each viewState.categories as category (category.id)}
			<div class="category-edit">
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
				<span class="category-edit-name">{category.name}</span>
			</div>
		{/each}
		<div class="add-form">
			<input
				autocomplete="one-time-code"
				type="text"
				bind:value={newCategoryName}
				onkeydown={handleKeydown}
				placeholder="New category"
				class="add-input"
			/>
			<button class="add-btn" onclick={handleAdd}>Add</button>
		</div>
	{/if}
</div>

<style>
	.categories {
		display: flex;
		position: relative;
		flex-direction: column;
		gap: 0.75rem;
		width: 100%;
	}

	.categories-header {
		display: flex;
		position: absolute;
		top: 0;
		right: 0;
		align-items: center;
		opacity: 0;
		z-index: 1;
		transition: opacity 0.15s;
	}

	.categories:hover .categories-header {
		opacity: 1;
	}

	.category-list {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
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
		border-radius: 12px;
		background-size: 200% 200%;
		background-color: transparent;
		padding: 7px 20px;
		width: max-content;
		color: var(--primary-color);
		font-size: 0.88rem;
		line-height: 1.2;
	}

	.pill:disabled {
		cursor: default;
	}

	.pill--active {
		text-shadow:
			0 0 5px var(--primary-color),
			0 0 10px var(--primary-color),
			0 0 20px var(--primary-color),
			0 0 40px var(--primary-color),
			0 0 80px white;
	}

	.pill.error {
		border: 1px solid rgb(255, 140, 109);
	}

	.pill.tag {
		border-radius: 4px;
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

	.add-form {
		display: flex;
		gap: 0.5rem;
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
	}

	.add-input {
		flex: 1;
		outline: none;
		border: 1px solid var(--primary-color);
		border-radius: 4px;
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

	.add-btn {
		transition: opacity 0.15s;
		cursor: pointer;
		border: none;
		border-radius: 4px;
		background: var(--primary-color);
		padding: 6px 16px;
		color: black;
		font-weight: bold;
		font-size: 0.88rem;
	}

	.add-btn:hover {
		opacity: 0.85;
	}
</style>
