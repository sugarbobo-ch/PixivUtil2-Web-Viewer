import React from 'react';
import { CheckSquare, Download, LoaderCircle, Square, Trash2, X } from 'lucide-react';
import { Button, IconButton } from './ui/Button';
import { Badge } from './ui/Badge';

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
  const allSelected = totalCount > 0 && selectedCount === totalCount;

  return (
    <section className="batch-edit-toolbar" aria-label="批次編輯工具">
      <Badge
        variant="hud"
        size="md"
        className="batch-edit-toolbar__summary"
        role="status"
        aria-live="polite"
      >
        <span className="batch-edit-toolbar__summary-label">已選取</span>
        <strong>{selectedCount}</strong>
        <span aria-hidden="true">/</span>
        <span>{totalCount}</span>
        <span className="batch-edit-toolbar__summary-label">項</span>
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
          <span>{allSelected ? '取消全選' : '全選'}</span>
        </Button>

        <Button
          type="button"
          onClick={onDownloadSelected}
          disabled={selectedCount === 0 || isDownloading}
          variant="primary"
          className="batch-edit-toolbar__button batch-edit-toolbar__button--primary"
        >
          {isDownloading ? <LoaderCircle className="batch-edit-toolbar__spinner" aria-hidden="true" /> : <Download aria-hidden="true" />}
          <span>{isDownloading ? '準備 ZIP…' : '下載 ZIP'}</span>
        </Button>

        <Button
          type="button"
          onClick={onDeleteSelected}
          disabled={selectedCount === 0 || isDownloading}
          variant="danger"
          className="batch-edit-toolbar__button batch-edit-toolbar__button--danger"
        >
          <Trash2 aria-hidden="true" />
          <span>移至回收區 ({selectedCount})</span>
        </Button>

        <IconButton
          type="button"
          onClick={onCancel}
          variant="ghost"
          className="batch-edit-toolbar__close"
          aria-label="取消編輯模式"
          title="取消編輯模式"
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
