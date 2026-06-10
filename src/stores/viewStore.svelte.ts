import { getYouTubeThumbnailUrl } from '@/lib/utils/youtube';

type language = 'en' | 'es';

export const DEFAULT_PRIMARY_COLOR = 'rgb(250, 228, 192)';

class ViewState {
	language = $state<language>('es');
	loading = $state(false);
	loaded = $state(false);
	subStatus = $state<string | null>(null);
	showAllTasks = $state(false);
	collapseProfiles = $state(true);

	url = $state<string | null>(null);
	hoveredProfileName = $state<string | null>(null);
	hoveredProfileId = $state<string | null>(null);
	hoveredPictureSrc = $state<string | null>(null);
	hoveredArticleUrl = $state<string | null>(null);

	messages = $state<Message[]>([]);

	aiProvider = $state<'llama' | 'openrouter'>('llama');
	aiUrl = $state<string>('');
	aiModel = $state('liquid/lfm-2.5-1.2b-thinking:free');

	primaryColor = $state(DEFAULT_PRIMARY_COLOR);
	clipboardPollingEnabled = $state(true);
	urlQueue = $state<string[]>([]);
	maxUrlQueueSize = $state(10);
	lastHandledClipboardUrl = $state('');

	domainUrl = $derived(this.url ? new URL(this.url).hostname : null);

	isYouTube = $derived(this.url ? new URL(this.url).hostname.includes('youtube.com') : false);

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
