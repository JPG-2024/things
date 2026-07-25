import type { TemplateTaskDef } from '@/types/template.types';
import type { Task } from '@/types/taskRunner.types';
import { buildTask, createExtractionTask, createIaTask } from '@/runners/shared/taskFactories';

export function buildTaskFromTemplateDef(def: TemplateTaskDef): Task {
	const options = {
		name: def.name,
		dependencies: def.dependencies,
		subtype: def.subtype,
		systemMessage: def.systemMessage,
		userMessage: def.userMessage,
		component: def.component,
		renderOrder: def.renderOrder,
		completionOptions: def.completionOptions,
		persist: def.persist,
		enableTTS: def.enableTTS,
		gridSpan: def.gridSpan,
		componentProps: def.componentProps
	};
	const taskDef = def.extractorConfig
		? createExtractionTask({ ...options, extractor: def.extractorConfig })
		: createIaTask(options);
	return buildTask(taskDef, def.id);
}

export function buildTasksFromTemplate(
	templateDefs: TemplateTaskDef[],
	context: { content?: string; language?: string; freshRun?: boolean } = {}
): Task[] {
	return templateDefs.map(buildTaskFromTemplateDef);
}
