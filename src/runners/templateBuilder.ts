import type { TemplateTaskDef } from '@/types/template.types';
import type { Task } from '@/types/taskRunner.types';
import { createIaTask, createExtractorTask, buildTask } from '@/runners/shared/dynamicTasks';

export function buildTaskFromTemplateDef(def: TemplateTaskDef): Task {
	if (def.type === 'extractor' && def.extractorConfig) {
		const extractorDef = createExtractorTask({
			id: def.id,
			name: def.name,
			dependencies: def.dependencies,
			count: def.extractorConfig.count,
			description: def.extractorConfig.description,
			component: def.component
		});
		return buildTask(extractorDef, def.id);
	}

	const iaDef = createIaTask({
		id: def.id,
		name: def.name,
		dependencies: def.dependencies,
		subtype: def.subtype,
		systemMessage: def.systemMessage,
		userMessage: def.userMessage,
		component: def.component,
		completionOptions: def.completionOptions
	});

	const task = buildTask(iaDef, def.id);

	if (def.gridSpan != null) task.gridSpan = def.gridSpan;
	if (def.renderOrder != null) task.renderOrder = def.renderOrder;
	if (def.persist != null) task.persist = def.persist;
	if (def.componentProps != null) task.componentProps = def.componentProps;

	return task;
}

export function buildTasksFromTemplate(
	templateDefs: TemplateTaskDef[],
	context: { content?: string; language?: string; freshRun?: boolean } = {}
): Task[] {
	return templateDefs.map(buildTaskFromTemplateDef);
}
