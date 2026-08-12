import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ImageItem } from '../types';
import { useSelectionWorkflow } from './useSelectionWorkflow';

const images = [
  { image_id: 1, save_name: 'one.jpg', title: 'One' },
  { image_id: 2, save_name: 'two.jpg', title: 'Two' },
] as unknown as ImageItem[];

const WorkflowProbe = () => {
  const workflow = useSelectionWorkflow({
    images,
    fullscreenImageId: 1,
    onFullscreenSelectionDeleted: () => {},
    refreshImages: () => {},
  });
  return (
    <div>
      <output data-testid="selected">{Array.from(workflow.selectedIds).join(',')}</output>
      <output data-testid="error">{workflow.downloadSelectionError ?? ''}</output>
      <output data-testid="pending">{String(workflow.showConfirmModal)}</output>
      <button type="button" onClick={() => workflow.toggleSelectImage(1)}>toggle</button>
      <button type="button" onClick={workflow.handleSelectAll}>all</button>
      <button type="button" onClick={workflow.handleDeselectAll}>none</button>
      <button type="button" onClick={workflow.promptDeleteSelected}>delete</button>
      <button type="button" onClick={() => void workflow.confirmExecuteDelete()}>confirm</button>
    </div>
  );
};

describe('useSelectionWorkflow', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keeps selection changes local and clears them explicitly', async () => {
    render(<WorkflowProbe />);
    screen.getByRole('button', { name: 'toggle' }).click();
    await waitFor(() => expect(screen.getByTestId('selected').textContent).toBe('1'));
    screen.getByRole('button', { name: 'all' }).click();
    await waitFor(() => expect(screen.getByTestId('selected').textContent).toBe('1,2'));
    screen.getByRole('button', { name: 'none' }).click();
    await waitFor(() => expect(screen.getByTestId('selected').textContent).toBe(''));
  });

  it('reports a delete API failure without closing the confirmation state', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ detail: '來源忙碌中' }),
    }));
    render(<WorkflowProbe />);
    screen.getByRole('button', { name: 'all' }).click();
    await waitFor(() => expect(screen.getByTestId('selected').textContent).toBe('1,2'));
    screen.getByRole('button', { name: 'delete' }).click();
    await waitFor(() => expect(screen.getByTestId('pending').textContent).toBe('true'));
    screen.getByRole('button', { name: 'confirm' }).click();

    await waitFor(() => expect(screen.getByTestId('error').textContent).toBe('來源忙碌中'));
  });
});
