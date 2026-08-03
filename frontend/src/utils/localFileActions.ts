export type LocalOpenTarget = 'file' | 'folder';

interface OpenLocalMediaOptions {
  path: string;
  imageId: number;
  target: LocalOpenTarget;
}

const getOpenErrorMessage = (status: number): string => {
  if (status === 404) return '找不到檔案，請確認檔案仍存在。';
  if (status === 501) return '此功能只支援 Windows。';
  return '無法開啟檔案，請稍後再試。';
};

export const openLocalMedia = async ({ path, imageId, target }: OpenLocalMediaOptions): Promise<void> => {
  const response = await fetch('/api/open-media', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, image_id: imageId, target }),
  });

  if (!response.ok) throw new Error(getOpenErrorMessage(response.status));
};
