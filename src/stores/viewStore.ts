import { writable, derived, get } from "svelte/store";
import { listenMetadataFlowStatus } from "@/lib/listeners/metadataListener";
import { listenMarkdownFlowStatus } from "@/lib/listeners/markdownListener";
import type { FlowStatusEvent, MetadataPayload, MarkdownPayload } from "@/lib/types/flowStatus";
import {getYouTubeThumbnailUrl} from '@/lib/utils/youtube';



export const loading = writable(false);
export const loaded = writable(false);

export const url = writable<string | null>(null);
// Article id (sqlite rowid exposed as id)
export const articleId = writable<number | null>(null);

// Store para el estado de metadata
export const metadataStatus = writable<FlowStatusEvent<MetadataPayload> | null>(null);

// Store para el estado de markdown
export const markdownStatus = writable<FlowStatusEvent<MarkdownPayload> | null>(null);


export const markdownContent = derived(markdownStatus, ($markdownStatus) => {
  return $markdownStatus?.data || "";
});

export const content = writable<string>("");

export const metadataContent = derived(metadataStatus, ($metadataStatus) => {
  return $metadataStatus?.data || {};
});

export const summary = writable<string | null>(null);
export const ytTranscript = writable<string | null>(null);

// Store for chat messages
export interface Message {
  id?: number;
  chatId?: number;
  sender: string;
  content: string;
  createdAt?: string;
}

export const messages = writable<Message[]>([]);

export const domainUrl = derived(url, ($url) => 
  $url ? new URL($url).hostname : null
);

export const isYouTube = derived(url, ($url) => 
  $url ? new URL($url).hostname.includes('youtube.com') : false
);


export const ytVideoId = derived(url, ($url) => 
  $url ? new URL($url).searchParams.get('v') : null
);
export const ytThumbnailUrl = derived(ytVideoId, ($ytVideoId) =>
  $ytVideoId ? getYouTubeThumbnailUrl($ytVideoId, 'medium') : ''
);



// Derived store para la imagen principal
export const mainImage = derived(metadataStatus, ($metadataStatus) => {
  return $metadataStatus?.data?.["og:image"] || "";
});

export const title = derived(metadataStatus, ($metadataStatus) => {
  return $metadataStatus?.data?.["og:title"] || "";
});

export const description = derived(metadataStatus, ($metadataStatus) => {
  return $metadataStatus?.data?.["description"] || "";
});

// Método para limpiar todo el estado
export function cleanAllState() {
  metadataStatus.set(null);
  markdownStatus.set(null);
  content.set('');
  articleId.set(null);
  summary.set('');
}

// Idempotencia y cleanup
let initialized = false;
let unsubs: Array<() => void> = [];

// Inicializar listeners (debe ejecutarse en un componente con $effect)
export async function initFlowStatusListeners() {
  if (initialized) return () => {};
  initialized = true;

  const un1 = await listenMetadataFlowStatus((event) => {
    metadataStatus.set(event);
  });
  const un2 = await listenMarkdownFlowStatus((event) => {
    markdownStatus.set(event);
    if(event.status === 'done') {
      content.set(event.data);
    }
  });


  unsubs = [un1, un2];

  return () => {
    for (const u of unsubs) {
      try { u(); } catch {}
    }
    unsubs = [];
    initialized = false;
  };
}


export function getAllViewStoreValues() {
  return {
    url: get(url),
    markdownContent: get(markdownContent),
    metadataContent: get(metadataContent),
    domainUrl: get(domainUrl),
    ytVideoId: get(ytVideoId),
    ytThumbnailUrl: get(ytThumbnailUrl),
    mainImage: get(mainImage),
    title: get(title),
    description: get(description),
    articleId: get(articleId),
    summary: get(summary),
    ytTranscript: get(ytTranscript),
    messages: get(messages),
    content: get(content)
  };
}

// Function to restore all store values from a database article object
export function setAllViewStoreValues(article: any) {
  if (!article) return;

  url.set(article.url || null);

  if (article.id !== undefined) {
    articleId.set(article.id);
  }

  // Restore metadata status with the metadataContent object
  if (article.metadataContent) {
    metadataStatus.set({
      data: article.metadataContent,
    } as FlowStatusEvent<MetadataPayload>);
  }

  // Restore markdown status with the markdownContent string
  if (article.markdownContent) {
    markdownStatus.set({
      data: article.markdownContent,
    } as FlowStatusEvent<MarkdownPayload>);
  }

  // Restore summary
  if (article.summary) {
    summary.set(article.summary);
  }

  if (article.content) {
    content.set(article.content);}
}