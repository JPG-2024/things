/**
 * Wheel handling shared by shift+wheel history navigation. Kept free of
 * store/SvelteKit imports so it can be unit tested with `bun test`.
 */

/** `WheelEvent.deltaMode` multipliers (px per line / per page). */
const LINE_HEIGHT_PX = 16;
const PAGE_HEIGHT_PX = 800;

/**
 * Reduces a wheel event to one signed pixel delta on its dominant axis.
 *
 * WebKitGTK translates Shift+wheel into a horizontal scroll (`deltaX` with
 * `deltaY` at 0), while other platforms keep it on `deltaY`; picking the
 * dominant axis makes both work without guessing the platform.
 */
export function resolveWheelDelta(
	deltaX: number,
	deltaY: number,
	deltaMode: number,
	pageHeightPx = PAGE_HEIGHT_PX
): number {
	const scale = deltaMode === 1 ? LINE_HEIGHT_PX : deltaMode === 2 ? pageHeightPx : 1;
	const x = deltaX * scale;
	const y = deltaY * scale;
	return Math.abs(y) >= Math.abs(x) ? y : x;
}
