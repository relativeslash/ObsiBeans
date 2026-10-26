import { parseNavId, type NavId } from '../state/navigation.ts';

/** Saved with the workspace layout, so it survives restarts. */
export interface Layout {
  readonly nav: NavId;
  /** Inspector width in pixels while the pane is wide. */
  readonly inspectorWidth: number;
}

export const INSPECTOR_MIN = 240;
export const INSPECTOR_MAX = 720;
export const DEFAULT_LAYOUT: Layout = { nav: 'all', inspectorWidth: 360 };

export const clampWidth = (width: number): number => Math.min(INSPECTOR_MAX, Math.max(INSPECTOR_MIN, Math.round(width)));

/** Reads stored layout field by field; damaged or missing values fall back to defaults. */
export function parseLayout(value: unknown): Layout {
  const stored: Record<string, unknown> = typeof value === 'object' && value !== null ? { ...value } : {};
  const width = stored.inspectorWidth;
  return {
    nav: parseNavId(stored.nav),
    inspectorWidth: typeof width === 'number' && Number.isFinite(width) ? clampWidth(width) : DEFAULT_LAYOUT.inspectorWidth,
  };
}
