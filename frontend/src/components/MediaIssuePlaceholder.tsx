import React from 'react';
import { ImageOff } from 'lucide-react';

interface MediaIssuePlaceholderProps {
  message?: string;
  compact?: boolean;
  className?: string;
}

export const MediaIssuePlaceholder: React.FC<MediaIssuePlaceholderProps> = ({
  message = '檔案可能未完成或已損壞',
  compact = false,
  className = '',
}) => (
  <div
    role="img"
    aria-label={`圖片檔案有問題：${message}`}
    title={message}
    className={`media-issue-placeholder${compact ? ' media-issue-placeholder--compact' : ''} ${className}`}
  >
    <ImageOff className="media-issue-placeholder__icon" aria-hidden="true" />
    {!compact && <span className="media-issue-placeholder__title">圖片檔案有問題</span>}
    <span className="media-issue-placeholder__message">
      {message}
    </span>
  </div>
);
