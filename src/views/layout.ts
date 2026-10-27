import { DEFAULT_SORT, SORT_KEYS, type Sort } from '../state/model.ts';
import { parseNavId, type NavId } from '../state/navigation.ts';

/** Optional list columns, in display order. The title is always shown. */
export const COLUMN_IDS = ['id', 'status', 'type', 'priority', 'tags', 'updated'] as const;
export type ColumnId = (typeof COLUMN_IDS)[number];
const DEFAULT_COLUMNS: readonly ColumnId[] = ['id', 'status', 'type', 'priority'];

/** Saved with the workspace layout, so it survives restarts. */
export interface Layout {
  readonly nav: NavId;
  readonly columns: readonly ColumnId[];
  readonly sort: Sort;
  /** Inspector width in pixels while the pane is wide. */
  readonly inspectorWidth: number;
}

export const INSPECTOR_MIN = 240;
export const INSPECTOR_MAX = 720;
export const DEFAULT_LAYOUT: Layout = { nav: 'all', columns: DEFAULT_COLUMNS, sort: DEFAULT_SORT, inspectorWidth: 360 };

export const clampWidth = (width: number): number => Math.min(INSPECTOR_MAX, Math.max(INSPECTOR_MIN, Math.round(width)));

/** Reads stored layout field by field; damaged or missing values fall back to defaults. */
export function parseLayout(value: unknown): Layout {
  const stored: Record<string, unknown> = typeof value === 'object' && value !== null ? { ...value } : {};
  const width = stored.inspectorWidth;
  const columns = stored.columns;
  const sort: Record<string, unknown> = typeof stored.sort === 'object' && stored.sort !== null ? { ...stored.sort } : {};
  return {
    nav: parseNavId(stored.nav),
    // An empty list is a valid choice (title only); only a missing or non-list value falls back.
    columns: Array.isArray(columns) ? COLUMN_IDS.filter((id) => columns.includes(id)) : DEFAULT_COLUMNS,
    sort: { key: SORT_KEYS.find((key) => key === sort.key) ?? DEFAULT_SORT.key, descending: sort.descending === true },
    inspectorWidth: typeof width === 'number' && Number.isFinite(width) ? clampWidth(width) : DEFAULT_LAYOUT.inspectorWidth,
  };
}
