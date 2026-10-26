import type { AdapterError } from '../state/model.ts';
import { t } from './i18n.ts';

/** The one actionable sentence for a failure. Backend text is shown as reported, after our own framing. */
export function describeError(error: AdapterError): string {
  switch (error.kind) {
    case 'validation': return t('error.validation', { message: error.message });
    case 'conflict': return t('error.conflict');
    case 'preservation': return t('error.preservation', { detail: error.detail });
    case 'backend': return t('error.backend', { message: error.message });
    case 'uncertain': return t('error.uncertain', { message: error.message });
  }
}
