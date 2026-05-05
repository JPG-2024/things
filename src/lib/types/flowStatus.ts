// Shared types for flow-status events

export type FlowStatusKey = "metadata" | "markdown";
export type FlowStatus = "extracting" | "done";

export interface FlowStatusEvent<T = unknown> {
	key: FlowStatusKey;
	status: FlowStatus;
	data: T;
}

export type MetadataPayload = Record<string, string>;
export type MarkdownPayload = string;
