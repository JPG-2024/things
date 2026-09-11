<script lang="ts">
	import { invoke } from '@tauri-apps/api/core';
	import Label from './Label.component.svelte';
	import Icon from '@/components/Icon.svelte';

	interface Props {
		id?: string;
		value?: string;
		placeholder?: string;
		disabled?: boolean;
		type?: string;
		min?: string;
		label?: string;
		labelPosition?: 'top' | 'inline';
		search?: boolean;
		autofocus?: boolean;
		onChange?: (value: string) => void;
		onEnter?: (value: string) => void;
		onShiftEnter?: (value: string) => void;
	}

	let {
		id,
		value = $bindable(''),
		placeholder = '',
		disabled = false,
		type = 'text',
		min,
		label,
		labelPosition = 'top',
		search = false,
		autofocus = false,
		onChange,
		onEnter,
		onShiftEnter
	}: Props = $props();

	let inputEl = $state<HTMLInputElement | null>(null);

	$effect(() => {
		if (autofocus && inputEl && !disabled) {
			// tick to ensure mounted
			queueMicrotask(() => inputEl?.focus());
		}
	});

	function handleInput(event: Event) {
		const target = event.target as HTMLInputElement;
		const newValue = target.value;
		value = newValue;

		if (onChange) {
			onChange(newValue);
		}
	}

	function extractUrlFromHtml(html: string): string {
		const hrefMatch = html.match(/href="([^"]+)"/);
		if (hrefMatch) return hrefMatch[1];
		const urlMatch = html.match(/https?:\/\/\S+/);
		return urlMatch ? urlMatch[0] : html;
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter') {
			event.preventDefault();
			if (event.shiftKey && onShiftEnter) {
				onShiftEnter(value);
			} else if (!event.shiftKey && onEnter) {
				onEnter(value);
				value = '';
			}
		}
	}

	async function handleDrop(event: DragEvent) {
		event.preventDefault();
		let text = '';

		for (const type of event.dataTransfer?.types ?? []) {
			const data = event.dataTransfer?.getData(type);
			if (data) {
				text = data;
				break;
			}
		}

		if (!text) {
			try {
				text = await invoke<string>('read_clipboard_text');
			} catch {
				// ignore
			}
		}

		if (text) {
			text = extractUrlFromHtml(text);
			value = value ? `${value} ${text}` : text;
			onChange?.(value);
		}
	}

	function handlePaste(event: ClipboardEvent) {
		const raw = event.clipboardData?.getData('text/plain');
		if (raw) {
			const text = extractUrlFromHtml(raw);
			value = value ? `${value} ${text}` : text;
			onChange?.(value);
		}
	}
</script>

{#if label}
	<Label text={label} position={labelPosition}>
		{#if search}
			<div class="search-wrapper">
				<Icon name="Search" size={16} color="#a1a1a1" />
				<input
					bind:this={inputEl}
					{id}
					class="text-input search-input"
					{type}
					{min}
					bind:value
					{placeholder}
					{disabled}
					oninput={handleInput}
					onkeydown={handleKeydown}
					ondrop={handleDrop}
					onpaste={handlePaste}
				/>
			</div>
		{:else}
			<input
				bind:this={inputEl}
				{id}
				class="text-input"
				{type}
				{min}
				bind:value
				{placeholder}
				{disabled}
				oninput={handleInput}
				onkeydown={handleKeydown}
				ondrop={handleDrop}
				onpaste={handlePaste}
			/>
		{/if}
	</Label>
{:else if search}
	<div class="search-wrapper">
		<Icon name="Search" size={16} color="#a1a1a1" />
		<input
			bind:this={inputEl}
			{id}
			class="text-input search-input"
			{type}
			{min}
			bind:value
			{placeholder}
			{disabled}
			oninput={handleInput}
			onkeydown={handleKeydown}
			ondrop={handleDrop}
			onpaste={handlePaste}
			autocomplete="off"
		/>
	</div>
{:else}
	<input
		bind:this={inputEl}
		{id}
		class="text-input"
		{type}
		{min}
		bind:value
		{placeholder}
		{disabled}
		oninput={handleInput}
		onkeydown={handleKeydown}
		ondrop={handleDrop}
		onpaste={handlePaste}
	/>
{/if}

<style>
	.text-input {
		backdrop-filter: blur(8px);
		box-sizing: border-box;
		outline: none;
		border: none;
		border-radius: var(--radius-sm);
		background: rgba(128, 128, 128, 0.15);
		border: 1px solid rgb(19, 19, 19);
		/* 		border-left: 1px solid rgb(118, 118, 118);
		border-right: 1px solid rgb(118, 118, 118); */
		padding: 0.16rem 1rem;
		width: 100%;
		color: inherit;
		font-size: 1rem;
	}

	.text-input::placeholder {
		color: #595959;
	}

	.text-input:focus {
		/* box-shadow: inset 0 -1px 2px 0px var(--primary-color); */
		transition: all 0.3s ease;
		border-left: 1px solid var(--primary-color);
		border-right: 1px solid var(--primary-color);
	}

	.text-input:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.search-wrapper {
		position: relative;
		display: flex;
		align-items: center;
		width: 100%;
		isolation: isolate;
	}

	.search-wrapper :global(svg) {
		position: absolute;
		left: 0.8rem;
		top: 50%;
		transform: translateY(-50%);
		display: block;
		flex-shrink: 0;
		z-index: 1;
		pointer-events: none;
	}

	.search-input {
		padding-left: 2rem;
	}
</style>
