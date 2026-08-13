import { ApiError } from '../api/client';
import { LocalizedOperationError } from './operationError';

export type SystemPickerMode = 'folder' | 'existing-file' | 'save-file';

export interface SystemPickerOptions {
  mode: SystemPickerMode;
  purpose: string;
}

interface SystemPickerResponse {
  status: 'selected' | 'cancelled';
  path?: string;
}

let sessionTokenPromise: Promise<string> | null = null;

const readError = async (response: Response): Promise<string> => {
  const data = await response.json().catch(() => ({}));
  return data.detail || data.message || `請求失敗（${response.status}）`;
};

const getSessionToken = async (): Promise<string> => {
  if (!sessionTokenPromise) {
    sessionTokenPromise = fetch('/api/system/session')
      .then(async response => {
        if (!response.ok) {
          throw new ApiError(
            await readError(response),
            response.status,
            undefined,
            'http',
          );
        }
        const data = await response.json() as { token?: unknown };
        if (typeof data.token !== 'string' || data.token.length < 16) {
          throw new LocalizedOperationError('common.pathPickerError');
        }
        return data.token;
      })
      .catch(error => {
        sessionTokenPromise = null;
        throw error;
      });
  }
  return sessionTokenPromise;
};

export const openSystemPicker = async ({ mode, purpose }: SystemPickerOptions): Promise<SystemPickerResponse> => {
  const token = await getSessionToken();
  const response = await fetch('/api/system/picker', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Web-Viewer-Session': token,
    },
    body: JSON.stringify({ mode, purpose }),
  });
  if (!response.ok) {
    throw new ApiError(
      await readError(response),
      response.status,
      undefined,
      'http',
    );
  }
  return response.json() as Promise<SystemPickerResponse>;
};
