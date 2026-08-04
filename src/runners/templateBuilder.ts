import type { TemplateTaskDef } from '@/types/template.types';
import type { Task } from '@/types/taskRunner.types';
import {
	buildRecursiveTask,
	buildTask,
	createCategoryTask,
	createExtractionTask,
	createIaTask
} from '@/runners/shared/taskFactories';
import type { RecursiveContentTaskOptions } from '@/runners/shared/taskFactories';

export function buildTaskFromTemplateDef(def: TemplateTaskDef): Task {
	if (def.type === 'script' && (def.scriptFactory === 'recursive' || def.subtype === 'recursive')) {
		return buildRecursiveTask(def.id, {
			...(def.scriptConfig as RecursiveContentTaskOptions),
			name: def.name,
			dependencies: def.dependencies,
			component: def.component,
			componentProps: def.componentProps,
			gridSpan: def.gridSpan,
			renderOrder: def.renderOrder,
			persist: def.persist
		});
	}

	if (def.type === 'script') {
		console.warn(
			`Unknown script template task "${def.scriptFactory ?? '?'}" for "${def.id}", skipping`
		);
		return {
			id: def.id,
			dependencies: def.dependencies,
			type: 'script',
			run: () => undefined
		};
	}
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

	if (def.subtype === 'category' && def.extractorConfig) {
		return buildTask(buildCategoryTaskDef(def, options), def.id);
	}

	const taskDef = def.extractorConfig
		? createExtractionTask({ ...options, extractor: def.extractorConfig })
		: createIaTask(options);
	return buildTask(taskDef, def.id);
}

function buildCategoryTaskDef(def: TemplateTaskDef, options: Record<string, unknown>) {
	const catOptions: Record<string, unknown> = {
		...options,
		categoryNames: def.categoryNames,
		maxItems: def.extractorConfig!.count
	};

	if (!def.categoryNames) {
		catOptions.systemMessage = def.systemMessage;
		catOptions.userMessage = def.userMessage;
		catOptions.completionOptions = def.completionOptions;
	}

	return createCategoryTask(catOptions);
}

export function buildTasksFromTemplate(
	templateDefs: TemplateTaskDef[],
	context: { content?: string; language?: string; freshRun?: boolean } = {}
): Task[] {
	return templateDefs.map(buildTaskFromTemplateDef);
}
