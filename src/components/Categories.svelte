<script lang="ts">
	import { viewState } from '@/stores/viewStore.svelte';
	import { deleteCategory, getCategories, saveCategory } from '@/stores/webStore';
	import Icon from './Icon.svelte';

	let newCategoryName = $state('');
	let isEditing = $state(false);

	async function loadCategories() {
		viewState.categories = await getCategories();
	}

	async function addCategory(name: string) {
		const trimmed = name.trim();
		if (!trimmed) return;
		const id = trimmed.toLowerCase().replace(/\s+/g, '-');
		await saveCategory({ id, name: trimmed });
		await loadCategories();
	}

	async function removeCategory(id: string) {
		pruneCategory(id);
		await deleteCategory(id);
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

	$effect(() => {
		loadCategories();
	});

	function handleAdd() {
		if (!newCategoryName.trim()) return;
		addCategory(newCategoryName);
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
	</div>
	<div class="category-list">
		{#each viewState.categories as category (category.id)}
			<span class="category-pill">
				<button
					type="button"
					class="pill tag"
					class:pill--active={isSelected(category.id)}
					disabled={isEditing}
					onclick={() => toggleCategory(category.id)}
				>
					{category.name}
				</button>
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
	</div>
	{#if isEditing}
		<div class="add-form">
			<input
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
		flex-direction: column;
		gap: 0.75rem;
		width: 100%;
		position: relative;
	}

	.categories-header {
		position: absolute;
		top: 0;
		right: 0;
		display: flex;
		align-items: center;
		opacity: 0;
		transition: opacity 0.15s;
		z-index: 1;
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
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
	}

	.pill {
		color: var(--primary-color);
		border-radius: 12px;
		background-color: black;
		background-size: 200% 200%;
		font-size: 0.88rem;
		line-height: 1.2;
		width: max-content;
		padding: 7px 20px;
		font-weight: bold;
		border: none;
		cursor: pointer;
	}

	.pill:disabled {
		cursor: default;
	}

	.pill--active {
		background-color: var(--primary-color);
		color: black;
	}

	.pill.tag {
		border-radius: 4px;
	}

	.remove-btn {
		background: none;
		border: none;
		color: var(--primary-color);
		cursor: pointer;
		font-size: 1rem;
		line-height: 1;
		padding: 0 0.25rem;
		opacity: 0.6;
		transition: opacity 0.15s;
	}

	.remove-btn:hover {
		opacity: 1;
	}

	.add-form {
		display: flex;
		gap: 0.5rem;
	}

	.add-input {
		flex: 1;
		background: black;
		border: 1px solid var(--primary-color);
		border-radius: 4px;
		color: var(--primary-color);
		font-size: 0.88rem;
		padding: 6px 12px;
		outline: none;
	}

	.add-input::placeholder {
		color: var(--primary-color);
		opacity: 0.4;
	}

	.add-input:focus {
		border-color: var(--primary-color);
		box-shadow: 0 0 0 1px var(--primary-color);
	}

	.add-btn {
		background: var(--primary-color);
		border: none;
		border-radius: 4px;
		color: black;
		cursor: pointer;
		font-size: 0.88rem;
		font-weight: bold;
		padding: 6px 16px;
		transition: opacity 0.15s;
	}

	.add-btn:hover {
		opacity: 0.85;
	}
</style>
