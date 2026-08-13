import React from 'react';
import { ImageOff } from 'lucide-react';
import { useI18n } from '../i18n';

interface MediaIssuePlaceholderProps {
  message?: string;
  compact?: boolean;
  className?: string;
}

export const MediaIssuePlaceholder: React.FC<MediaIssuePlaceholderProps> = ({
  message,
  compact = false,
  className = '',
}) => {
  const { t } = useI18n();
  const resolvedMessage = message ?? t('common.mediaIssueMessage');
  return (
    <div
    role="img"
    aria-label={`${t('common.mediaIssue')}：${resolvedMessage}`}
    title={resolvedMessage}
    className={`media-issue-placeholder${compact ? ' media-issue-placeholder--compact' : ''} ${className}`}
  >
    <ImageOff className="media-issue-placeholder__icon" aria-hidden="true" />
    {!compact && <span className="media-issue-placeholder__title">{t('common.mediaIssue')}</span>}
    <span className="media-issue-placeholder__message">
      {resolvedMessage}
    </span>
    </div>
  );
};
