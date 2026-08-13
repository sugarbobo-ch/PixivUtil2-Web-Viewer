import { useCallback, useEffect, useRef, useState } from 'react';
import { ImageItem } from '../types';
import { apiClient } from '../api/client';
import { useI18n } from '../i18n';
import { getOperationErrorMessage } from '../utils/operationError';

interface UseSelectionWorkflowOptions {
  images: ImageItem[];
  fullscreenImageId: number | null;
  onFullscreenSelectionDeleted: () => void;
  refreshImages: () => void | Promise<void>;
}

export const useSelectionWorkflow = ({
  images,
  fullscreenImageId,
  onFullscreenSelectionDeleted,
  refreshImages,
}: UseSelectionWorkflowOptions) => {
  const { t } = useI18n();
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [deleteTargets, setDeleteTargets] = useState<number[]>([]);
  const [isDownloadingSelection, setIsDownloadingSelection] = useState(false);
  const [downloadSelectionError, setDownloadSelectionError] = useState<string | null>(null);
  const knownImagesRef = useRef(new Map<number, ImageItem>());

  useEffect(() => {
    images.forEach(image => knownImagesRef.current.set(image.image_id, image));
  }, [images]);

  const toggleSelectImage = useCallback((imageId: number) => {
    setSelectedIds(previous => {
      const next = new Set(previous);
      if (next.has(imageId)) next.delete(imageId);
      else next.add(imageId);
      return next;
    });
    setDownloadSelectionError(null);
  }, []);

  const setSelectedImages = useCallback((imageIds: number[], selected: boolean) => {
    if (imageIds.length === 0) return;

    setSelectedIds(previous => {
      const next = new Set(previous);
      imageIds.forEach(imageId => {
        if (selected) next.add(imageId);
        else next.delete(imageId);
      });
      return next;
    });
    setDownloadSelectionError(null);
  }, []);

  const replaceSelectedImages = useCallback((imageIds: number[]) => {
    setSelectedIds(new Set(imageIds));
    setDownloadSelectionError(null);
  }, []);

  const handleDownloadSelected = useCallback(async () => {
    if (selectedIds.size === 0 || isDownloadingSelection) return;

    setIsDownloadingSelection(true);
    setDownloadSelectionError(null);

    try {
      const selectedItems = Array.from(selectedIds).flatMap(imageId => {
        const image = images.find(candidate => candidate.image_id === imageId)
          ?? knownImagesRef.current.get(imageId);
        return image?.save_name ? [{ image_id: imageId, path: image.save_name }] : [];
      });
      const response = await apiClient.images.downloadZip(Array.from(selectedIds), selectedItems);
      const blob = await response.blob();
      const contentDisposition = response.headers.get('Content-Disposition');
      const filename = contentDisposition?.match(/filename="?([^";]+)"?/i)?.[1]
        ?? 'pixivutil2-selected-works.zip';
      const objectUrl = URL.createObjectURL(blob);
      const downloadLink = document.createElement('a');
      downloadLink.href = objectUrl;
      downloadLink.download = filename;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      downloadLink.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch (error) {
      const message = getOperationErrorMessage(error, t);
      console.error('Failed to download selected images:', error);
      setDownloadSelectionError(message);
    } finally {
      setIsDownloadingSelection(false);
    }
  }, [images, isDownloadingSelection, selectedIds]);

  const handleSelectAll = useCallback(() => {
    setSelectedIds(new Set(images.map(image => image.image_id)));
    setDownloadSelectionError(null);
  }, [images]);

  const handleDeselectAll = useCallback(() => {
    setSelectedIds(new Set());
    setDownloadSelectionError(null);
  }, []);

  const clearSelectionError = useCallback(() => {
    setDownloadSelectionError(null);
  }, []);

  const promptDeleteSelected = useCallback(() => {
    if (selectedIds.size === 0) return;
    setDeleteTargets(Array.from(selectedIds));
    setShowConfirmModal(true);
  }, [selectedIds]);

  const promptDeleteSingle = useCallback((imageId: number) => {
    setDeleteTargets([imageId]);
    setShowConfirmModal(true);
  }, []);

  const confirmExecuteDelete = useCallback(async () => {
    if (deleteTargets.length === 0) return;

    try {
      const items = deleteTargets.flatMap(imageId => {
        const image = images.find(candidate => candidate.image_id === imageId)
          ?? knownImagesRef.current.get(imageId);
        return image?.save_name ? [{ image_id: imageId, path: image.save_name }] : [];
      });
      await apiClient.images.batchTrash(deleteTargets, items);

      await refreshImages();
      setSelectedIds(previous => {
        const next = new Set(previous);
        deleteTargets.forEach(id => next.delete(id));
        return next;
      });
      deleteTargets.forEach(id => knownImagesRef.current.delete(id));
      if (fullscreenImageId !== null && deleteTargets.includes(fullscreenImageId)) {
        onFullscreenSelectionDeleted();
      }
      setShowConfirmModal(false);
      setDeleteTargets([]);
      setDownloadSelectionError(null);
    } catch (error) {
      const message = getOperationErrorMessage(error, t);
      console.error('Failed to move selected works to recycle bin:', error);
      setDownloadSelectionError(message);
    }
  }, [deleteTargets, fullscreenImageId, images, onFullscreenSelectionDeleted, refreshImages]);

  return {
    selectedIds,
    showConfirmModal,
    setShowConfirmModal,
    deleteTargets,
    setDeleteTargets,
    isDownloadingSelection,
    downloadSelectionError,
    toggleSelectImage,
    setSelectedImages,
    replaceSelectedImages,
    handleDownloadSelected,
    handleSelectAll,
    handleDeselectAll,
    clearSelectionError,
    promptDeleteSelected,
    promptDeleteSingle,
    confirmExecuteDelete,
  };
};
