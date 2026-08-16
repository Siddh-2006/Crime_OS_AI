'use client';

import { useEffect } from 'react';

export function ChunkErrorRecovery() {
  useEffect(() => {
    const handleChunkError = () => {
      const hasReloaded = sessionStorage.getItem('chunk-reload-attempted');
      if (hasReloaded) return;

      sessionStorage.setItem('chunk-reload-attempted', 'true');
      window.location.reload();
    };

    const handleError = (event: ErrorEvent) => {
      const message = event?.message ?? '';
      const isChunkError =
        message.includes('Loading chunk') ||
        message.includes('ChunkLoadError') ||
        message.includes('Failed to fetch dynamically imported module') ||
        message.includes('network error') ||
        (event?.error && event.error?.name === 'ChunkLoadError');

      if (isChunkError) {
        handleChunkError();
      }
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event?.reason;
      const message = reason?.message ?? String(reason ?? '');
      const isChunkError =
        message.includes('Loading chunk') ||
        message.includes('ChunkLoadError') ||
        message.includes('Failed to fetch dynamically imported module');

      if (isChunkError) {
        handleChunkError();
      }
    };

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, []);

  return null;
}
