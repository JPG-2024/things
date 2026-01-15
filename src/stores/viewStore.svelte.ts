import { listenMetadataFlowStatus } from "@/lib/listeners/metadataListener";
import { listenMarkdownFlowStatus } from "@/lib/listeners/markdownListener";
import type { FlowStatusEvent, MetadataPayload, MarkdownPayload } from "@/lib/types/flowStatus";
import { getYouTubeThumbnailUrl } from '@/lib/utils/youtube';
import { appDataDir, join } from '@tauri-apps/api/path';

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

class ViewState {
  // Primitive state
  loading = $state(false);
  loaded = $state(false);

  url = $state<string | null>(null);
  prompt = $state<string | null>(null);

  mediaDirectory = $state<string | null>(null);
  articleId = $state<number | null>(null);
  category = $state<string | null>(null);
  content = $state<string>("");
  summary = $state<SummaryState | null>(null);
  block1 = $state<string>("");
  block2 = $state<string>("");
  embeddings = $state<boolean>(false);
  ytTranscript = $state<string | null>(null);
  messages = $state<Message[]>([]);

  mediaBasePath = $state<string>('');
  mainImage = $state<string>('');
  mainImageSrc = $state<string>('');

  primaryColor = $state<string>('');
  
  metadataStatus = $state<FlowStatusEvent<MetadataPayload> | null>(null);
  markdownStatus = $state<FlowStatusEvent<MarkdownPayload> | null>(null);

  // Derived state (computed values)
  markdownContent = $derived(this.markdownStatus?.data || "");
  metadataContent = $derived(this.metadataStatus?.data || {});

  domainUrl = $derived(
    this.url ? new URL(this.url).hostname : null
  );
  
  isYouTube = $derived(
    this.url ? new URL(this.url).hostname.includes('youtube.com') : false
  );
  
  ytVideoId = $derived(
    this.url ? new URL(this.url).searchParams.get('v') : null
  );
  
  ytThumbnailUrl = $derived(
    this.ytVideoId ? getYouTubeThumbnailUrl(this.ytVideoId, 'high') : ''
  );
  
  title = $derived(
    this.metadataStatus?.data?.["og:title"] || ""
  );
  
  description = $derived(
    this.metadataStatus?.data?.["description"] || ""
  );

  async initMediaBasePath(): Promise<string | null> {
    try {
      const appData = await appDataDir();
      const mediaDir = await join(appData, 'media');
      this.mediaBasePath = mediaDir;
      return mediaDir;
    } catch (err) {
      console.error('initMediaBasePath error', err);
      return null;
    }
  }

  // Methods
  cleanAllState() {
    this.url = null;
    this.metadataStatus = null;
    this.markdownStatus = null;
    this.content = '';
    this.articleId = null;
    this.summary = '';
    this.block1 = '';
    this.block2 = '';
    this.ytTranscript = null;
    this.messages = [];
    this.mainImage = '';
    this.mainImageSrc = '';
    this.mediaDirectory = null;
    this.primaryColor = '';
    this.embeddings = false;
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
      if (event.status === 'done') {
        this.content = event.data;
      }
    });

    this.#unsubs = [un1, un2];

    return () => {
      for (const u of this.#unsubs) {
        try { u(); } catch {}
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
      title: this.title,
      description: this.description,
      articleId: this.articleId,
      summary: this.summary,
      ytTranscript: this.ytTranscript,
      messages: this.messages,
      content: this.content,
      category: this.category,
      mediaDirectory: this.mediaDirectory,
      primaryColor: this.primaryColor,
      embeddings: this.embeddings
    };
  }

  setAllValues(article: any) {
    if (!article) return;

    const {
      url, id, category, mainImage, summary, content, mediaDirectory,
      metadataContent, markdownContent, primaryColor, embeddings
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