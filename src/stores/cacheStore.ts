// src/stores/segmentedCache.ts
import { writable } from "svelte/store"

type SegmentState<T> = {
	data: T | null
	loading: boolean
	error: any
	last: number
}
// JS Doc comments
/**
 * Creates a segmented cache store.
 * Each segment can be loaded and invalidated independently.
 * @param fetcher - Async function to fetch data for a given segment (key-space) and params.
 * @returns An object with subscribe, load, and invalidate methods.
 */
export function storeCacheWrapper<T, Tparams>(
	fetcher: (segment: string, params: Tparams) => Promise<T>,
) {
	const { subscribe, set, update } = writable({
		segments: {} as Record<string, SegmentState<T>>,
	})

	async function load<T>(segment: string, params: Tparams, force = false): Promise<void> {
		const key = `${segment}-${JSON.stringify(params)}`

		update((state) => {
			const seg = state.segments[key] ?? { data: null, loading: false, error: null, last: 0 }
			return {
				...state,
				segments: {
					...state.segments,
					[key]: { ...seg, loading: true },
				},
			}
		})

		try {
			const data = await fetcher(segment, params)

			update((state) => ({
				...state,
				segments: {
					...state.segments,
					[key]: {
						data,
						loading: false,
						error: null,
						last: Date.now(),
					},
				},
			}))
		} catch (err) {
			update((state) => ({
				...state,
				segments: {
					...state.segments,
					[key]: {
						data: null,
						loading: false,
						error: err,
						last: Date.now(),
					},
				},
			}))
			throw err
		}
	}

	function invalidate(segment: string, params: Tparams) {
		update((state) => {
			const key = `${segment}-${JSON.stringify(params)}`
			const seg = state.segments[key]
			if (!seg) return state
			return {
				...state,
				segments: {
					...state.segments,
					[key]: { ...seg, data: null },
				},
			}
		})

		load(segment, params, true)
	}

	return { subscribe, load, invalidate }
}
