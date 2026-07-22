import type { IaTaskSubtype } from '@/types/taskRunner.types';

export type TemplateTaskType = 'ia' | 'extractor';

export type TemplateTaskDef = {
	id: string;
	name?: string;
	dependencies: string[];
	type: TemplateTaskType;
	subtype?: IaTaskSubtype;
	systemMessage?: string;
	userMessage: string;
	completionOptions?: Record<string, unknown>;
	component?: string;
	componentProps?: Record<string, unknown>;
	gridSpan?: 1 | 2 | 3;
	renderOrder?: number;
	persist?: boolean;
	extractorConfig?: { count: number; description: string };
	enableTTS: boolean;
};

export type Template = {
	id: string;
	name: string;
	description?: string;
	tasks: TemplateTaskDef[];
	createdAt: number;
	updatedAt: number;
};

export type WebStoreTemplateRecord = {
	id: string;
	name: string;
	description: string | null;
	tasksJson: string;
	createdAt: number;
	updatedAt: number;
};

export type WebProfileTemplateRecord = {
	profileId: string;
	templateId: string;
	updatedAt: number;
};
