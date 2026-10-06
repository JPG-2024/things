import { getYouTubeThumbnailUrl } from '@/lib/utils/youtube';
import { isoDateDaysAgo } from '@/lib/utils/date';
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
	{ key: 'row', columns: 1, contentMode: 'both', padding: '0.6rem', rowHeight: 50 },
	{ key: 'grid', columns: 5, contentMode: 'thumbnail', padding: '1rem 1.5rem' },
	/* { key: 'grid', columns: 3, contentMode: 'thumbnail', padding: '1.5rem 2rem' }, */
	{ key: 'grid-3', columns: 3, contentMode: 'both', padding: '2rem 3rem' }
];

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
	{ id: 'articles', label: 'Articles', icon: 'FileText' },
	{ id: 'categories', label: 'Categories', icon: 'Tags' },
	{ id: 'domains', label: 'Domains', icon: 'Globe' },
	{ id: 'profiles', label: 'Profiles', icon: 'Users' }
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

	get masonryPreset(): MasonryPreset {
		return MASONRY_PRESETS[this.masonryArticlesPresetIndex] ?? MASONRY_PRESETS[0];
	}

	get masonryArticlesContentMode(): ArticleContentMode {
		return this.masonryPreset.contentMode;
	}

	url = $state<string | null>(null);
	currentProfileId = $state<string | null>(null);
	activeArticleProfileId = $state<string | null>(null);
	hoveredProfileName = $state<string | null>(null);
	hoveredProfileId = $state<string | null>(null);
	hoveredPictureSrc = $state<string | null>(null);
	hoveredArticleUrl = $state<string | null>(null);

	messages = $state<Message[]>([]);

	aiProvider = $state<'llama' | 'openrouter'>('llama');
	aiUrl = $state<string>('');
	aiModel = $state('liquid/lfm-2.5-1.2b-thinking:free');

	llamaModelsDir = $state<string>('');
	llamaInferenceModel = $state<string>('');
	llamaInferencePort = $state(envPort(ENV_LLAMA_URL, 8080));
	llamaEmbeddingsModel = $state<string>('');
	llamaEmbeddingsPort = $state(envPort(ENV_EMBEDDINGS_URL, 8083));
	llamaBaseUrl = $derived(`http://127.0.0.1:${this.llamaInferencePort}`);
	embeddingsBaseUrl = $derived(`http://127.0.0.1:${this.llamaEmbeddingsPort}`);

	primaryColor = $state(DEFAULT_PRIMARY_COLOR);
	backgroundColor = $state(DEFAULT_BG_COLOR);
	tintHue = $derived(rgbToHue(this.backgroundColor));
	primaryTintHue = $derived(rgbToHue(this.primaryColor));
	blur = $state(false);
	clipboardPollingEnabled = $state(false);
	clipboardTtsEnabled = $state(false);
	forceLanguageEnabled = $state(false);
	downloadTracksEnabled = $state(false);
	thumbnailReductionMagnitud = $state(2);
	embeddingsEnabled = $state(false);
	embeddingsProcessed = $state(false);
	embeddingsLoading = $state(false);
	embeddingsServiceUp = $state(false);
	inferenceServiceUp = $state(false);
	llamaServersStatus = $state<LlamaServerStatus[]>([]);
	categoryTopN = $state(1);
	categoryMinSimilarity = $state(0.35);
	autoSpeechEnabled = $state(false);
	isCachedArticle = $state(false);
	urlQueue = $state<string[]>([]);
	maxUrlQueueSize = $state(100);
	lastHandledClipboardUrl = $state('');
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
	onlyArticlesAfter = $state(isoDateDaysAgo(30));
	categories = $state<WebStoreCategoryRecord[]>([]);
	unifiedFilter = $state('');
	rawSearchResults: RawSearchResult[] | null = $state(null);
	rawSearchLoading = $state(false);
	rawSearchContextChars = $state(200);

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
}

export interface Message {
	id?: number;
	chatId?: number;
	sender: string;
	content: string;
	createdAt?: string;
}

export const viewState = new ViewState();

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
