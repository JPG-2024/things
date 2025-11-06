import { writable, derived } from "svelte/store";
import { listenMetadataFlowStatus } from "../lib/listeners/metadataListener";
import { listenMarkdownFlowStatus } from "../lib/listeners/markdownListener";
import type { FlowStatusEvent, MetadataPayload, MarkdownPayload } from "../lib/types/flowStatus";

export const loaded = writable(false);
export const domainUrl = writable<string | null>(null);
export const ytVideoId = writable<string | null>(null);

// Store para el estado de metadata
export const metadataStatus = writable<FlowStatusEvent<MetadataPayload> | null>(null);

// Store para el estado de markdown
export const markdownStatus = writable<FlowStatusEvent<MarkdownPayload> | null>(null);

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
  domainUrl.set(null);
  ytVideoId.set(null);
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