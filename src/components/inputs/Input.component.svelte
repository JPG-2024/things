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
		max?: string;
		step?: string;
		label?: string;
		labelPosition?: 'top' | 'inline';
		search?: boolean;
		autofocus?: boolean;
		onChange?: (value: string) => void;
		onFocus?: (value: string) => void;
		onBlur?: (value: string) => void;
		onEnter?: (value: string) => void;
		/** Keep the typed value after Enter (commit-style search instead of send-and-clear). */
		keepValueOnEnter?: boolean;
		/**
		 * Multi-URL fields: extract the links from pasted/dropped text and insert
		 * them at the caret instead of letting the native paste replace the value.
		 */
		collectUrls?: boolean;
	}

	let {
		id,
		value = $bindable(''),
		placeholder = '',
		disabled = false,
		type = 'text',
		min,
		max,
		step,
		label,
		labelPosition = 'top',
		search = false,
		autofocus = false,
		onChange,
		onFocus,
		onBlur,
		onEnter,
		keepValueOnEnter = false,
		collectUrls = false
	}: Props = $props();

	let inputEl = $state<HTMLInputElement | null>(null);

	/** Programmatic focus (e.g. hotkey opens the search popover). */
	export function focus() {
		inputEl?.focus();
	}

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

	function handleBlur() {
		onBlur?.(value);
	}

	function handleFocus() {
		onFocus?.(value);
	}

	/** Extract every link found in pasted/dropped text (HTML or plain). */
	function extractLinks(raw: string): string {
		const hrefs = [...raw.matchAll(/href="([^"]+)"/g)].map((match) => match[1]);
		if (hrefs.length > 0) return hrefs.join(' ');

		const urls = raw.match(/https?:\/\/\S+/g);
		return urls?.length ? urls.join(' ') : raw;
	}

	/** Insert text at the caret (or over the selection) instead of replacing the whole value. */
	function insertText(text: string) {
		const clean = text.replace(/\s+/g, ' ').trim();
		if (!clean) return;

		const current = value;
		const start = inputEl?.selectionStart ?? current.length;
		const end = inputEl?.selectionEnd ?? start;
		const before = current.slice(0, start);
		const after = current.slice(end);
		const leadingSpace = before && !/\s$/.test(before) ? ' ' : '';
		const trailingSpace = after && !/^\s/.test(after) ? ' ' : '';

		value = `${before}${leadingSpace}${clean}${trailingSpace}${after}`;
		onChange?.(value);

		const caret = before.length + leadingSpace.length + clean.length;
		queueMicrotask(() => inputEl?.setSelectionRange(caret, caret));
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter') {
			event.preventDefault();
			if (onEnter) {
				onEnter(value);
				if (!keepValueOnEnter) value = '';
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
			insertText(extractLinks(text));
		}
	}

	function handlePaste(event: ClipboardEvent) {
		const raw = event.clipboardData?.getData('text/plain');
		if (!raw) return;

		event.preventDefault();
		insertText(extractLinks(raw));
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
					{max}
					{step}
					bind:value
					{placeholder}
					{disabled}
					oninput={handleInput}
					onfocus={handleFocus}
					onblur={handleBlur}
					onkeydown={handleKeydown}
					ondrop={collectUrls ? handleDrop : undefined}
					onpaste={collectUrls ? handlePaste : undefined}
				/>
			</div>
		{:else}
			<input
				bind:this={inputEl}
				{id}
				class="text-input"
				{type}
				{min}
				{max}
				{step}
				bind:value
				{placeholder}
				{disabled}
				oninput={handleInput}
				onfocus={handleFocus}
				onblur={handleBlur}
				onkeydown={handleKeydown}
				ondrop={collectUrls ? handleDrop : undefined}
				onpaste={collectUrls ? handlePaste : undefined}
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
			{max}
			{step}
			bind:value
			{placeholder}
			{disabled}
			oninput={handleInput}
			onfocus={handleFocus}
			onblur={handleBlur}
			onkeydown={handleKeydown}
			ondrop={collectUrls ? handleDrop : undefined}
			onpaste={collectUrls ? handlePaste : undefined}
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
		{max}
		{step}
		bind:value
		{placeholder}
		{disabled}
		oninput={handleInput}
		onfocus={handleFocus}
		onblur={handleBlur}
		onkeydown={handleKeydown}
		ondrop={collectUrls ? handleDrop : undefined}
		onpaste={collectUrls ? handlePaste : undefined}
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

	/* Hide the number input spinner (WebKit/Blink, incl. WebKitGTK on Linux) */
	.text-input[type='number']::-webkit-outer-spin-button,
	.text-input[type='number']::-webkit-inner-spin-button {
		-webkit-appearance: none;
		appearance: none;
		margin: 0;
	}

	/* Hide the number input spinner (Firefox / standard) */
	.text-input[type='number'] {
		-moz-appearance: textfield;
		appearance: textfield;
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
