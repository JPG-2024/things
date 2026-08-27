<script lang="ts">
	import Label from './Label.component.svelte';

	interface Option {
		label: string;
		value: string;
		icon?: string;
		emoji?: string;
	}

	interface Props {
		options: Option[];
		value?: string;
		placeholder?: string;
		disabled?: boolean;
		label?: string;
		labelPosition?: 'top' | 'inline';
		iconSize?: number;
		onChange?: (value: string) => void;
	}

	let {
		options = [],
		value = $bindable(''),
		placeholder = 'Select option...',
		disabled = false,
		label,
		labelPosition = 'top',
		iconSize = 24,
		onChange
	}: Props = $props();

	let open = $state(false);
	let highlightIndex = $state(-1);
	let triggerEl: HTMLButtonElement;
	let panelEl: HTMLDivElement;

	const selectedOption = $derived(options.find((o) => o.value === value) ?? null);

	function toggle() {
		if (disabled) return;
		open = !open;
		if (open) {
			highlightIndex = options.findIndex((o) => o.value === value);
		}
	}

	function select(option: Option) {
		value = option.value;
		open = false;
		triggerEl?.focus();
		if (onChange) {
			onChange(option.value);
		}
	}

	function handleClickOutside(event: MouseEvent) {
		const target = event.target as Node;
		if (open && triggerEl && !triggerEl.contains(target) && panelEl && !panelEl.contains(target)) {
			open = false;
		}
	}

	function handleKeydown(event: KeyboardEvent) {
		if (!open) {
			if (
				event.key === 'ArrowDown' ||
				event.key === 'ArrowUp' ||
				event.key === 'Enter' ||
				event.key === ' '
			) {
				event.preventDefault();
				open = true;
				highlightIndex = options.findIndex((o) => o.value === value);
			}
			return;
		}

		switch (event.key) {
			case 'Escape':
				event.preventDefault();
				open = false;
				break;
			case 'ArrowDown':
				event.preventDefault();
				highlightIndex = (highlightIndex + 1) % options.length;
				break;
			case 'ArrowUp':
				event.preventDefault();
				highlightIndex = (highlightIndex - 1 + options.length) % options.length;
				break;
			case 'Enter':
			case ' ':
				event.preventDefault();
				if (highlightIndex >= 0 && highlightIndex < options.length) {
					select(options[highlightIndex]);
				}
				break;
		}
	}
</script>

<svelte:window onclick={handleClickOutside} />

{#if label}
	<Label text={label} position={labelPosition}>
		<div class="icon-dropdown">
			<button
				bind:this={triggerEl}
				type="button"
				class="trigger"
				class:disabled
				onclick={toggle}
				onkeydown={handleKeydown}
				{disabled}
				aria-expanded={open}
				aria-haspopup="listbox"
			>
				{#if selectedOption?.emoji}
					<span class="option-emoji" style="font-size: {iconSize}px;" aria-hidden="true"
						>{selectedOption.emoji}</span
					>
				{:else if selectedOption?.icon}
					<img
						src={selectedOption.icon}
						alt=""
						width={iconSize}
						height={iconSize}
						class="option-icon"
						style="width: {iconSize}px; height: {iconSize}px;"
					/>
				{/if}
				<span class="trigger-label">
					{selectedOption?.label ?? placeholder}
				</span>
				<span class="chevron" class:open>▾</span>
			</button>
			{#if open}
				<div bind:this={panelEl} class="panel" role="listbox">
					{#each options as option, i (option.value)}
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
							{#if option.emoji}
								<span class="option-emoji" style="font-size: {iconSize}px;" aria-hidden="true"
									>{option.emoji}</span
								>
							{:else if option.icon}
								<img
									src={option.icon}
									alt=""
									class="option-icon"
									style="width: {iconSize}px; height: {iconSize}px;"
								/>
							{/if}
							<span>{option.label}</span>
						</button>
					{/each}
				</div>
			{/if}
		</div>
	</Label>
{:else}
	<div class="icon-dropdown">
		<button
			bind:this={triggerEl}
			type="button"
			class="trigger"
			class:disabled
			onclick={toggle}
			onkeydown={handleKeydown}
			{disabled}
			aria-expanded={open}
			aria-haspopup="listbox"
		>
			{#if selectedOption?.emoji}
				<span class="option-emoji" style="font-size: {iconSize}px;" aria-hidden="true"
					>{selectedOption.emoji}</span
				>
			{:else if selectedOption?.icon}
				<img
					src={selectedOption.icon}
					alt=""
					width={iconSize}
					height={iconSize}
					class="option-icon"
					style="width: {iconSize}px; height: {iconSize}px;"
				/>
			{/if}
			<span class="trigger-label">
				{selectedOption?.label ?? placeholder}
			</span>
			<span class="chevron" class:open>▾</span>
		</button>
		{#if open}
			<div bind:this={panelEl} class="panel" role="listbox">
				{#each options as option, i (option.value)}
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
						{#if option.emoji}
							<span class="option-emoji" style="font-size: {iconSize}px;" aria-hidden="true"
								>{option.emoji}</span
							>
						{:else if option.icon}
							<img
								src={option.icon}
								alt=""
								class="option-icon"
								style="width: {iconSize}px; height: {iconSize}px;"
							/>
						{/if}
						<span>{option.label}</span>
					</button>
				{/each}
			</div>
		{/if}
	</div>
{/if}

<style>
	.icon-dropdown {
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

	.option-icon {
		flex-shrink: 0;
		object-fit: contain;
		border-radius: var(--radius-sm);
	}

	.option-emoji {
		flex-shrink: 0;
		display: inline-block;
		line-height: 1;
	}

	.panel {
		position: absolute;
		top: 102%;
		left: 0;
		right: 0;
		z-index: 80;
		background: #1a1a1a;
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-top: none;
		max-height: 300px;
		overflow-y: auto;
		box-shadow: 0 8px 16px rgba(0, 0, 0, 0.4);
		border-radius: var(--radius-sm);
	}

	.option {
		display: flex;
		align-items: center;
		gap: 0.5rem;
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
		background: color-mix(in srgb, var(--primary-color) 20%, transparent);
	}

	.option.selected {
		border-left: 2px solid var(--primary-color);
	}
</style>
