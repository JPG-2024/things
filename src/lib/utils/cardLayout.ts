import {
	CARD_COLUMN_MAX,
	CARD_COLUMN_MIN,
	CARD_ROW_MAX,
	CARD_ROW_MIN,
	CELL_WIDTH_MAX,
	CELL_WIDTH_MIN,
	ENTITY_CARD_GAP_PX,
	ENTITY_CARD_PADDING_X,
	WHEEL_CARDS_MAX,
	WHEEL_CARDS_MIN,
	type CardLayout
} from '@/constants';

function clampInt(value: number, min: number, max: number): number {
	const parsed = Number.isFinite(value) ? value : min;
	return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

/** Clamps a (persisted or user-editable) card layout onto its bounds. */
export function clampCardLayout(layout: CardLayout): CardLayout {
	return {
		columns: clampInt(layout.columns, CARD_COLUMN_MIN, CARD_COLUMN_MAX),
		rows: clampInt(layout.rows, CARD_ROW_MIN, CARD_ROW_MAX),
		cardsPerColumn: clampInt(layout.cardsPerColumn, WHEEL_CARDS_MIN, WHEEL_CARDS_MAX),
		cellWidth: clampInt(layout.cellWidth, CELL_WIDTH_MIN, CELL_WIDTH_MAX)
	};
}

/** Articles a card shows and fetches: columns x rows. */
export function articleCapacity(columns: number, rows: number): number {
	return (
		clampInt(columns, CARD_COLUMN_MIN, CARD_COLUMN_MAX) * clampInt(rows, CARD_ROW_MIN, CARD_ROW_MAX)
	);
}

/** Width of the article grid inside a card: cells + inner gaps (px). */
export function entityGridWidth(layout: CardLayout): number {
	return layout.columns * layout.cellWidth + Math.max(0, layout.columns - 1) * ENTITY_CARD_GAP_PX;
}

/** Full card width in px: article grid + Card horizontal padding. */
export function entityCardWidth(layout: CardLayout): number {
	return entityGridWidth(layout) + ENTITY_CARD_PADDING_X * 2;
}

/** Width string for a `ProfileList` row cell so the card fills its own grid. */
export function entityColumnWidth(layout: CardLayout): string {
	return `${entityCardWidth(layout)}px`;
}
