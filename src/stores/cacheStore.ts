// src/stores/segmentedCache.ts
import { writable } from "svelte/store";

type SegmentState<T> = {
	data: T | null;
	loading: boolean;
	error: any;
	last: number;
};

const MAX_SEGMENTS = 100;

function evictOldSegments(
	segments: Record<string, SegmentState<unknown>>
): Record<string, SegmentState<unknown>> {
	const entries = Object.entries(segments);
	if (entries.length <= MAX_SEGMENTS) {
		return segments;
	}
	const sorted = entries.sort((a, b) => {
		const aTime = (a[1] as SegmentState<unknown>).last ?? 0;
		const bTime = (b[1] as SegmentState<unknown>).last ?? 0;
		return aTime - bTime;
	});
	const toKeep = sorted.slice(-MAX_SEGMENTS);
	return Object.fromEntries(toKeep);
}

export function storeCacheWrapper<T, Tparams>(
	fetcher: (segment: string, params: Tparams) => Promise<T>
) {
	const { subscribe, set, update } = writable({
		segments: {} as Record<string, SegmentState<T>>,
	});

	async function load<T>(
		segment: string,
		params: Tparams,
		_force = false
	): Promise<void> {
		const key = `${segment}-${JSON.stringify(params)}`;

		update((state) => {
			const seg = state.segments[key] ?? {
				data: null,
				loading: false,
				error: null,
				last: 0,
			};
			return {
				...state,
				segments: {
					...state.segments,
					[key]: { ...seg, loading: true },
				},
			};
		});

		try {
			const data = await fetcher(segment, params);

			update((state) => {
				const newSegments = {
					...state.segments,
					[key]: {
						data,
						loading: false,
						error: null,
						last: Date.now(),
					},
				};
				return {
					...state,
					segments: evictOldSegments(newSegments),
				};
			});
		} catch (err) {
			update((state) => {
				const newSegments = {
					...state.segments,
					[key]: {
						data: null,
						loading: false,
						error: err,
						last: Date.now(),
					},
				};
				return {
					...state,
					segments: evictOldSegments(newSegments),
				};
			});
			throw err;
		}
	}

	function invalidate(segment: string, params: Tparams) {
		update((state) => {
			const key = `${segment}-${JSON.stringify(params)}`;
			const seg = state.segments[key];
			if (!seg) return state;
			return {
				...state,
				segments: {
					...state.segments,
					[key]: { ...seg, data: null },
				},
			};
		});

		load(segment, params, true);
	}

	return { subscribe, load, invalidate };
}
