import type { TemplateTaskDef } from '@/types/template.types';
import type { Task } from '@/types/taskRunner.types';
import {
	buildTask,
	createCategoryTask,
	createExtractionTask,
	createIaTask
} from '@/runners/shared/taskFactories';
import { buildRecursiveTask } from '@/runners/shared/recursiveTask';
import type { RecursiveTaskOptions } from '@/runners/shared/recursiveTask';

function normalizeGridSpan(value: unknown): 1 | 2 | undefined {
	if (value === 2) return 2;
	if (value === 1) return 1;
	if (value === 3) return 2;
	return undefined;
}

export function buildTaskFromTemplateDef(def: TemplateTaskDef): Task {
	if (def.type === 'script' && (def.scriptFactory === 'recursive' || def.subtype === 'recursive')) {
		const task = buildRecursiveTask(def.id, {
			...(def.scriptConfig as RecursiveTaskOptions),
			name: def.name,
			dependencies: def.dependencies,
			component: def.component,
			componentProps: def.componentProps,
			gridSpan: normalizeGridSpan(def.gridSpan),
			renderOrder: def.renderOrder,
			persist: def.persist,
			embeddings: def.embeddings,
			enableTTS: def.enableTTS
		});
		task.visible = def.visible ?? true;
		return task;
	}

	if (def.type === 'script') {
		console.warn(
			`Unknown script template task "${def.scriptFactory ?? '?'}" for "${def.id}", skipping`
		);
		return {
			id: def.id,
			dependencies: def.dependencies,
			type: 'script',
			run: () => undefined,
			visible: def.visible ?? true
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
		gridSpan: normalizeGridSpan(def.gridSpan),
		componentProps: def.componentProps,
		embeddings: def.embeddings
	};

	if (def.subtype === 'category' && def.extractorConfig) {
		const task = buildTask(def.id, buildCategoryTaskDef(def));
		task.visible = def.visible ?? true;
		return task;
	}

	const taskDef = def.extractorConfig
		? createExtractionTask({ ...options, extractor: def.extractorConfig })
		: createIaTask(options);
	const task = buildTask(def.id, taskDef);
	task.visible = def.visible ?? true;
	return task;
}

function buildCategoryTaskDef(def: TemplateTaskDef) {
	return createCategoryTask({
		categoryNames: def.categoryNames,
		maxItems: def.extractorConfig!.count,
		dependencies: def.dependencies,
		name: def.name,
		component: def.component,
		renderOrder: def.renderOrder,
		persist: def.persist,
		enableTTS: def.enableTTS,
		gridSpan: normalizeGridSpan(def.gridSpan),
		componentProps: def.componentProps,
		embeddings: def.embeddings
	});
}

export function buildTasksFromTemplate(
	templateDefs: TemplateTaskDef[],
	context: { content?: string; language?: string; freshRun?: boolean } = {}
): Task[] {
	return templateDefs.map(buildTaskFromTemplateDef);
}
