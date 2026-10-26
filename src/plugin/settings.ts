import type { Binding, Result } from '../adapter/binding.ts';
import { DENSITIES, type Density } from '../views/host.ts';

/** Persisted plugin settings. The executable is trusted only while its real path and content digest match the confirmed ones. */
export interface ObsiBeansSettings {
  executable: string;
  confirmedExecutable: string;
  confirmedDigest: string;
  config: string;
  density: Density;
}

export const DEFAULT_SETTINGS: Readonly<ObsiBeansSettings> = { executable: '', confirmedExecutable: '', confirmedDigest: '', config: '', density: 'comfortable' };

/** Reads stored data field by field, so a damaged or older file falls back to defaults instead of failing. */
export function parseSettings(data: unknown): ObsiBeansSettings {
  const stored: Record<string, unknown> = typeof data === 'object' && data !== null ? { ...data } : {};
  const text = (key: 'executable' | 'confirmedExecutable' | 'confirmedDigest' | 'config'): string =>
    typeof stored[key] === 'string' ? stored[key] : DEFAULT_SETTINGS[key];
  return {
    executable: text('executable'),
    confirmedExecutable: text('confirmedExecutable'),
    confirmedDigest: text('confirmedDigest'),
    config: text('config'),
    density: DENSITIES.find((density) => density === stored.density) ?? DEFAULT_SETTINGS.density,
  };
}

/** `undefined` while the project is being checked. */
export type BindingState = Result<Binding> | undefined;

/** What the settings tab needs from the plugin. */
export interface SettingsHost {
  readonly settings: ObsiBeansSettings;
  readonly binding: BindingState;
  /** Calls `listener` whenever `binding` or a setting changes. Returns the function that stops it. */
  onBindingChange(listener: () => void): () => void;
  saveSettings(): Promise<void>;
  rebind(): Promise<void>;
  confirmExecutable(): Promise<void>;
}
