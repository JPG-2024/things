import { listen } from "@tauri-apps/api/event"
import type { FlowStatusEvent, MetadataPayload } from "@/lib/types/flowStatus"

// Listener para metadata
export async function listenMetadataFlowStatus(
	callback: (event: FlowStatusEvent<MetadataPayload>) => void,
): Promise<() => void> {
	return await listen<FlowStatusEvent<MetadataPayload>>("flow-status", (event) => {
		if (event.payload.key === "metadata") {
			callback(event.payload)
		}
	})
}
