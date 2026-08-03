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
    className={`flex h-full w-full flex-col items-center justify-center gap-2 bg-zinc-950 px-3 text-center text-amber-300 ${className}`}
  >
    <ImageOff className={compact ? 'h-5 w-5' : 'h-10 w-10'} aria-hidden="true" />
    {!compact && <span className="text-sm font-semibold">圖片檔案有問題</span>}
    <span className={compact ? 'max-w-full truncate text-[9px] text-amber-200/80' : 'max-w-full text-xs text-zinc-400'}>
      {message}
    </span>
  </div>
);
