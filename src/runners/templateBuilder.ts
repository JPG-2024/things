import type { TemplateTaskDef } from '@/types/template.types';
import type { Task } from '@/types/taskRunner.types';
import { defineTask, buildTask } from '@/runners/shared/dynamicTasks';

export function buildTaskFromTemplateDef(def: TemplateTaskDef): Task {
	const taskDef = defineTask({
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
		componentProps: def.componentProps,
		...(def.extractorConfig ? { extractorConfig: def.extractorConfig } : {})
	});
	return buildTask(taskDef, def.id);
}

export function buildTasksFromTemplate(
	templateDefs: TemplateTaskDef[],
	context: { content?: string; language?: string; freshRun?: boolean } = {}
): Task[] {
	return templateDefs.map(buildTaskFromTemplateDef);
}
