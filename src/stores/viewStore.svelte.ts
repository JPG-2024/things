import type { PlayerMode } from '@/lib/ttsPlayerConfig';
import { getYouTubeThumbnailUrl } from '@/lib/utils/youtube';
import { isoDateDaysAgo } from '@/lib/utils/date';
import type { WebStoreCategoryRecord } from '@/stores/webStore';
import type { WheelSelection } from '@/components/modals/VoiceProfileWheel.svelte';
import type { Voice, VoiceProfile } from '@/lib/utils/ttsService';

type language = 'en' | 'es' | 'fr' | 'de' | 'pt' | 'it' | 'ja';

export const DEFAULT_PRIMARY_COLOR = 'rgb(170, 255, 187)';
export const DEFAULT_BG_COLOR = 'rgb(155, 93, 194)';

export const PROFILE_ARTICLE_TABS = [
	{ id: 'articles', label: 'Articles', icon: 'FileText' },
	{ id: 'categories', label: 'Categories', icon: 'Tags' },
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
	ttsPlayerMode = $state<PlayerMode>('mini');
	masonryLayoutIndex = $state(1);

	url = $state<string | null>(null);
	currentProfileId = $state<string | null>(null);
	hoveredProfileName = $state<string | null>(null);
	hoveredProfileId = $state<string | null>(null);
	hoveredPictureSrc = $state<string | null>(null);
	hoveredArticleUrl = $state<string | null>(null);

	messages = $state<Message[]>([]);

	aiProvider = $state<'llama' | 'openrouter'>('llama');
	aiUrl = $state<string>('');
	aiModel = $state('liquid/lfm-2.5-1.2b-thinking:free');

	primaryColor = $state(DEFAULT_PRIMARY_COLOR);
	backgroundColor = $state(DEFAULT_BG_COLOR);
	tintHue = $derived(rgbToHue(this.backgroundColor));
	primaryTintHue = $derived(rgbToHue(this.primaryColor));
	blur = $state(false);
	clipboardPollingEnabled = $state(false);
	clipboardTtsEnabled = $state(false);
	forceLanguageEnabled = $state(false);
	downloadTracksEnabled = $state(false);
	embeddingsEnabled = $state(false);
	embeddingsProcessed = $state(false);
	embeddingsLoading = $state(false);
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
			? new URL(this.url).hostname
			: this.isRawMode
				? 'raw-text'
				: null
	);

	activeProfileArticleTab = $state<'profiles' | 'articles' | 'categories'>('articles');
	showOnlyRawArticles = $state(false);
	onlyArticlesAfter = $state(isoDateDaysAgo(30));
	categories = $state<WebStoreCategoryRecord[]>([]);
	selectedCategories = $state<string[]>([]);
	unifiedFilter = $state('');

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

const DEFAULT_SELECTION: WheelSelection = {
	profileId: '',
	audioFile: '',
	randomChunk: false,
	synthParams: { numStep: 16, guidanceScale: 2.0, speed: 1.0, splitLevel: 1 },
	pauseSettings: { minGapMs: 0.4, maxGapMs: 1, betweenParagraphs: 1.5 }
};

class VoiceWheelState {
	open = $state(false);
	mode = $state<'main' | 'select'>('select');
	profiles = $state<VoiceProfile[]>([]);
	chunks = $state<Voice[]>([]);
	selection = $state<WheelSelection>({ ...DEFAULT_SELECTION });
	private _onCommit: ((sel: WheelSelection) => void) | null = null;
	private _onChunksChanged: (() => void) | undefined;

	openWheel(
		profiles: VoiceProfile[],
		chunks: Voice[],
		selection: WheelSelection,
		onCommit: (sel: WheelSelection) => void,
		onChunksChanged?: () => void,
		mode: 'main' | 'select' = 'select'
	) {
		this.profiles = profiles;
		this.chunks = chunks;
		this.selection = selection;
		this._onCommit = onCommit;
		this._onChunksChanged = onChunksChanged;
		this.mode = mode;
		this.open = true;
	}

	commit(sel: WheelSelection) {
		this._onCommit?.(sel);
	}

	close() {
		this.open = false;
	}

	get onChunksChanged(): (() => void) | undefined {
		return this._onChunksChanged;
	}
}

export const voiceWheelState = new VoiceWheelState();
