import { reconstructChunks } from '@/lib/utils/splitText';
import { extractDependencyText } from '@/lib/utils/helpers/tasks';
import { workflowStore } from '@/stores/workflowStore.svelte';
import type { Task } from '@/types/taskRunner.types';
import { generateChunkSummary } from './summaryGenerator';
import type { Segment, SegmentSource } from './types';

interface QuestionsChunkLike {
	key?: { startOffset: number; endOffset: number };
	data?: unknown;
}

interface QuestionsTaskData {
	chunks?: QuestionsChunkLike[];
}

interface SegmentConfigShape {
	segmentSource: SegmentSource;
	topicCount: number;
	interactionsPerTopic: number;
}

function getAllTasks(): Task[] {
	const seen = new Set<string>();
	return [
		...workflowStore.stackedTasks.map((e) => e.task),
		...workflowStore.focusedRunTasks
	].filter((t) => {
		if (seen.has(t.id)) return false;
		seen.add(t.id);
		return true;
	});
}

function getQuestionsTask(): Task | undefined {
	return getAllTasks().find((t) => t.id === 'questions' && t.status === 'done' && t.data);
}

function getTaskById(id: string): Task | undefined {
	return getAllTasks().find((t) => t.id === id);
}

function getSourceText(taskId: string): string {
	const task = getTaskById(taskId);
	if (!task || !task.data) return '';
	return extractDependencyText(task.data) ?? '';
}

function contentTaskText(): string {
	const tasks = getAllTasks();
	const contentTask = tasks.find((t) => t.id === 'content' && t.status === 'done' && t.data);
	if (contentTask) return extractDependencyText(contentTask.data) ?? '';
	return tasks
		.filter((t) => t.status === 'done' && t.data)
		.map((t) => extractDependencyText(t.data))
		.filter(Boolean)
		.join('\n\n');
}

function normalizeChunkContent(data: unknown): string {
	if (typeof data === 'string') return data.trim();
	if (Array.isArray(data)) {
		return data
			.filter((d): d is string => typeof d === 'string')
			.map((d) => d.trim())
			.filter(Boolean)
			.join('\n');
	}
	return '';
}

function normalizeQuestions(data: unknown): string[] {
	if (Array.isArray(data)) {
		return data
			.filter((q): q is string => typeof q === 'string')
			.map((q) => q.trim())
			.filter(Boolean);
	}
	if (typeof data === 'string') {
		const trimmed = data.trim();
		if (!trimmed) return [];
		try {
			const parsed = JSON.parse(trimmed);
			if (Array.isArray(parsed)) {
				return parsed
					.filter((q): q is string => typeof q === 'string')
					.map((q) => q.trim())
					.filter(Boolean);
			}
		} catch {
			// fall through
		}
		return trimmed
			.split(/\r?\n/)
			.map((q) => q.trim())
			.filter(Boolean);
	}
	return [];
}

function splitContentIntoChunks(content: string, count: number): string[] {
	const cleaned = content.trim();
	if (!cleaned) return [];
	const target = Math.max(1, count);
	if (target === 1) return [cleaned];

	const tokens = cleaned.split(/(\s+)/);
	const words = tokens.filter((_, i) => i % 2 === 0);
	const wordChunks: string[] = [];
	for (let i = 0; i < words.length; i += Math.max(1, Math.ceil(words.length / target))) {
		const slice = words.slice(i, i + Math.ceil(words.length / target));
		const piece = slice.join(' ').trim();
		if (piece) wordChunks.push(piece);
		if (wordChunks.length >= target) break;
	}

	while (wordChunks.length < target) {
		const last = wordChunks[wordChunks.length - 1] ?? '';
		const pieces = last.split(/(?<=[.!?])\s+/);
		if (pieces.length > 1) {
			const head = pieces
				.slice(0, Math.ceil(pieces.length / 2))
				.join(' ')
				.trim();
			const tail = pieces
				.slice(Math.ceil(pieces.length / 2))
				.join(' ')
				.trim();
			wordChunks.pop();
			if (head) wordChunks.push(head);
			if (tail) wordChunks.push(tail);
		} else {
			break;
		}
	}

	return wordChunks.slice(0, target);
}

async function fromQuestionsTask(
	interactionsPerTopic: number,
	signal?: AbortSignal
): Promise<Segment[]> {
	const questionsTask = getQuestionsTask();
	if (!questionsTask) {
		throw new Error('No completed "questions" task found for segment source');
	}
	const data = questionsTask.data as QuestionsTaskData | undefined;
	const chunks = data?.chunks;
	if (!Array.isArray(chunks) || chunks.length === 0) {
		throw new Error('"questions" task has no chunks');
	}

	const sourceId = questionsTask.dependencies?.[0];
	const sourceText = sourceId ? getSourceText(sourceId) : contentTaskText();
	if (!sourceText) {
		throw new Error('No source text available to reconstruct chunks for the "questions" task');
	}

	const segments: Segment[] = [];
	for (const chunk of chunks) {
		const key = chunk.key;
		if (!key || typeof key.startOffset !== 'number' || typeof key.endOffset !== 'number') continue;
		const raw = reconstructChunks(sourceText, [key])[0] ?? '';
		if (!raw.trim()) continue;
		const questions = normalizeQuestions(chunk.data);
		if (questions.length === 0) continue;
		const summary = await generateChunkSummary(raw, signal);
		const chunkData = normalizeChunkContent(chunk.data);
		segments.push({
			topic: summary,
			rawChunk: raw,
			chunkData,
			questions,
			interactionCount: Math.max(
				1,
				Math.min(questions.length, interactionsPerTopic || questions.length)
			)
		});
	}

	if (segments.length === 0) {
		throw new Error('"questions" task produced no usable chunks');
	}
	return segments;
}

async function fromContent(cfg: { topicCount: number }, signal?: AbortSignal): Promise<Segment[]> {
	const content = contentTaskText();
	if (!content.trim()) {
		throw new Error('No content available for the "content" segment source');
	}
	const chunks = splitContentIntoChunks(content, cfg.topicCount);
	if (chunks.length === 0) {
		throw new Error('Failed to split content into segments');
	}

	const segments: Segment[] = [];
	for (const raw of chunks) {
		const summary = await generateChunkSummary(raw, signal);
		segments.push({
			topic: summary,
			rawChunk: raw,
			chunkData: '',
			questions: [],
			interactionCount: 0
		});
	}
	return segments;
}

export async function resolveSegments(
	cfg: SegmentConfigShape,
	signal?: AbortSignal
): Promise<Segment[]> {
	if (cfg.segmentSource === 'questions') {
		return fromQuestionsTask(cfg.interactionsPerTopic, signal);
	}
	return fromContent({ topicCount: cfg.topicCount }, signal);
}
