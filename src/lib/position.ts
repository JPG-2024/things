export type PopupPosition = 'top' | 'bottom' | 'left' | 'right';
export type PopupPositionInput = PopupPosition | 'auto';

export interface PopupCoords {
	x: number;
	y: number;
	effectivePosition: PopupPosition;
}

export function calculatePopupPosition(
	anchorRect: DOMRect,
	popupWidth: number,
	popupHeight: number,
	gap: number,
	position: PopupPositionInput
): PopupCoords {
	const vw = window.innerWidth;
	const vh = window.innerHeight;

	let pos: PopupPosition;

	if (position === 'auto') {
		const space: Record<PopupPosition, number> = {
			top: anchorRect.top - popupHeight - gap,
			bottom: vh - anchorRect.bottom - popupHeight - gap,
			left: anchorRect.left - popupWidth - gap,
			right: vw - anchorRect.right - popupWidth - gap
		};
		pos = Object.entries(space).sort((a, b) => b[1] - a[1])[0][0] as PopupPosition;
	} else {
		pos = position;
	}

	let x: number;
	let y: number;

	if (pos === 'top') {
		x = anchorRect.left + anchorRect.width / 2;
		y = anchorRect.top - gap;
	} else if (pos === 'bottom') {
		x = anchorRect.left + anchorRect.width / 2;
		y = anchorRect.bottom + gap;
	} else if (pos === 'left') {
		x = anchorRect.left - gap;
		y = anchorRect.top + anchorRect.height / 2;
	} else {
		x = anchorRect.right + gap;
		y = anchorRect.top + anchorRect.height / 2;
	}

	if (pos === 'left') {
		x = Math.max(popupWidth, Math.min(x, vw));
	} else if (pos === 'right') {
		x = Math.max(0, Math.min(x, vw - popupWidth));
	} else {
		x = Math.max(popupWidth / 2, Math.min(x, vw - popupWidth / 2));
	}

	if (pos === 'top') {
		y = Math.max(popupHeight, Math.min(y, vh));
	} else if (pos === 'bottom') {
		y = Math.max(0, Math.min(y, vh - popupHeight));
	} else {
		y = Math.max(popupHeight / 2, Math.min(y, vh - popupHeight / 2));
	}

	return { x, y, effectivePosition: pos };
}
