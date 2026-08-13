import React from 'react';
import { CheckSquare, Download, LoaderCircle, Square, Trash2, X } from 'lucide-react';
import { Button, IconButton } from './ui/Button';
import { Badge } from './ui/Badge';
import { useI18n } from '../i18n';

interface BatchEditToolbarProps {
  selectedCount: number;
  totalCount: number;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onDownloadSelected: () => void;
  isDownloading: boolean;
  downloadError?: string | null;
  onDeleteSelected: () => void;
  onCancel: () => void;
}

export const BatchEditToolbar: React.FC<BatchEditToolbarProps> = ({
  selectedCount,
  totalCount,
  onSelectAll,
  onDeselectAll,
  onDownloadSelected,
  isDownloading,
  downloadError,
  onDeleteSelected,
  onCancel,
}) => {
  const { t, formatNumber } = useI18n();
  const allSelected = totalCount > 0 && selectedCount === totalCount;

  return (
    <section className="batch-edit-toolbar" aria-label={t('common.batchEditTools')}>
      <Badge
        variant="hud"
        size="md"
        className="batch-edit-toolbar__summary"
        role="status"
        aria-live="polite"
      >
        <span className="batch-edit-toolbar__summary-label">{t('common.selected')}</span>
        <strong>{formatNumber(selectedCount)}</strong>
        <span aria-hidden="true">/</span>
        <span>{formatNumber(totalCount)}</span>
        <span className="batch-edit-toolbar__summary-label">{t('common.items')}</span>
      </Badge>

      <div className="batch-edit-toolbar__actions">
        <Button
          type="button"
          onClick={allSelected ? onDeselectAll : onSelectAll}
          variant={allSelected ? 'primary' : 'secondary'}
          className={`batch-edit-toolbar__button batch-edit-toolbar__button--secondary${allSelected ? ' is-active' : ''}`}
          aria-pressed={allSelected}
        >
          {allSelected ? <CheckSquare aria-hidden="true" /> : <Square aria-hidden="true" />}
          <span>{t(allSelected ? 'common.deselectAll' : 'common.selectAll')}</span>
        </Button>

        <Button
          type="button"
          onClick={onDownloadSelected}
          disabled={selectedCount === 0 || isDownloading}
          variant="primary"
          className="batch-edit-toolbar__button batch-edit-toolbar__button--primary"
        >
          {isDownloading ? <LoaderCircle className="batch-edit-toolbar__spinner" aria-hidden="true" /> : <Download aria-hidden="true" />}
          <span>{t(isDownloading ? 'common.prepareZip' : 'common.downloadZip')}</span>
        </Button>

        <Button
          type="button"
          onClick={onDeleteSelected}
          disabled={selectedCount === 0 || isDownloading}
          variant="danger"
          className="batch-edit-toolbar__button batch-edit-toolbar__button--danger"
        >
          <Trash2 aria-hidden="true" />
          <span>{t('common.moveSelectedToRecycleBin', { count: formatNumber(selectedCount) })}</span>
        </Button>

        <IconButton
          type="button"
          onClick={onCancel}
          variant="ghost"
          className="batch-edit-toolbar__close"
          aria-label={t('common.cancelEditMode')}
          title={t('common.cancelEditMode')}
        >
          <X aria-hidden="true" />
        </IconButton>
      </div>

      {downloadError && (
        <p className="batch-edit-toolbar__error" role="alert">
          {downloadError}
        </p>
      )}
    </section>
  );
};
