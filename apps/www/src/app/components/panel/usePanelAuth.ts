import { useCallback, useEffect, useState } from 'react';
import { panelFetch } from '../../api/panelApi';
import {
  clearPanelPreviewIdentity,
  isPanelPreviewRuntimeEnabled,
  readPanelPreviewIdentity,
} from './panelPreviewSession';
import type { PanelIdentity } from './panelTypes';
import { readJsonSafe } from './panelTypes';

type UsePanelAuthReturn = {
  identity: PanelIdentity | null;
  isLoading: boolean;
  authRequired: boolean;
  errorMessage: string;
  isSigningOut: boolean;
  handleSignOut: () => void;
  revalidate: () => Promise<PanelIdentity | null>;
};

export function usePanelAuth(): UsePanelAuthReturn {
  const [identity, setIdentity] = useState<PanelIdentity | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [authRequired, setAuthRequired] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [isSigningOut, setIsSigningOut] = useState(false);

  const checkAuth = useCallback(async (): Promise<PanelIdentity | null> => {
    const previewIdentity = readPanelPreviewIdentity();
    if (previewIdentity && isPanelPreviewRuntimeEnabled()) {
      setAuthRequired(false);
      setIdentity(previewIdentity);
      setErrorMessage('');
      setIsLoading(false);
      return previewIdentity;
    }

    setIsLoading(true);
    setErrorMessage('');

    try {
      const meResponse = await panelFetch('/api/panel/auth/me', { method: 'GET' });

      if (meResponse.status === 401 || meResponse.status === 403) {
        setAuthRequired(true);
        setIdentity(null);
        setErrorMessage('Panel oturumu bulunamadı. Devam etmek için tekrar giriş yapın.');
        return null;
      }
      setAuthRequired(false);

      const mePayload = await readJsonSafe<{ identity?: PanelIdentity }>(meResponse);
      if (!meResponse.ok || !mePayload?.identity) {
        throw new Error('Panel oturumu doğrulanamadı.');
      }

      if (mePayload.identity.password_reset_required) {
        window.location.assign('/panel/password-reset');
        return null;
      }

      setIdentity(mePayload.identity);
      return mePayload.identity;
    } catch {
      setErrorMessage('Panel oturumu doğrulanamadı.');
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void checkAuth();
  }, [checkAuth]);

  const handleSignOut = useCallback(() => {
    if (isSigningOut) return;
    setIsSigningOut(true);
    if (readPanelPreviewIdentity()) {
      clearPanelPreviewIdentity();
      window.location.assign('/panel/login');
      return;
    }
    panelFetch('/api/panel/auth/logout', { method: 'POST' }).finally(() => {
      window.location.assign('/panel/login');
    });
  }, [isSigningOut]);

  return {
    identity,
    isLoading,
    authRequired,
    errorMessage,
    isSigningOut,
    handleSignOut,
    revalidate: checkAuth,
  };
}
