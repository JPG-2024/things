<script lang="ts">
	import { onMount } from 'svelte';
	import { viewState } from '@/stores/viewStore.svelte';
	import {
		assignCategoriesToArticle,
		getCategories,
		saveCategory,
		updateTaskDataById
	} from '@/stores/webStore';
	import { resolveCategoryId, slugifyCategoryId } from '@/lib/utils/categories';
	import { workflowManager } from '@/runners/workflowManager.svelte';
	import EmojiString from './EmojiString.svelte';
	import Icon from './Icon.svelte';
	import SearchDropdown from './inputs/SearchDropdown.component.svelte';

	interface Props {
		articleUrl?: string | null;
		runId?: string | null;
		value?: string[];
		onChange?: (names: string[]) => void;
	}

	let { articleUrl = null, runId = null, value = [], onChange }: Props = $props();

	let selectedNames = $state<string[]>([]);
	let searchValue = $state('');
	let seededKey = '';

	const options = $derived(
		viewState.categories
			.filter((category) => !selectedNames.includes(category.name))
			.map((category) => ({
				label: category.name,
				value: category.id,
				description: category.description ?? undefined
			}))
	);

	async function loadCategories() {
		viewState.categories = await getCategories();
	}

	function dedupeIds(ids: Array<string | null>): string[] {
		return ids
			.filter((id): id is string => Boolean(id))
			.filter((id, i, arr) => arr.indexOf(id) === i);
	}

	async function persist(nextNames: string[]) {
		selectedNames = nextNames;
		onChange?.(nextNames);
		if (!articleUrl) return;

		const categoryIds = dedupeIds(
			nextNames.map((name) => resolveCategoryId(name, viewState.categories))
		);

		await assignCategoriesToArticle({ articleUrl, categoryIds });
		await updateTaskDataById(articleUrl, 'category', nextNames);
		if (runId) {
			workflowManager.setTaskData(runId, 'category', nextNames);
		}
	}

	async function handleSelect(option: { value: string }) {
		searchValue = '';
		const category = viewState.categories.find((entry) => entry.id === option.value);
		if (!category || selectedNames.includes(category.name)) return;
		await persist([...selectedNames, category.name]);
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

		const resolvedName = category?.name ?? name;
		if (selectedNames.includes(resolvedName)) return;
		await persist([...selectedNames, resolvedName]);
	}

	async function removeName(name: string) {
		await persist(selectedNames.filter((entry) => entry !== name));
	}

	$effect(() => {
		const incoming = value ?? [];
		const key = incoming.join('\u0000');
		if (key === seededKey) return;
		seededKey = key;
		selectedNames = [...incoming];
	});

	onMount(() => {
		void loadCategories();
	});
</script>

<div class="category-editor">
	{#if selectedNames.length > 0}
		<div class="category-pills">
			{#each selectedNames as name (name)}
				<span class="category-pill">
					<EmojiString value={name} />
					<button
						type="button"
						class="remove-btn"
						onclick={() => removeName(name)}
						aria-label="Remove {name}"
					>
						<Icon name="Trash" size={12} />
					</button>
				</span>
			{/each}
		</div>
	{/if}

	<div class="category-search">
		<SearchDropdown
			bind:value={searchValue}
			{options}
			placeholder="+ add category"
			searchPlaceholder="Search or create..."
			allowCreate
			createLabel={(query) => `Create "${query}"`}
			onSelect={handleSelect}
			onCreate={handleCreate}
		/>
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
		width: min(360px, 100%);
	}
</style>
