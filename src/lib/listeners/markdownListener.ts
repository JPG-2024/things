import { listen } from '@tauri-apps/api/event';
import type { FlowStatusEvent, MarkdownPayload } from '@/lib/types/flowStatus';

// Listener para markdown
export async function listenMarkdownFlowStatus(
	callback: (event: FlowStatusEvent<MarkdownPayload>) => void
): Promise<() => void> {
	return await listen<FlowStatusEvent<MarkdownPayload>>('flow-status', (event) => {
		if (event.payload.key === 'markdown') {
			callback(event.payload);
		}
	});
}
