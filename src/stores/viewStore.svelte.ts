import type { PlayerMode } from '@/lib/ttsPlayerConfig';
import { getYouTubeThumbnailUrl } from '@/lib/utils/youtube';
import type { WebStoreCategoryRecord } from '@/stores/webStore';

type language = 'en' | 'es';

export const DEFAULT_PRIMARY_COLOR = 'rgba(255, 228, 140, 0.79)';

class ViewState {
	language = $state<language>('es');
	loading = $state(false);
	loaded = $state(false);
	processingUrl = $state(false);
	subStatus = $state<string | null>(null);
	showAllTasks = $state(false);
	collapseProfiles = $state(true);
	selectedTaskId = $state('title-summary');
	ttsPlayerMode = $state<PlayerMode>('full');

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
	blur = $state(false);
	clipboardPollingEnabled = $state(false);
	clipboardTtsEnabled = $state(false);
	forceLanguageEnabled = $state(false);
	downloadTracksEnabled = $state(false);
	enableTasksCollapse = $state(false);
	autoSpeechEnabled = $state(true);
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

	activeProfileArticleTab = $state<'profiles' | 'articles'>('articles');
	showOnlyRawArticles = $state(false);
	categories = $state<WebStoreCategoryRecord[]>([]);
	selectedCategories = $state<string[]>([]);

	isYouTube = $derived(
		this.url && /^https?:\/\//.test(this.url)
			? new URL(this.url).hostname.includes('youtube.com')
			: false
	);

	ytVideoId = $derived(this.url ? new URL(this.url).searchParams.get('v') : null);

	ytThumbnailUrl = $derived(this.ytVideoId ? getYouTubeThumbnailUrl(this.ytVideoId, 'high') : '');

	primaryColorAlpha(alpha: number): string {
		const match = this.primaryColor.match(/\d+/g);
		if (!match || match.length < 3) return `rgba(250, 228, 192, ${alpha})`;
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
