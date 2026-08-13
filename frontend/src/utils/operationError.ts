import { ApiError } from '../api/client';
import type { I18nContextValue } from '../i18n';

export class LocalizedOperationError extends Error {
  readonly translationKey: string;

  constructor(translationKey: string) {
    super(translationKey);
    this.name = 'LocalizedOperationError';
    this.translationKey = translationKey;
  }
}

const statusKey = (status: number): string => {
  if (status === 400) return 'errors.badRequest';
  if (status === 404) return 'errors.notFound';
  if (status === 409) return 'errors.conflict';
  if (status === 422) return 'errors.invalidData';
  if (status >= 500) return 'errors.server';
  return 'errors.requestFailed';
};

/**
 * Keep stable HTTP status copy localized while preserving backend detail as an
 * explicit diagnostic suffix when no structured error code is available.
 */
export const getOperationErrorMessage = (
  error: unknown,
  t: I18nContextValue['t'],
  fallbackKey = 'errors.unknown',
): string => {
  if (error instanceof LocalizedOperationError) {
    return t(error.translationKey);
  }
  if (error instanceof Error && error.message.toLocaleLowerCase().includes('failed to fetch')) {
    return t('errors.backendUnavailable');
  }

  if (error instanceof ApiError && Number.isFinite(error.status)) {
    const prefix = t(statusKey(error.status), { status: error.status });
    return error.message ? `${prefix}: ${error.message}` : prefix;
  }

  return error instanceof Error ? error.message : t(fallbackKey);
};
