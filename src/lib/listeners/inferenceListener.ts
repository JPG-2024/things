import { listen } from "@tauri-apps/api/event";

export type InferenceStreamPayload = string;

// Listener para inference stream
export async function listenInferenceStream(
  callback: (content: InferenceStreamPayload) => void
): Promise<() => void> {
  return await listen<{ content: string }>("inference-stream", (event) => {
    callback(event.payload.content);
  });
}
