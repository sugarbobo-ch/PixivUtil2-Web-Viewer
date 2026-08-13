import React, { useState } from 'react';
import { FolderOpen, LoaderCircle } from 'lucide-react';
import { PixivPathFieldMetadata } from '../pixivConfigMetadata';
import { openSystemPicker } from '../utils/systemPicker';
import { getOperationErrorMessage } from '../utils/operationError';
import { Button, Input } from './ui';
import { useI18n } from '../i18n';

interface PathPickerFieldProps {
  id: string;
  label?: string;
  value: string;
  placeholder?: string;
  metadata: PixivPathFieldMetadata;
  descriptionId?: string;
  onChange: (value: string) => void;
  onClear?: () => void;
  clearLabel?: string;
}

export const PathPickerField: React.FC<PathPickerFieldProps> = ({
  id,
  label,
  value,
  placeholder,
  metadata,
  descriptionId,
  onChange,
  onClear,
  clearLabel,
}) => {
  const { t } = useI18n();
  const modeLabel: Record<PixivPathFieldMetadata['mode'], string> = {
    folder: t('common.chooseFolder'),
    'existing-file': t('common.chooseFile'),
    'save-file': t('common.chooseSaveLocation'),
  };
  const resolvedClearLabel = clearLabel ?? t('common.clearSelection');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePick = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await openSystemPicker({ mode: metadata.mode, purpose: metadata.purpose });
      if (result.status === 'selected' && result.path) onChange(result.path);
    } catch (pickerError) {
      setError(getOperationErrorMessage(pickerError, t, 'common.pathPickerError'));
    } finally {
      setLoading(false);
    }
  };

  const errorId = `${id}-picker-error`;
  const describedBy = [descriptionId, error ? errorId : ''].filter(Boolean).join(' ') || undefined;

  return (
    <div className="min-w-0 space-y-1.5">
      <div className="flex min-w-0 items-stretch gap-2">
        <Input
          controlSize="md"
          id={id}
          type="text"
          value={value}
          placeholder={placeholder}
          readOnly
          aria-describedby={describedBy}
          aria-invalid={!!error}
          autoComplete="off"
          spellCheck={false}
          className="min-w-0 flex-1 font-mono"
        />
        <Button
          type="button"
          onClick={handlePick}
          disabled={loading}
          variant="secondary"
          aria-label={`${modeLabel[metadata.mode]}：${label || id}`}
          className="shrink-0"
        >
          {loading ? <LoaderCircle className="settings-modal__picker-spinner h-4 w-4" aria-hidden="true" /> : <FolderOpen className="h-4 w-4" aria-hidden="true" />}
          <span className="hidden sm:inline">{loading ? t('common.opening') : modeLabel[metadata.mode]}</span>
        </Button>
        {onClear && (
          <Button
            type="button"
            onClick={() => {
              setError(null);
              onClear();
            }}
            disabled={loading || !value}
            variant="plain"
            className="shrink-0"
          >
            {resolvedClearLabel}
          </Button>
        )}
      </div>
      {error && <p id={errorId} className="settings-modal__field-error text-xs leading-5" role="alert">{error}</p>}
    </div>
  );
};
