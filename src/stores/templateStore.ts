import { invoke } from '@tauri-apps/api/core';
import type {
	Template,
	TemplateTaskDef,
	WebStoreTemplateRecord,
	WebProfileTemplateRecord
} from '@/types/template.types';
import type { Task } from '@/types/taskRunner.types';

function parseTemplateRecord(record: WebStoreTemplateRecord): Template {
	let tasks: TemplateTaskDef[] = [];
	try {
		const parsed = JSON.parse(record.tasksJson);
		if (Array.isArray(parsed)) {
			tasks = parsed as TemplateTaskDef[];
		}
	} catch (error) {
		console.warn('Unable to parse template tasks JSON', error);
	}

	return {
		id: record.id,
		name: record.name,
		description: record.description ?? undefined,
		tasks,
		createdAt: record.createdAt,
		updatedAt: record.updatedAt
	};
}

export async function listTemplates(): Promise<Template[]> {
	try {
		const records = await invoke<WebStoreTemplateRecord[]>('list_web_store_templates');
		return records.map(parseTemplateRecord);
	} catch (error) {
		console.error('Error listing templates:', error);
		return [];
	}
}

export async function getTemplate(id: string): Promise<Template | null> {
	try {
		const record = await invoke<WebStoreTemplateRecord | null>('get_web_store_template', { id });
		if (!record) return null;
		return parseTemplateRecord(record);
	} catch (error) {
		console.error('Error getting template:', error);
		return null;
	}
}

export async function saveTemplate(
	template: Omit<Template, 'createdAt' | 'updatedAt'>
): Promise<Template | null> {
	try {
		const record = await invoke<WebStoreTemplateRecord>('upsert_web_store_template', {
			input: {
				id: template.id,
				name: template.name,
				description: template.description ?? null,
				tasksJson: JSON.stringify(template.tasks)
			}
		});
		return parseTemplateRecord(record);
	} catch (error) {
		console.error('Error saving template:', error);
		return null;
	}
}

export async function deleteTemplate(id: string): Promise<boolean> {
	try {
		return await invoke<boolean>('delete_web_store_template', { id });
	} catch (error) {
		console.error('Error deleting template:', error);
		return false;
	}
}

export async function getProfileTemplateId(profileId: string): Promise<string | null> {
	try {
		const record = await invoke<WebProfileTemplateRecord | null>('get_web_profile_template', {
			profileId
		});
		return record?.templateId ?? null;
	} catch (error) {
		console.error('Error getting profile template:', error);
		return null;
	}
}

export async function assignTemplateToProfile(
	profileId: string,
	templateId: string
): Promise<boolean> {
	try {
		await invoke<WebProfileTemplateRecord>('upsert_web_profile_template', {
			profileId,
			templateId
		});
		return true;
	} catch (error) {
		console.error('Error assigning template to profile:', error);
		return false;
	}
}

export async function removeTemplateFromProfile(profileId: string): Promise<boolean> {
	try {
		return await invoke<boolean>('delete_web_profile_template', { profileId });
	} catch (error) {
		console.error('Error removing template from profile:', error);
		return false;
	}
}

export function tasksToTemplateDefs(tasks: Task[]): TemplateTaskDef[] {
	return tasks.flatMap((task): TemplateTaskDef | TemplateTaskDef[] => {
		if (task.type === 'ia') {
			const iaTask = task as import('@/types/taskRunner.types').IaTask;
			return {
				id: task.id,
				name: task.name,
				dependencies: task.dependencies as string[],
				type: iaTask.extractorConfig ? 'extractor' : 'ia',
				subtype: iaTask.subtype,
				systemMessage: iaTask.systemMessage,
				userMessage: iaTask.userMessage,
				completionOptions: iaTask.completionOptions as Record<string, unknown>,
				component: task.component,
				componentProps: task.componentProps,
				gridSpan: task.gridSpan,
				renderOrder: task.renderOrder,
				persist: true,
				enableTTS: iaTask.enableTTS ?? false,
				extractorConfig: iaTask.extractorConfig,
				categoryNames: iaTask.categoryNames
			};
		}

		if (task.type === 'script' && task.subtype === 'recursive') {
			const props = (task.componentProps ?? {}) as Record<string, unknown>;
			const recursiveConfig = props.recursiveConfig as Record<string, unknown> | undefined;
			const { recursiveConfig: _, ...restProps } = props;

			return {
				id: task.id,
				name: task.name,
				dependencies: task.dependencies as string[],
				type: 'script',
				subtype: 'recursive',
				userMessage: '',
				component: task.component,
				componentProps: restProps,
				gridSpan: task.gridSpan,
				renderOrder: task.renderOrder,
				persist: true,
				enableTTS: false,
				scriptFactory: 'recursive',
				scriptConfig: recursiveConfig ?? {}
			};
		}

		return [];
	});
}
