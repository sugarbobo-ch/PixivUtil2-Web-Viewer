export const getParentPath = (path: string): string => {
  const normalizedPath = path.replace(/[\\/]+$/, '');
  const separatorIndex = Math.max(normalizedPath.lastIndexOf('/'), normalizedPath.lastIndexOf('\\'));

  if (separatorIndex < 0) return '';
  if (separatorIndex === 0) return normalizedPath.slice(0, 1);

  const parentPath = normalizedPath.slice(0, separatorIndex);
  return /^[A-Za-z]:$/.test(parentPath) ? `${parentPath}${normalizedPath[separatorIndex]}` : parentPath;
};

export const copyTextToClipboard = async (value: string): Promise<void> => {
  if (!value) throw new Error('沒有可複製的內容。');

  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  if (typeof document === 'undefined' || typeof document.execCommand !== 'function') {
    throw new Error('目前環境不支援複製功能。');
  }

  const previousFocus = document.activeElement instanceof HTMLElement
    ? document.activeElement
    : null;
  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.setAttribute('readonly', '');
  textarea.setAttribute('aria-hidden', 'true');
  textarea.style.position = 'fixed';
  textarea.style.insetInlineStart = '-9999px';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();

  try {
    if (!document.execCommand('copy')) {
      throw new Error('複製失敗，請稍後再試。');
    }
  } finally {
    textarea.remove();
    previousFocus?.focus({ preventScroll: true });
  }
};
