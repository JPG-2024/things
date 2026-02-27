import { appDataDir, join } from "@tauri-apps/api/path";
import { listenMarkdownFlowStatus } from "@/lib/listeners/markdownListener";
import { listenMetadataFlowStatus } from "@/lib/listeners/metadataListener";
import type { FlowStatusEvent, MarkdownPayload, MetadataPayload } from "@/lib/types/flowStatus";
import { getYouTubeThumbnailUrl } from "@/lib/utils/youtube";
import type { Chapter, ChapterCaption } from "@/lib/utils/youtube/joinCaptionsByChapters";
import type { ChapterSummaryItem } from "@/lib/utils/youtube/summarizeChapters";

type language = "en" | "es";

export interface Message {
	id?: number;
	chatId?: number;
	sender: string;
	content: string;
	createdAt?: string;
}

export interface SummaryState {
	summary: string;
	keypoints: string[];
	conclusion: string;
	title: string;
}

export interface YoutubeVideoInfo {
	title: string;
	channel: string;
	withChapters: boolean;
	chapters: Chapter[];
	chapterCaptions: ChapterCaption[];
	chapterSummaries: ChapterSummaryItem[];
	transcript: string;
}

class ViewState {
	// Primitive state
	language = $state<language>("en");
	primaryColor = $state<string>("");
	loading = $state(false);
	loaded = $state(false);
	showAllTasks = $state(false);

	url = $state<string | null>(null);
	prompt = $state<string | null>(null);

	articleId = $state<number | null>(null);
	mediaDirectory = $state<string | null>(null);
	mediaBasePath = $state<string>("");
	mainImage = $state<string>("");
	mainImageSrc = $state<string>("");
	metadataStatus = $state<FlowStatusEvent<MetadataPayload> | null>(null);
	markdownStatus = $state<FlowStatusEvent<MarkdownPayload> | null>(null);

	youtubeInfo = $state<YoutubeVideoInfo | null>(null);

	content = $state<string>("");
	summary = $state<string | null>(null);
	category = $state<string | null>(null);
	keypoints = $state<string[] | null>(null);
	questions = $state<string[] | null>(null);
	embeddings = $state<boolean>(false);

	messages = $state<Message[]>([]);

	// Derived state (computed values)
	markdownContent = $derived(this.markdownStatus?.data || "");
	metadataContent = $derived(this.metadataStatus?.data || {});

	domainUrl = $derived(this.url ? new URL(this.url).hostname : null);

	isYouTube = $derived(this.url ? new URL(this.url).hostname.includes("youtube.com") : false);

	ytVideoId = $derived(this.url ? new URL(this.url).searchParams.get("v") : null);

	ytThumbnailUrl = $derived(this.ytVideoId ? getYouTubeThumbnailUrl(this.ytVideoId, "high") : "");

	title = $derived(this.youtubeInfo?.title || this.metadataStatus?.data?.["og:title"] || "");

	description = $derived(this.metadataStatus?.data?.["description"] || "");

	async initMediaBasePath(): Promise<string | null> {
		try {
			const appData = await appDataDir();
			const mediaDir = await join(appData, "media");
			this.mediaBasePath = mediaDir;
			return mediaDir;
		} catch (err) {
			console.error("initMediaBasePath error", err);
			return null;
		}
	}

	// Methods
	cleanAllState() {
		this.url = null;
		this.metadataStatus = null;
		this.markdownStatus = null;
		this.content = "";
		this.articleId = null;
		this.summary = "";
		this.keypoints = [];
		this.questions = [];
		this.messages = [];
		this.mainImage = "";
		this.mainImageSrc = "";
		this.mediaDirectory = null;
		this.primaryColor = "";
		this.embeddings = false;
		this.youtubeInfo = {
			title: "",
			channel: "",
			withChapters: false,
			chapters: [],
			chapterCaptions: [],
			chapterSummaries: [],
			transcript: "",
		};
	}

	// State for listeners
	#initialized = false;
	#unsubs: Array<() => void> = [];

	async initFlowStatusListeners() {
		if (this.#initialized) return () => {};
		this.#initialized = true;

		const un1 = await listenMetadataFlowStatus((event) => {
			this.metadataStatus = event;
		});

		const un2 = await listenMarkdownFlowStatus((event) => {
			this.markdownStatus = event;
			if (event.status === "done") {
				this.content = event.data;
			}
		});

		this.#unsubs = [un1, un2];

		return () => {
			for (const u of this.#unsubs) {
				try {
					u();
				} catch {}
			}
			this.#unsubs = [];
			this.#initialized = false;
		};
	}

	getAllValues() {
		return {
			url: this.url,
			markdownContent: this.markdownContent,
			metadataContent: this.metadataContent,
			domainUrl: this.domainUrl,
			ytVideoId: this.ytVideoId,
			ytThumbnailUrl: this.ytThumbnailUrl,
			mainImage: this.mainImage,
			mainColor: this.primaryColor,
			title: this.title,
			description: this.description,
			articleId: this.articleId,
			summary: this.summary,
			ytTranscript: this.youtubeInfo?.transcript,
			messages: this.messages,
			content: this.content,
			category: this.category,
			mediaDirectory: this.mediaDirectory,
			primaryColor: this.primaryColor,
			embeddings: this.embeddings,
		};
	}

	setAllValues(article: any) {
		if (!article) return;

		const {
			url,
			id,
			category,
			mainImage,
			summary,
			content,
			mediaDirectory,
			metadataContent,
			markdownContent,
			primaryColor,
			embeddings,
		} = article;

		this.url = url ?? this.url;
		this.articleId = id ?? this.articleId;
		this.category = category ?? this.category;
		this.mainImage = mainImage ?? this.mainImage;
		this.summary = summary ?? this.summary;
		this.content = content ?? this.content;
		this.mediaDirectory = mediaDirectory ?? this.mediaDirectory;
		this.primaryColor = primaryColor ?? this.primaryColor;
		this.mainImageSrc = article.mainImageSrc ?? this.mainImageSrc;
		this.embeddings = Boolean(article.embeddings) ?? this.embeddings;

		if (metadataContent) {
			this.metadataStatus = { data: metadataContent } as FlowStatusEvent<MetadataPayload>;
		}
		if (markdownContent) {
			this.markdownStatus = { data: markdownContent } as FlowStatusEvent<MarkdownPayload>;
		}
	}
}

// Export single instance
export const viewState = new ViewState();
