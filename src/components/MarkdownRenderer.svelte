<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import MarkdownIt from 'markdown-it';
	import { ttsState } from '@/stores/ttsStore.svelte';
	import { viewState } from '@/stores/viewStore.svelte';
	import { loadingStore } from '@/stores/loadingStore.svelte';
	import { errorStore } from '@/stores/errorStore.svelte';
	import { LANG_NAMES } from '@/constants';
	import { translateMarkdown } from '@/lib/utils/inference/translation';
	import Icon from './Icon.svelte';
	import SearchDropdown from './inputs/SearchDropdown.component.svelte';

	interface Props {
		content?: string | null;
		/** CSS font-size del contenedor. Un número se interpreta como rem. */
		fontSize?: string | number;
		/** Shows the language picker: local translation only, never changes the app language. */
		translatable?: boolean;
	}

	export type MarkdownRendererProps = Props;

	let { content, fontSize, translatable = false }: Props = $props();

	/**
	 * Explicit override only. When undefined the container falls back to
	 * `--markdown-font-size` (mirrored app-wide from Settings → Reading in
	 * `+layout.svelte`), then to the local `0.8rem` in the stylesheet.
	 */
	const resolvedFontSize = $derived(
		fontSize == null ? undefined : typeof fontSize === 'number' ? `${fontSize}rem` : fontSize
	);

	let container: HTMLDivElement | undefined = $state();
	/** Id stamped on the container so the pointer tracker can find this block. */
	let targetId: string | null = $state(null);

	/**
	 * Text handed to TTS: prefer what is actually rendered (clean prose, real
	 * paragraph breaks, collapsed blocks left out), falling back to the markdown
	 * source when the container is not laid out. Reads the translated text too,
	 * since it lives in the same container.
	 */
	function readTargetText(): string {
		const rendered = container?.innerText?.trim();
		if (rendered) return rendered;
		return (content ?? '').trim();
	}

	// Make this block speakable while it is under the pointer.
	onMount(() => {
		const id = ttsState.registerTarget(readTargetText);
		targetId = id;
		return () => {
			ttsState.unregisterTarget(id);
			translateSession++;
			translateAbort?.abort();
			loadingStore.remove(`translate:${id}`);
		};
	});

	// Initialize markdown-it
	const md = new MarkdownIt({
		html: false,
		linkify: true,
		typographer: true,
		breaks: true
	});

	function preprocessContent(text: string): string {
		return text.replace(/\\n/g, '\n').replace(/\\"/g, '"');
	}

	/* Local translation: per-block state, seeded from the app language.
	 * `viewState.language` is never written — picking it means "original". */
	let targetLang = $state<string>(viewState.language);
	let translatedContent = $state<string | null>(null);
	let translating = $state(false);
	// Guards against stale results when a run is superseded mid-flight.
	let translateSession = 0;
	let translateAbort: AbortController | null = null;

	const languageOptions = Object.entries(LANG_NAMES).map(([value, label]) => ({ label, value }));

	const displayContent = $derived(translatedContent ?? content);

	/** Supersedes any in-flight run and clears its float entry. */
	function cancelTranslation() {
		translateSession++;
		translateAbort?.abort();
		translateAbort = null;
		translating = false;
		loadingStore.remove(`translate:${targetId}`);
	}

	async function handleLanguageSelect(option: { value: string }) {
		targetLang = option.value;
		if (option.value === viewState.language) {
			cancelTranslation();
			translatedContent = null;
			return;
		}

		const source = preprocessContent(content ?? '');
		if (!source.trim()) return;

		const session = ++translateSession;
		translateAbort?.abort();
		const abort = new AbortController();
		translateAbort = abort;
		translating = true;

		const entryId = `translate:${targetId}`;
		loadingStore.start(entryId, {
			source: 'frontend',
			module: 'inference',
			label: `Translate → ${LANG_NAMES[option.value] ?? option.value}`,
			message: 'Translating…'
		});

		try {
			const result = await translateMarkdown(source, option.value, {
				signal: abort.signal,
				onProgress: (done, total) => {
					if (session !== translateSession || total <= 1) return;
					loadingStore.update(entryId, {
						progress: { done, total },
						message: `Window ${done}/${total}`
					});
				}
			});
			if (session !== translateSession) return;
			translatedContent = result;
			loadingStore.finish(entryId);
		} catch (error) {
			// A superseded run no longer owns the float entry.
			if (session !== translateSession) return;
			if (error instanceof Error && error.name === 'AbortError') {
				loadingStore.remove(entryId);
				return;
			}
			loadingStore.fail(entryId, error instanceof Error ? error.message : String(error));
			errorStore.report(error, {
				feature: 'inference',
				userMessage: 'Translation failed. Showing the original text.',
				context: { language: option.value }
			});
		} finally {
			if (session === translateSession) {
				translating = false;
				translateAbort = null;
			}
		}
	}

	// A new body (or a new app language) invalidates the local translation.
	$effect(() => {
		void content;
		void viewState.language;
		// loadingStore's SvelteMaps are reactive: reading them here would make
		// the run's own start() re-trigger this reset and abort the translation.
		untrack(() => {
			cancelTranslation();
			translatedContent = null;
			targetLang = viewState.language;
		});
	});
</script>

{#snippet markdownBody()}
	<!-- inline font-size only when the `fontSize` prop is passed -->
	<div
		class="markdown-container"
		style:font-size={resolvedFontSize}
		data-tts-target={targetId}
		bind:this={container}
	>
		{@html md.render(preprocessContent(displayContent ?? ''))}
	</div>
{/snippet}

{#if content}
	{#if translatable}
		<div class="markdown-wrapper">
			<div class="translate-picker">
				<SearchDropdown
					value={targetLang}
					options={languageOptions}
					capitalize={false}
					placeholder="Language"
					searchPlaceholder="Search language..."
					onSelect={handleLanguageSelect}
				>
					{#snippet trigger()}
						<Icon
							name={translating ? 'LoaderCircle' : 'Languages'}
							size={18}
							color={translatedContent ? 'var(--primary-color)' : 'var(--gray-200)'}
							class={translating ? 'spin' : undefined}
							tooltipProps={{ content: translating ? 'Translating…' : 'Translate content' }}
						/>
					{/snippet}
				</SearchDropdown>
			</div>
			{@render markdownBody()}
		</div>
	{:else}
		{@render markdownBody()}
	{/if}
{/if}

<style>
	.markdown-wrapper {
		position: relative;
		width: 100%;
	}

	.translate-picker {
		position: absolute;
		top: 0;
		right: 0;
		z-index: 5;
	}

	/* The trigger sits at the right edge: open the panel leftward so it stays
	 * inside the content column (the icon-trigger default opens rightward). */
	.translate-picker :global(.search-dropdown.icon-trigger .panel) {
		left: auto;
		right: 0;
	}

	.translate-picker :global(.spin) {
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.markdown-container {
		display: flex;
		flex-direction: column;
		width: 100%;
		color: #fafafa;
		text-align: left;
		word-wrap: break-word;
		overflow-wrap: break-word;
		/* Order of precedence: inline `fontSize` prop > `--markdown-font-size`
		 * set by an ancestor (mirrored app-wide in `+layout.svelte`) > this
		 * fallback. Inner rules that carry their own size use `em` so they
		 * scale with the container. */
		font-size: var(--markdown-font-size, 0.8rem);
	}

	.markdown-container :global(thead th) {
		background-color: var(--gray-800);
		color: var(--gray-200);
	}
	.markdown-container :global(h1),
	.markdown-container :global(h2),
	.markdown-container :global(h3),
	.markdown-container :global(h4),
	.markdown-container :global(h5),
	.markdown-container :global(h6) {
		font-weight: bold;
		color: var(--primary-color);
	}

	.markdown-container :global(h1) {
		font-family: var(--font-secondary);
		/* em so it tracks the container (was 0.9rem on a 0.8rem base). */
		font-size: 1.125em;
		padding-top: 2rem;
		padding-bottom: 1.2rem;
	}

	.markdown-container :global(h2) {
		font-family: var(--font-secondary);
		/* em so it tracks the container (was 0.9rem on a 0.8rem base). */
		font-size: 1.1em;
		padding-top: 2rem;
		padding-bottom: 1.2rem;
		text-decoration: underline;
	}

	.markdown-container :global(h3) {
		font-family: var(--font-secondary);
		/* em so it tracks the container (was 0.9rem on a 0.8rem base). */
		font-size: 1em;
		padding-top: 2rem;
		padding-bottom: 1.2rem;
	}

	.markdown-container :global(p) {
		font-family: var(--font-secondary);
		color: var(--gray-200);
		line-height: 2.2;
	}

	.markdown-container :global(code) {
		border-radius: var(--radius-sm);
		padding: 2px 6px;
		color: var(--primary-color);
		font-size: 1.2em;
	}

	.markdown-container :global(pre) {
		margin-bottom: 2.5rem;
		margin-top: 1rem;
		border-radius: var(--radius-sm);
		border: 2px solid var(--gray-700);
		padding: 0.6rem 1rem;
		overflow-x: auto;
		border-style: dashed;
	}

	.markdown-container :global(hr) {
		color: red;
		border: 3px solid var(--gray-700);
		border-style: dashed;
		margin: 2rem;
	}

	.markdown-container :global(pre code) {
		border-radius: 0;
		background-color: transparent;

		padding: 0;
		margin: 2rem 0;
		white-space: pre-wrap;
		word-wrap: break-word;
		overflow-wrap: break-word;
		font-size: 1.2em;
	}

	.markdown-container :global(a) {
		text-decoration: underline;
	}

	.markdown-container :global(ul),
	.markdown-container :global(ol) {
		margin: 1rem 0 1rem 2rem;
		padding: 0 1rem;
		color: var(--gray-200);
	}

	.markdown-container :global(ul) {
		margin-left: 1.714rem;
		color: var(--gray-200);
	}

	.markdown-container :global(li) {
		color: var(--gray-200);
		padding: 0.2rem 0;
		font-family: var(--font-secondary);
		list-style-type: square;
		line-height: 2.1;
	}

	.markdown-container :global(li::marker) {
		color: var(--bg-color);
	}

	.markdown-container :global(blockquote) {
		margin: 1rem 0;
		padding-left: 1rem;
		color: #d0d0d0;
		font-style: italic;
	}

	.markdown-container :global(strong) {
		color: white;
		font-weight: bold;
	}

	.markdown-container :global(em) {
		font-style: italic;
	}

	.markdown-container :global(img) {
		margin: 1em 0;
		border-radius: var(--radius-md);
		height: auto;
	}

	.markdown-container :global(table) {
		margin: 1em 0;
		border-collapse: collapse;
		width: 100%;
	}

	.markdown-container :global(th),
	.markdown-container :global(td) {
		border: 1px solid var(--gray-800);
		padding: 10px;
		text-align: left;
		font-family: var(--font-secondary);
		color: var(--gray-300);
	}

	.markdown-container :global(th) {
		font-family: var(--font-secondary);
		font-weight: bold;
	}
</style>
