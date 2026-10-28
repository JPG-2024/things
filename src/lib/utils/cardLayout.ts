import {
	CARD_COLUMN_MAX,
	CARD_COLUMN_MIN,
	CARD_ROW_MAX,
	CARD_ROW_MIN,
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
		rows: clampInt(layout.rows, CARD_ROW_MIN, CARD_ROW_MAX)
	};
}

/** Articles a card shows and fetches: columns x rows. */
export function articleCapacity(columns: number, rows: number): number {
	return (
		clampInt(columns, CARD_COLUMN_MIN, CARD_COLUMN_MAX) * clampInt(rows, CARD_ROW_MIN, CARD_ROW_MAX)
	);
}
