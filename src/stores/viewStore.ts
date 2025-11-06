import { writable, derived, get } from "svelte/store";
import { listenMetadataFlowStatus } from "../lib/listeners/metadataListener";
import { listenMarkdownFlowStatus } from "../lib/listeners/markdownListener";
import type { FlowStatusEvent, MetadataPayload, MarkdownPayload } from "../lib/types/flowStatus";
import {getYouTubeThumbnailUrl} from '../lib/utils/youtube';


export const url = writable<string | null>(null);

// Store para el estado de metadata
export const metadataStatus = writable<FlowStatusEvent<MetadataPayload> | null>(null);

// Store para el estado de markdown
export const markdownStatus = writable<FlowStatusEvent<MarkdownPayload> | null>(null);


export const markdownContent = derived(markdownStatus, ($markdownStatus) => {
  return $markdownStatus?.data || "";
});

export const metadataContent = derived(metadataStatus, ($metadataStatus) => {
  return $metadataStatus?.data || {};
});

export const domainUrl = derived(url, ($url) => 
  $url ? new URL($url).hostname : null
);
export const ytVideoId = derived(url, ($url) => 
  $url ? new URL($url).searchParams.get('v') : null
);
export const ytThumbnailUrl = derived(ytVideoId, ($ytVideoId) =>
  $ytVideoId ? getYouTubeThumbnailUrl($ytVideoId, 'medium') : ''
);

export const loaded = writable(false);

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
    description: get(description)
  };
}