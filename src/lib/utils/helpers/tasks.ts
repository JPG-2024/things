import type { Task, TaskMapBase } from '@/types/taskRunner.types';

export function getTaskData<TMap extends TaskMapBase = TaskMapBase>(
	tasks: Task<TMap>[],
	id: string,
	key?: string
): unknown {
	const task = tasks.find((task) => task.id === id);

	if (!task) return undefined;

	const data = task.data as Record<string, unknown> | undefined;

	return key ? data?.[key] : data;
}

export function parseStructuredArrayResponses(data: string): string[] {
	const codeBlockMatch = data.match(/```(?:json)?\s*([\s\S]*?)```/);
	const jsonString = codeBlockMatch ? codeBlockMatch[1].trim() : data.trim();

	try {
		const value = JSON.parse(jsonString);

		if (Array.isArray(value)) {
			return value.map((keyword) => String(keyword).trim()).filter(Boolean);
		}

		if (typeof value !== 'object' || value === null) {
			return [];
		}

		const record = value as Record<string, unknown>;

		if (Array.isArray(record.keywords)) {
			return record.keywords.map((keyword) => String(keyword).trim()).filter(Boolean);
		}

		return Object.values(record)
			.filter((v): v is string => typeof v === 'string')
			.map((v) => v.trim())
			.filter(Boolean);
	} catch {
		const arrayMatch = jsonString.match(/^\[(.*)\]$/s);
		if (arrayMatch) {
			return arrayMatch[1]
				.split(',')
				.map((item) => item.trim().replace(/^["']|["']$/g, ''))
				.filter(Boolean);
		}
		return [];
	}
}
