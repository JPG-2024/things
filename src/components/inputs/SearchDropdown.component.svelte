<script lang="ts">
	import { tick } from 'svelte';
	import Label from './Label.component.svelte';

	interface Option {
		label: string;
		value: string;
		emoji?: string;
		description?: string;
	}

	interface Props {
		options?: Option[];
		value?: string;
		placeholder?: string;
		disabled?: boolean;
		label?: string;
		labelPosition?: 'top' | 'inline';
		searchPlaceholder?: string;
		allowCreate?: boolean;
		createLabel?: (query: string) => string;
		onChange?: (value: string) => void;
		onSelect?: (option: Option) => void;
		onCreate?: (query: string) => void;
	}

	let {
		options = [],
		value = $bindable(''),
		placeholder = 'Select option...',
		disabled = false,
		label,
		labelPosition = 'top',
		searchPlaceholder = 'Search...',
		allowCreate = false,
		createLabel = (query: string) => `Create "${query}"`,
		onChange,
		onSelect,
		onCreate
	}: Props = $props();

	let open = $state(false);
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
	<div class="search-dropdown">
		<button
			bind:this={triggerEl}
			type="button"
			class="trigger"
			class:disabled
			onclick={toggle}
			{disabled}
			aria-expanded={open}
			aria-haspopup="listbox"
		>
			{#if selectedOption?.emoji}
				<span class="option-emoji" aria-hidden="true">{selectedOption.emoji}</span>
			{/if}
			<span class="trigger-label">{selectedOption?.label ?? placeholder}</span>
			<span class="chevron" class:open>▾</span>
		</button>

		{#if open}
			<div bind:this={panelEl} class="panel">
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
				<div class="options" role="listbox">
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
	<Label text={label} position={labelPosition}>
		{@render dropdown()}
	</Label>
{:else}
	{@render dropdown()}
{/if}

<style>
	.search-dropdown {
		position: relative;
		width: 100%;
	}

	.trigger {
		position: relative;
		color: var(--primary-color);
		backdrop-filter: blur(8px);
		box-sizing: border-box;
		outline: none;
		border: 1px solid rgba(255, 255, 255, 0.1);
		background: rgba(154, 154, 154, 0.12);
		box-shadow: inset 0 12px 14px rgba(var(--primary-color), 0.5);
		border-radius: var(--radius-sm);
		padding: 0.2rem 0.75rem;
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
		box-shadow: inset 0 0 5px 1px var(--primary-color);
		transition: all 0.3s ease;
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
		background: #1a1a1a;
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: var(--radius-sm);
		box-shadow: 0 8px 16px rgba(0, 0, 0, 0.4);
		overflow: hidden;
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
		font-size: 0.95rem;
	}

	.options {
		max-height: 260px;
		overflow-y: auto;
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
		font-size: 1rem;
		cursor: pointer;
		text-align: left;
		box-sizing: border-box;
	}

	.option:hover,
	.option.highlighted {
		background: color-mix(in srgb, var(--bg-color) 10%, transparent);
	}

	.option.selected {
		border-left: 2px solid var(--primary-color);
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
