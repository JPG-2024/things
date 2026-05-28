import { getYouTubeThumbnailUrl } from '@/lib/utils/youtube';

type language = 'en' | 'es';

export const DEFAULT_PRIMARY_COLOR = 'rgb(250, 228, 192)';

class ViewState {
	language = $state<language>('es');
	loading = $state(false);
	loaded = $state(false);
	showAllTasks = $state(false);

	modalSettingVisible = $state(false);

	url = $state<string | null>(null);
	hoveredProfileName = $state<string | null>(null);
	hoveredProfileId = $state<string | null>(null);
	hoveredArticleUrl = $state<string | null>(null);

	messages = $state<Message[]>([]);

	aiProvider = $state<'llama' | 'openrouter'>('llama');
	openrouterModel = $state('openai/gpt-oss-20b:free');

	primaryColor = $state(DEFAULT_PRIMARY_COLOR);
	clipboardPollingEnabled = $state(true);
	urlQueue = $state<string[]>([]);
	maxUrlQueueSize = $state(10);
	lastHandledClipboardUrl = $state('');

	domainUrl = $derived(this.url ? new URL(this.url).hostname : null);

	isYouTube = $derived(this.url ? new URL(this.url).hostname.includes('youtube.com') : false);

	ytVideoId = $derived(this.url ? new URL(this.url).searchParams.get('v') : null);

	ytThumbnailUrl = $derived(this.ytVideoId ? getYouTubeThumbnailUrl(this.ytVideoId, 'high') : '');
}

export interface Message {
	id?: number;
	chatId?: number;
	sender: string;
	content: string;
	createdAt?: string;
}

export const viewState = new ViewState();
