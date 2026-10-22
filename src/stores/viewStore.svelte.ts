import { getYouTubeThumbnailUrl } from '@/lib/utils/youtube';
import { isoDateDaysAgo } from '@/lib/utils/date';
import { CARD_LAYOUT_DEFAULTS, type CardLayout, type CardTab } from '@/constants';
import { clampCardLayout } from '@/lib/utils/cardLayout';
import { DEFAULT_ANALYSIS_DEPTH } from '@/runners/shared/analysisConstants';
import type { DefaultAnalysisKind } from '@/runners/shared/sharedTasks';
import { getProfiles } from '@/stores/webStore';
import type { ArticleWithTasks, WebStoreCategoryRecord } from '@/stores/webStore';
import type { LlamaServerStatus } from '@/lib/utils/llamaModels';

export interface RawSearchMatch {
	before: string;
	matchText: string;
	after: string;
}

export interface RawSearchResult {
	article: ArticleWithTasks;
	match: RawSearchMatch;
}

export type ArticleContentMode = 'both' | 'thumbnail' | 'title';

export type LayoutKey = 'row' | 'grid-3' | 'grid';

export interface MasonryPreset {
	key: LayoutKey;
	columns: number;
	contentMode: ArticleContentMode;
	padding: string;
	rowHeight?: number;
}

// Ordered presets switched with ArrowUp/ArrowDown over the article grids.
// `key` selects the visual style rendered by ArticleItem, `columns` is a
// responsive target (clamped down on narrow windows), and `contentMode`
// decides whether images/text are shown.
export const MASONRY_PRESETS: MasonryPreset[] = [
	{ key: 'grid', columns: 6, contentMode: 'thumbnail', padding: '1rem 2rem' },
	{ key: 'row', columns: 1, contentMode: 'both', padding: '0.6rem', rowHeight: 80 },
	/* { key: 'grid', columns: 3, contentMode: 'thumbnail', padding: '1.5rem 2rem' }, */
	{ key: 'grid-3', columns: 3, contentMode: 'both', padding: '2rem 3rem' }
];

// Icon and label per preset for the vertical preset rail in ArticleList. Keyed
// by LayoutKey since presets can share a key; tabs are identified by index.
export const MASONRY_PRESET_ICONS: Record<LayoutKey, string> = {
	row: 'LayoutList',
	grid: 'LayoutGrid',
	'grid-3': 'Square'
};

export const MASONRY_PRESET_LABELS: Record<LayoutKey, string> = {
	row: 'Row',
	grid: 'Thumbnails',
	'grid-3': 'Grid 3'
};

type language = 'en' | 'es' | 'fr' | 'de' | 'pt' | 'it' | 'ja';

export const DEFAULT_PRIMARY_COLOR = 'rgb(255, 255, 255)';
export const DEFAULT_BG_COLOR = 'rgb(155, 93, 194)';

const ENV_LLAMA_URL = import.meta.env.VITE_LLAMA_URL ?? 'http://127.0.0.1:8080';
const ENV_EMBEDDINGS_URL = import.meta.env.VITE_EMBEDDINGS_URL ?? 'http://127.0.0.1:8083';

function envPort(url: string, fallback: number): number {
	try {
		const port = new URL(url).port;
		return port ? Number(port) : fallback;
	} catch {
		return fallback;
	}
}

export const PROFILE_ARTICLE_TABS = [
	{ id: 'articles', label: 'Articles', icon: 'LayoutGrid' },
	{ id: 'profiles', label: 'Profiles', icon: 'Users' },
	{ id: 'domains', label: 'Domains', icon: 'Globe' },
	{ id: 'categories', label: 'Categories', icon: 'Tags' }
];

export function rgbToHue(rgb: string): number {
	const match = rgb.match(/(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
	if (!match) return 0;
	const r = +match[1] / 255;
	const g = +match[2] / 255;
	const b = +match[3] / 255;
	const max = Math.max(r, g, b);
	const min = Math.min(r, g, b);
	const delta = max - min;
	if (delta === 0) return 0;
	let hue: number;
	if (max === r) hue = ((g - b) / delta) % 6;
	else if (max === g) hue = (b - r) / delta + 2;
	else hue = (r - g) / delta + 4;
	hue *= 60;
	return hue < 0 ? hue + 360 : hue;
}

class ViewState {
	language = $state<language>('es');
	loading = $state(false);
	loaded = $state(false);
	processingUrl = $state(false);
	subStatus = $state<string | null>(null);
	showAllTasks = $state(false);
	collapseProfiles = $state(false);
	selectedTaskId = $state('title-summary');
	masonryArticlesPresetIndex = $state(0);
	cardLayout = $state<Record<CardTab, CardLayout>>({
		profiles: { ...CARD_LAYOUT_DEFAULTS.profiles },
		domains: { ...CARD_LAYOUT_DEFAULTS.domains },
		categories: { ...CARD_LAYOUT_DEFAULTS.categories }
	});

	/** Updates one tab's card layout, clamped onto its bounds. */
	setCardLayout(tab: CardTab, patch: Partial<CardLayout>): void {
		this.cardLayout[tab] = clampCardLayout({ ...this.cardLayout[tab], ...patch });
	}

	get masonryPreset(): MasonryPreset {
		return MASONRY_PRESETS[this.masonryArticlesPresetIndex] ?? MASONRY_PRESETS[0];
	}

	get masonryArticlesContentMode(): ArticleContentMode {
		return this.masonryPreset.contentMode;
	}

	url = $state<string | null>(null);
	currentProfileId = $state<string | null>(null);
	hoveredProfileName = $state<string | null>(null);
	hoveredProfileId = $state<string | null>(null);
	hoveredPictureSrc = $state<string | null>(null);
	hoveredArticleUrl = $state<string | null>(null);
	// true mientras hay un overlay modal/drawer/modo a pantalla completa. Lo
	// mantiene `+layout.svelte` desde su `blurActive`; los hotkeys de componentes
	// lo consultan para no dispararse por debajo de un overlay.
	overlayOpen = $state(false);

	messages = $state<Message[]>([]);

	aiProvider = $state<'llama' | 'openrouter'>('llama');
	aiUrl = $state<string>('');
	aiModel = $state('liquid/lfm-2.5-1.2b-thinking:free');

	llamaModelsDir = $state<string>('');
	llamaInferenceModel = $state<string>('');
	llamaInferencePort = $state(envPort(ENV_LLAMA_URL, 8080));
	// llama-server memory tuning: context window in tokens and prompt-cache
	// budget in MiB. Both only take effect when a server (re)starts.
	llamaInferenceCtxSize = $state(32768);
	llamaCacheRamMb = $state(1024);
	// Whether the inference server allows/emits thinking (`--reasoning on|off`).
	// Only takes effect when the server (re)starts.
	llamaReasoning = $state(false);
	llamaEmbeddingsModel = $state<string>('');
	llamaEmbeddingsPort = $state(envPort(ENV_EMBEDDINGS_URL, 8083));
	llamaAutoStart = $state(true);
	llamaBaseUrl = $derived(`http://127.0.0.1:${this.llamaInferencePort}`);
	embeddingsBaseUrl = $derived(`http://127.0.0.1:${this.llamaEmbeddingsPort}`);

	primaryColor = $state(DEFAULT_PRIMARY_COLOR);
	backgroundColor = $state(DEFAULT_BG_COLOR);
	tintHue = $derived(rgbToHue(this.backgroundColor));
	primaryTintHue = $derived(rgbToHue(this.primaryColor));
	blur = $state(false);
	clipboardTtsEnabled = $state(false);
	forceLanguageEnabled = $state(false);
	thumbnailReductionMagnitud = $state(2);
	embeddingsEnabled = $state(false);
	embeddingsProcessed = $state(false);
	embeddingsLoading = $state(false);
	embeddingsServiceUp = $state(false);
	inferenceServiceUp = $state(false);
	scrapServiceUp = $state(false);
	ttsServiceUp = $state(false);
	whisperServiceUp = $state(false);
	llamaServersStatus = $state<LlamaServerStatus[]>([]);
	categoryTopN = $state(1);
	// Starting depth for new topic-analysis tasks (see ANALYSIS_DEPTH_LEVELS);
	// tasks already persisted keep their own depth.
	analysisDepth = $state(DEFAULT_ANALYSIS_DEPTH);
	// Default processor for newly created analysis tasks; tasks already
	// persisted keep their own processor type.
	analysisKind = $state<DefaultAnalysisKind>('windowSummary');
	// Both sides of the category comparison are now `topics + keywords`
	// embeddings (query and fed exemplars), so the threshold sits higher than
	// the old name/description-vs-document value of 0.35.
	categoryMinSimilarity = $state(0.5);
	// Minimum top1-top2 similarity gap required to assign a category. Below it
	// the result is ambiguous and nothing is assigned.
	categoryMargin = $state(0.05);
	autoSpeechEnabled = $state(false);
	isCachedArticle = $state(false);
	urlQueue = $state<string[]>([]);
	maxUrlQueueSize = $state(100);
	conversationSystemPrompt = $state(
		`You are a concise conversational assistant.
		
		Rules:
			- Response in spanish.
			- Never acknowledge the request with phrases like: "Sure" "Of course" "Here's what you asked for" "I'd be happy to" "Certainly".
			- Do not apologize unless necessary.
			- Do not add introductions or conclusions.
			- Begin immediately with the requested content.
			- Use natural spoken language, avoid markdown formatting.
		 `
	);
	conversationExtraUserPrompt = $state('');
	conversationTemperature = $state(1);
	conversationMaxTokens = $state(5000);
	conversationTopP = $state(1);
	conversationFrequencyPenalty = $state(0);
	conversationPresencePenalty = $state(0);

	isRawMode = $derived(this.url?.startsWith('raw-') ?? false);

	domainUrl = $derived(
		this.url && /^https?:\/\//.test(this.url)
			? new URL(this.url).hostname.replace(/^www\./i, '')
			: this.isRawMode
				? 'raw-text'
				: null
	);

	activeProfileArticleTab = $state<'profiles' | 'articles' | 'categories' | 'domains'>('articles');
	showOnlyRawArticles = $state(false);
	showOnlyInitialArticles = $state(false);
	/** Groups the articles grid into per-profile stack cells (Alt+G). */
	groupArticlesByProfile = $state(true);
	onlyArticlesAfter = $state(isoDateDaysAgo(30));
	categories = $state<WebStoreCategoryRecord[]>([]);
	unifiedFilter = $state('');
	/**
	 * Term typed in the page search input. Copied into `unifiedFilter` (the
	 * value that drives filtering) only when the user presses Enter.
	 */
	unifiedFilterDraft = $state('');
	rawSearchResults: RawSearchResult[] | null = $state(null);
	rawSearchLoading = $state(false);
	rawSearchContextChars = $state(200);
	/** Pattern the raw search last ran for (single-flight guard, REN-5). */
	rawSearchLastPattern = $state('');

	isYouTube = $derived(
		this.url && /^https?:\/\//.test(this.url)
			? new URL(this.url).hostname.includes('youtube.com')
			: false
	);

	ytVideoId = $derived(this.url ? new URL(this.url).searchParams.get('v') : null);

	ytThumbnailUrl = $derived(this.ytVideoId ? getYouTubeThumbnailUrl(this.ytVideoId, 'high') : '');

	primaryColorAlpha(alpha: number): string {
		const match = this.backgroundColor.match(/\d+/g);
		if (!match || match.length < 3) return `rgba(255, 255, 255, ${alpha})`;
		return `rgba(${match[0]}, ${match[1]}, ${match[2]}, ${alpha})`;
	}

	/** Enter commits the typed search term into the filter that drives the UI. */
	commitUnifiedFilter(): void {
		this.unifiedFilter = this.unifiedFilterDraft;
	}

	/** Clears both the applied search filter and the typed draft. */
	clearUnifiedFilter(): void {
		this.unifiedFilter = '';
		this.unifiedFilterDraft = '';
	}
}

export interface Message {
	id?: number;
	chatId?: number;
	sender: string;
	content: string;
	createdAt?: string;
}

export const viewState = new ViewState();

/** Kinds of facet the article filters can hold. Keys double as state fields. */
export type ArticleFilterKind = 'profiles' | 'domains' | 'categories';

export interface ArticleFilterEntry {
	id: string;
	name: string;
}

/**
 * Global facet filters for the dashboard (ArticleFilters modal + EntityBar).
 * Semantics: OR within a kind, AND across kinds — mirrored by
 * `list_articles_without_profile` in Rust. Session-only: never persisted.
 */
class ArticleFiltersState {
	profiles = $state<ArticleFilterEntry[]>([]);
	domains = $state<ArticleFilterEntry[]>([]);
	categories = $state<ArticleFilterEntry[]>([]);
	/** Open state of the filters panel anchored under the page search input. */
	panelOpen = $state(false);
	/** In-flight opening, shared so concurrent triggers (F hotkey + search
	 * focus) re-warm the facet lists only once. */
	private openingPanel: Promise<void> | null = null;

	/**
	 * Opens the filters popup only after its facet lists are available, so it
	 * never shows a half-populated view. `getProfiles({ kind })` (full lists)
	 * is cached in webStore until the profiles cache is invalidated by a
	 * profile create/update/delete, so reopens resolve instantly.
	 */
	async openPanel(): Promise<void> {
		if (this.openingPanel) return this.openingPanel;
		if (this.panelOpen) return;
		this.openingPanel = (async () => {
			try {
				await Promise.all([getProfiles({ kind: 'profile' }), getProfiles({ kind: 'domain' })]);
				this.panelOpen = true;
			} finally {
				this.openingPanel = null;
			}
		})();
		return this.openingPanel;
	}

	get hasActive(): boolean {
		return this.profiles.length > 0 || this.domains.length > 0 || this.categories.length > 0;
	}

	/** Click semantics: selecting an active facet entry deselects it. */

	entries(kind: ArticleFilterKind): ArticleFilterEntry[] {
		return this[kind];
	}

	ids(kind: ArticleFilterKind): string[] {
		return this[kind].map((entry) => entry.id);
	}

	has(kind: ArticleFilterKind, id: string): boolean {
		return this[kind].some((entry) => entry.id === id);
	}

	/** Click semantics: selecting an active facet entry deselects it. */
	toggle(kind: ArticleFilterKind, id: string, name: string): void {
		const list = this[kind];
		const index = list.findIndex((entry) => entry.id === id);
		if (index >= 0) {
			list.splice(index, 1);
		} else {
			list.push({ id, name });
		}
	}

	/** Drops an id from every kind — used when the entity is deleted. */
	removeById(id: string): void {
		for (const kind of ['profiles', 'domains', 'categories'] as const) {
			const index = this[kind].findIndex((entry) => entry.id === id);
			if (index >= 0) this[kind].splice(index, 1);
		}
	}

	clear(): void {
		this.profiles = [];
		this.domains = [];
		this.categories = [];
	}
}

export const articleFilters = new ArticleFiltersState();

class DrawersState {
	drawers = $state<Record<string, boolean>>({});

	isOpen(name: string): boolean {
		return this.drawers[name] ?? false;
	}

	open(name: string) {
		this.drawers[name] = true;
	}

	close(name: string) {
		this.drawers[name] = false;
	}

	toggle(name: string) {
		this.drawers[name] = !this.drawers[name];
	}
}

export const drawersState = new DrawersState();

/**
 * Global open state for the TTS synthesis settings modal, so the toolbar button
 * and the `,` hotkey can reach it from anywhere.
 */
class VoiceSettingsState {
	ttsOpen = $state(false);

	openTts() {
		this.ttsOpen = true;
	}

	closeTts() {
		this.ttsOpen = false;
	}

	toggleTts() {
		this.ttsOpen = !this.ttsOpen;
	}
}

export const voiceSettingsState = new VoiceSettingsState();
