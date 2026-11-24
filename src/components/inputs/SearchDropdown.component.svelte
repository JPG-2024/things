<script lang="ts">
	import { tick } from 'svelte';
	import type { Snippet } from 'svelte';
	import Label from './Label.component.svelte';

	interface Option {
		label: string;
		value: string;
		emoji?: string;
		description?: string;
	}

	interface Props {
		id?: string;
		options?: Option[];
		value?: string;
		placeholder?: string;
		disabled?: boolean;
		label?: string;
		labelPosition?: 'top' | 'inline';
		searchPlaceholder?: string;
		allowCreate?: boolean;
		createLabel?: (query: string) => string;
		/** Capitalize option labels. Kept on by default for the category editor. */
		capitalize?: boolean;
		trigger?: Snippet<[{ open: boolean }]>;
		triggerTooltip?: string;
		onChange?: (value: string) => void;
		onSelect?: (option: Option) => void;
		onCreate?: (query: string) => void;
	}

	let {
		id,
		options = [],
		value = $bindable(''),
		placeholder = 'Select option...',
		disabled = false,
		label,
		labelPosition = 'top',
		searchPlaceholder = 'Search...',
		allowCreate = false,
		createLabel = (query: string) => `Create "${query}"`,
		capitalize = true,
		trigger,
		triggerTooltip,
		onChange,
		onSelect,
		onCreate
	}: Props = $props();

	let open = $state(false);
	let openUp = $state(false);
	let query = $state('');
	let highlightIndex = $state(0);
	let triggerEl: HTMLButtonElement;
	let panelEl: HTMLDivElement;
	let searchEl: HTMLInputElement;

	const selectedOption = $derived(options.find((option) => option.value === value) ?? null);

	const filteredOptions = $derived.by(() => {
		const term = query.trim().toLowerCase();
		if (!term) return options;
		return options.filter((option) => {
			return (
				option.label.toLowerCase().includes(term) ||
				option.description?.toLowerCase().includes(term)
			);
		});
	});

	const canCreate = $derived.by(() => {
		if (!allowCreate) return false;
		const term = query.trim();
		if (!term) return false;
		return !options.some((option) => option.label.toLowerCase() === term.toLowerCase());
	});

	const rowCount = $derived(filteredOptions.length + (canCreate ? 1 : 0));

	/** Edges of the nearest scrollable ancestor (e.g. a modal's scroll area). */
	function getScrollBounds(): { top: number; bottom: number } {
		let el = triggerEl?.parentElement ?? null;
		while (el) {
			const overflowY = getComputedStyle(el).overflowY;
			if (overflowY === 'auto' || overflowY === 'scroll') {
				const rect = el.getBoundingClientRect();
				return { top: rect.top, bottom: rect.bottom };
			}
			el = el.parentElement;
		}
		return { top: 0, bottom: window.innerHeight };
	}

	/** Open upward when the panel would be clipped by the scrollport below. */
	function placePanel() {
		if (!triggerEl || !panelEl) return;
		const triggerRect = triggerEl.getBoundingClientRect();
		const { top, bottom } = getScrollBounds();
		const margin = 8;
		const spaceBelow = bottom - triggerRect.bottom - margin;
		const spaceAbove = triggerRect.top - top - margin;
		openUp = spaceBelow < panelEl.offsetHeight && spaceAbove > spaceBelow;
	}

	async function toggle() {
		if (disabled) return;
		if (open) {
			open = false;
			return;
		}
		query = '';
		highlightIndex = 0;
		open = true;
		await tick();
		placePanel();
		searchEl?.focus();
	}

	function select(option: Option) {
		value = option.value;
		open = false;
		triggerEl?.focus();
		onChange?.(option.value);
		onSelect?.(option);
	}

	function createFromQuery() {
		const term = query.trim();
		if (!term) return;
		open = false;
		onCreate?.(term);
	}

	function activateHighlighted() {
		if (highlightIndex < filteredOptions.length) {
			select(filteredOptions[highlightIndex]);
			return;
		}
		if (canCreate) {
			createFromQuery();
		}
	}

	function handleClickOutside(event: MouseEvent) {
		const target = event.target as Node;
		if (open && triggerEl && !triggerEl.contains(target) && panelEl && !panelEl.contains(target)) {
			open = false;
		}
	}

	function handleSearchKeydown(event: KeyboardEvent) {
		event.stopPropagation();

		switch (event.key) {
			case 'Escape':
				event.preventDefault();
				open = false;
				triggerEl?.focus();
				break;
			case 'ArrowDown':
				event.preventDefault();
				if (rowCount > 0) {
					highlightIndex = (highlightIndex + 1) % rowCount;
				}
				break;
			case 'ArrowUp':
				event.preventDefault();
				if (rowCount > 0) {
					highlightIndex = (highlightIndex - 1 + rowCount) % rowCount;
				}
				break;
			case 'Enter':
				event.preventDefault();
				activateHighlighted();
				break;
		}
	}

	function handleInput() {
		highlightIndex = 0;
	}
</script>

<svelte:window onclick={handleClickOutside} />

{#snippet dropdown()}
	<div class="search-dropdown" class:icon-trigger={trigger !== undefined}>
		<button
			bind:this={triggerEl}
			{id}
			type="button"
			class="trigger"
			class:disabled
			class:icon-only={trigger !== undefined}
			onclick={toggle}
			{disabled}
			title={trigger ? triggerTooltip : undefined}
			aria-label={trigger ? (triggerTooltip ?? placeholder) : undefined}
			aria-expanded={open}
			aria-haspopup="listbox"
		>
			{#if trigger}
				{@render trigger({ open })}
			{:else}
				{#if selectedOption?.emoji}
					<span class="option-emoji" aria-hidden="true">{selectedOption.emoji}</span>
				{/if}
				<span class="trigger-label">{selectedOption?.label ?? placeholder}</span>
				<span class="chevron" class:open>▾</span>
			{/if}
		</button>

		{#if open}
			<div bind:this={panelEl} class="panel" class:open-up={openUp}>
				<input
					bind:this={searchEl}
					class="search-input"
					type="text"
					autocomplete="off"
					placeholder={searchPlaceholder}
					bind:value={query}
					oninput={handleInput}
					onkeydown={handleSearchKeydown}
				/>
				<div class="options" class:capitalize role="listbox">
					{#each filteredOptions as option, i (option.value)}
						<button
							type="button"
							class="option"
							class:selected={option.value === value}
							class:highlighted={i === highlightIndex}
							role="option"
							aria-selected={option.value === value}
							onclick={() => select(option)}
							onmouseenter={() => (highlightIndex = i)}
						>
							<span class="option-main">
								{#if option.emoji}
									<span class="option-emoji" aria-hidden="true">{option.emoji}</span>
								{/if}
								<span class="option-label">{option.label}</span>
							</span>
							{#if option.description}
								<span class="option-description">{option.description}</span>
							{/if}
						</button>
					{/each}

					{#if canCreate}
						<button
							type="button"
							class="option create-option"
							class:highlighted={highlightIndex === filteredOptions.length}
							onclick={createFromQuery}
							onmouseenter={() => (highlightIndex = filteredOptions.length)}
						>
							<span class="option-label">{createLabel(query.trim())}</span>
						</button>
					{/if}

					{#if rowCount === 0}
						<span class="empty">No results</span>
					{/if}
				</div>
			</div>
		{/if}
	</div>
{/snippet}

{#if label}
	<Label text={label} htmlFor={id} position={labelPosition}>
		{@render dropdown()}
	</Label>
{:else}
	{@render dropdown()}
{/if}

<style>
	.search-dropdown {
		position: relative;
		width: 100%;
		font-family: var(--font-secondary);
	}

	.search-dropdown.icon-trigger {
		width: auto;
	}

	.search-dropdown.icon-trigger .trigger {
		width: auto;
		padding: 0.15rem;
		border: none;
		background: none;
		box-shadow: none;
	}

	.search-dropdown.icon-trigger .trigger:focus {
		border: none;
		box-shadow: none;
	}

	.search-dropdown.icon-trigger .trigger :global(svg) {
		display: block;
	}

	.search-dropdown.icon-trigger .trigger:hover :global(svg) {
		stroke: var(--primary-color) !important;
		transform: scale(1.05);
	}

	.search-dropdown.icon-trigger .panel {
		right: auto;
		min-width: 260px;
	}

	.trigger {
		position: relative;
		box-sizing: border-box;
		outline: none;
		border: 1px solid rgb(19, 19, 19);
		border-radius: var(--radius-sm);
		background: rgba(128, 128, 128, 0.15);
		padding: 0.16rem 1rem;
		width: 100%;
		color: inherit;
		font-size: 1rem;
		cursor: pointer;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		text-align: left;
	}

	.trigger:focus {
		transition: all 0.3s ease;
		border-left: 1px solid var(--primary-color);
		border-right: 1px solid var(--primary-color);
	}

	.trigger.disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.trigger-label {
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.chevron {
		flex-shrink: 0;
		font-size: 0.75rem;
		transition: transform 0.2s ease;
	}

	.chevron.open {
		transform: rotate(180deg);
	}

	.panel {
		position: absolute;
		top: 102%;
		left: 0;
		right: 0;
		z-index: 80;
		font-family: var(--font-secondary);
		background: #111111;
		border-radius: var(--radius-sm);
		overflow: hidden;
	}

	.panel.open-up {
		top: auto;
		bottom: 102%;
	}

	.search-input {
		box-sizing: border-box;
		width: 100%;
		outline: none;
		border: none;
		border-bottom: 1px solid black;
		background: transparent;
		padding: 0.5rem 0.75rem;
		color: white;
		font-size: 0.8rem;
	}

	.options {
		background: black;
		max-height: 260px;
		overflow-y: auto;
	}

	.options.capitalize {
		text-transform: capitalize;
	}

	.option {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.1rem;
		width: 100%;
		padding: 0.4rem 0.75rem;
		border: none;
		background: transparent;
		color: white;
		font-size: 0.8rem;
		cursor: pointer;
		text-align: left;
		box-sizing: border-box;
	}

	.option:hover,
	.option.highlighted {
		background: white;
		color: black;
	}

	.option.selected {
		border-left: 6px solid var(--primary-color);
	}

	.option-main {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		max-width: 100%;
	}

	.option-emoji {
		flex-shrink: 0;
		display: inline-block;
		line-height: 1;
	}

	.option-label {
		max-width: 100%;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.option-description {
		max-width: 100%;
		opacity: 0.5;
		font-size: 0.8rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.create-option .option-label {
		color: var(--primary-color);
	}

	.empty {
		display: block;
		padding: 0.5rem 0.75rem;
		opacity: 0.5;
		font-size: 0.85rem;
	}
</style>
