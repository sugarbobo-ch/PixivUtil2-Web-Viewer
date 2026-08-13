import { describe, expect, it } from 'vitest';
import { ApiError } from '../api/client';
import { I18nProvider, useI18n } from '../i18n';
import { getOperationErrorMessage, LocalizedOperationError } from './operationError';
import { render } from '@testing-library/react';

const Probe = ({ error }: { error: unknown }) => {
  const { t } = useI18n();
  return <output>{getOperationErrorMessage(error, t)}</output>;
};

describe('operation error presentation', () => {
  it('maps HTTP status to localized copy and preserves diagnostic detail', () => {
    render(
      <I18nProvider initialLanguage="en">
        <Probe error={new ApiError('backend detail', 409, {}, 'http')} />
      </I18nProvider>,
    );

    expect(document.querySelector('output')?.textContent).toBe(
      'The current data state does not allow this operation.: backend detail',
    );
  });

  it('uses a translation key for local operation failures', () => {
    render(
      <I18nProvider initialLanguage="en">
        <Probe error={new LocalizedOperationError('common.pathPickerError')} />
      </I18nProvider>,
    );

    expect(document.querySelector('output')?.textContent).toBe(
      'Unable to open the path picker.',
    );
  });
});
