import React from 'react';
import { Check, Copy, Download, ExternalLink, FolderOpen, Image as ImageIcon, X } from 'lucide-react';
import { ImageItem, SourceLink } from '../types';
import { useI18n } from '../i18n';
import { getParentPath } from '../utils/clipboard';
import { LocalOpenTarget } from '../utils/localFileActions';
import { Button, IconButton } from './ui/Button';

export interface ViewerMediaDimensions {
  width: number;
  height: number;
}

export interface ViewerDetailsEntry {
  item: ImageItem;
  dimensions: ViewerMediaDimensions | null;
  currentItemIsVideo: boolean;
  mediaUrl: string;
  canOpenLocalMedia: boolean;
  openAction: LocalOpenTarget | null;
  openActionError: string | null;
  openActionErrorTarget: LocalOpenTarget | null;
  onOpenLocalMedia: (target: LocalOpenTarget) => void | Promise<void>;
  canCopyFilePath: boolean;
  canCopyFolderPath: boolean;
  copyAction: LocalOpenTarget | null;
  copyActionError: string | null;
  copyActionErrorTarget: LocalOpenTarget | null;
  copyFeedback: LocalOpenTarget | null;
  onCopyPath: (target: LocalOpenTarget) => void | Promise<void>;
  sourceLink: SourceLink | null;
  isSourceLoading: boolean;
}

export interface ViewerDetailsPanelProps {
  items: readonly ViewerDetailsEntry[];
  isMobileViewport: boolean;
  primaryItemId?: number;
  onClose: () => void;
}

export const ViewerDetailsPanel: React.FC<ViewerDetailsPanelProps> = ({
  items,
  isMobileViewport,
  primaryItemId,
  onClose,
}) => {
  const { t, formatNumber } = useI18n();
  const currentAssetEntry = items.find(entry => entry.item.image_id === primaryItemId) ?? items[0];
  const folderCopyEntry = currentAssetEntry ?? items.find(entry => entry.canCopyFolderPath) ?? items[0];
  const folderPath = folderCopyEntry?.item.save_name
    ? getParentPath(folderCopyEntry.item.save_name)
    : '';
  const folderLabel = currentAssetEntry?.currentItemIsVideo
    ? t('viewer.videoFolder')
    : t('viewer.imageFolder');
  const detailsTitle = currentAssetEntry?.currentItemIsVideo
    ? t('viewer.videoInfo')
    : t('viewer.imageInfo');
  const closeDetailsLabel = currentAssetEntry?.currentItemIsVideo
    ? t('viewer.closeVideoDetails')
    : t('viewer.closeDetails');

  const formatFileSize = (bytes: number | null | undefined): string => {
    if (bytes === null || bytes === undefined || !Number.isFinite(bytes) || bytes < 0) {
      return t('common.unknown');
    }
    if (bytes < 1024) return `${formatNumber(Math.round(bytes))} B`;
    if (bytes < 1024 * 1024) return `${formatNumber(bytes / 1024, { maximumFractionDigits: 1 })} KB`;
    if (bytes < 1024 * 1024 * 1024) {
      return `${formatNumber(bytes / (1024 * 1024), { maximumFractionDigits: 1 })} MB`;
    }
    return `${formatNumber(bytes / (1024 * 1024 * 1024), { maximumFractionDigits: 1 })} GB`;
  };

  const formatDimensions = (dimensions: ViewerMediaDimensions | null): string => {
    if (!dimensions || dimensions.width <= 0 || dimensions.height <= 0) return t('common.unknown');
    return `${formatNumber(dimensions.width)} × ${formatNumber(dimensions.height)} px`;
  };

  return (
    <section
      id="fullscreen-details-panel"
      className="fullscreen-viewer__details"
      aria-labelledby="fullscreen-details-heading"
    >
      <header className="fullscreen-viewer__details-header">
        <h4 id="fullscreen-details-heading">{detailsTitle}</h4>
        <IconButton
          type="button"
          onClick={onClose}
          aria-label={closeDetailsLabel}
          variant={isMobileViewport ? 'plain' : 'ghost'}
          size="sm"
          className="fullscreen-viewer__details-close"
          title={closeDetailsLabel}
        >
          <X className="w-4 h-4" aria-hidden="true" />
        </IconButton>
      </header>

      <div className="fullscreen-viewer__details-scroll">

      {folderCopyEntry && (
        <div className="fullscreen-viewer__details-folder-actions">
          <p className="fullscreen-viewer__details-folder-path-row">
            <span className="fullscreen-viewer__details-label">{folderLabel}:</span>
            <span className="fullscreen-viewer__details-folder-path" title={folderPath}>
              {folderPath || t('common.unknown')}
            </span>
            <IconButton
              type="button"
              onClick={() => void folderCopyEntry.onCopyPath('folder')}
              disabled={!folderCopyEntry.canCopyFolderPath || folderCopyEntry.copyAction !== null || folderCopyEntry.openAction !== null}
              aria-busy={folderCopyEntry.copyAction === 'folder'}
              aria-label={folderCopyEntry.copyFeedback === 'folder' ? t('viewer.folderCopied') : t('viewer.copyFolder')}
              className="fullscreen-viewer__details-folder-copy"
              size="sm"
              variant="ghost"
              title={t('viewer.copyFolder')}
            >
              {folderCopyEntry.copyFeedback === 'folder' ? (
                <Check className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Copy className="h-4 w-4" aria-hidden="true" />
              )}
            </IconButton>
          </p>
          <Button
            type="button"
            onClick={() => void folderCopyEntry.onOpenLocalMedia('folder')}
            variant="secondary"
            fullWidth
            className="viewer-secondary-action fullscreen-viewer__details-folder-open"
            disabled={!folderCopyEntry.canOpenLocalMedia || folderCopyEntry.openAction !== null || folderCopyEntry.copyAction !== null}
            aria-busy={folderCopyEntry.openAction === 'folder'}
            title={t('viewer.openFolderTitle')}
          >
            <FolderOpen className="h-4 w-4" aria-hidden="true" />
            {t('viewer.openFolder')}
          </Button>
          {folderCopyEntry.openActionError && folderCopyEntry.openActionErrorTarget === 'folder' && (
            <p className="viewer-file-action-error" role="alert">{folderCopyEntry.openActionError}</p>
          )}
          {folderCopyEntry.copyActionError && folderCopyEntry.copyActionErrorTarget === 'folder' && (
            <p className="viewer-file-action-error" role="alert">{folderCopyEntry.copyActionError}</p>
          )}
        </div>
      )}

      <div className="fullscreen-viewer__details-items">
        {items.map((entry, index) => {
          const openMediaLabel = entry.currentItemIsVideo ? t('viewer.openVideo') : t('viewer.openImage');
          const dimensionsLabel = entry.currentItemIsVideo
            ? t('viewer.videoDimensions')
            : t('viewer.imageDimensions');
          const fileSizeLabel = entry.currentItemIsVideo
            ? t('viewer.videoFileSize')
            : t('viewer.fileSize');
          const downloadOriginalLabel = entry.currentItemIsVideo
            ? t('viewer.downloadOriginalVideo')
            : t('viewer.downloadOriginal');
          const itemTitleId = `fullscreen-details-item-${entry.item.image_id}`;

          return (
            <article
              key={entry.item.image_id}
              className="fullscreen-viewer__details-item"
              aria-labelledby={itemTitleId}
              data-details-item-index={index + 1}
            >
              <h5 id={itemTitleId} className="fullscreen-viewer__details-item-title">
                {entry.item.title || t('viewer.untitled')}
              </h5>
              <div className="fullscreen-viewer__details-body">
                <p><span className="fullscreen-viewer__details-label">{t('viewer.imageId')}:</span> {entry.item.image_id}</p>
                <p><span className="fullscreen-viewer__details-label">{t('viewer.artistLabel')}:</span> {entry.item.artist_name || entry.item.member_id}</p>
                <p><span className="fullscreen-viewer__details-label">{t('viewer.artistIdLabel')}:</span> {entry.item.member_id}</p>
                <p><span className="fullscreen-viewer__details-label">{t('viewer.publishedAt')}:</span> {entry.item.created_date || t('common.unknown')}</p>
                <p><span className="fullscreen-viewer__details-label">{dimensionsLabel}:</span> {formatDimensions(entry.dimensions)}</p>
                <p><span className="fullscreen-viewer__details-label">{fileSizeLabel}:</span> {formatFileSize(entry.item.file_size)}</p>
                <p className="fullscreen-viewer__details-path-row">
                  <span className="fullscreen-viewer__details-label">{t('viewer.savePath')}:</span>
                  <span className="fullscreen-viewer__details-path" title={entry.item.save_name}>{entry.item.save_name}</span>
                  <IconButton
                    type="button"
                    onClick={() => void entry.onCopyPath('file')}
                    disabled={!entry.canCopyFilePath || entry.copyAction !== null || entry.openAction !== null}
                    aria-busy={entry.copyAction === 'file'}
                    aria-label={entry.copyFeedback === 'file' ? t('viewer.fileCopied') : t('viewer.copyFilePath')}
                    className="fullscreen-viewer__details-path-copy"
                    size="sm"
                    variant="ghost"
                    title={t('viewer.copyFilePath')}
                  >
                    {entry.copyFeedback === 'file' ? (
                      <Check className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      <Copy className="h-4 w-4" aria-hidden="true" />
                    )}
                  </IconButton>
                </p>
                <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">
                  {entry.copyFeedback === 'file'
                    ? t('viewer.fileCopied')
                    : entry.copyFeedback === 'folder' ? t('viewer.folderCopied') : ''}
                </span>
                <p className="fullscreen-viewer__source-row" aria-live="polite">
                  <span className="fullscreen-viewer__details-label">{t('viewer.sourceWork')}:</span>{' '}
                  {entry.isSourceLoading ? (
                    <span className="fullscreen-viewer__source-pending">{t('viewer.checkingSource')}</span>
                  ) : entry.sourceLink ? (
                    <a
                      href={entry.sourceLink.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="fullscreen-viewer__source-link"
                    >
                      {entry.sourceLink.platform === 'fanbox' ? t('viewer.fanboxWork') : t('viewer.pixivWork')}
                      <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                    </a>
                  ) : (
                    <span className="fullscreen-viewer__source-unavailable">{t('viewer.sourceUnavailable')}</span>
                  )}
                </p>
                {entry.item.media_status && (
                  <p className="fullscreen-viewer__details-warning">
                    <span className="fullscreen-viewer__details-label">{t('viewer.status')}:</span> {entry.item.media_error}
                  </p>
                )}
              </div>

              <div className="viewer-details-actions">
                <div className="viewer-file-actions">
                  <Button
                    type="button"
                    onClick={() => void entry.onOpenLocalMedia('file')}
                    variant="secondary"
                    fullWidth
                    className="viewer-secondary-action viewer-media-action"
                    disabled={!entry.canOpenLocalMedia || entry.openAction !== null || entry.copyAction !== null}
                    aria-busy={entry.openAction === 'file'}
                    title={t('viewer.openWithDefault', { action: openMediaLabel })}
                  >
                    <ImageIcon className="h-4 w-4" aria-hidden="true" />
                    {openMediaLabel}
                  </Button>
                  <Button
                    type="button"
                    onClick={() => window.open(entry.mediaUrl, '_blank')}
                    variant="primary"
                    fullWidth
                    className="viewer-primary-action viewer-media-action"
                    title={downloadOriginalLabel}
                  >
                    <Download className="w-4 h-4" aria-hidden="true" />
                    {downloadOriginalLabel}
                  </Button>
                </div>
                {entry.openActionError && entry.openActionErrorTarget !== 'folder' && (
                  <p className="viewer-file-action-error" role="alert">{entry.openActionError}</p>
                )}
                {entry.copyActionError && entry.copyActionErrorTarget !== 'folder' && (
                  <p className="viewer-file-action-error" role="alert">{entry.copyActionError}</p>
                )}
              </div>
            </article>
          );
        })}
      </div>
      </div>
    </section>
  );
};
