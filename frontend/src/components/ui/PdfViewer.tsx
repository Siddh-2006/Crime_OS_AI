'use client';

import React, { useEffect, useState } from 'react';
import { Loader2, ExternalLink, Download, AlertCircle, RefreshCw } from 'lucide-react';

interface PdfViewerProps {
  url: string;
  title?: string;
  className?: string;
  showToolbar?: boolean;
}

/** Returns true if the URL is a Cloudinary or other CDN URL that supports direct iframe embedding */
function isDirectEmbeddable(url: string): boolean {
  try {
    const u = new URL(url);
    return (
      u.hostname.includes('cloudinary.com') ||
      u.hostname.includes('googleapis.com') ||
      u.hostname.includes('drive.google.com') ||
      u.hostname.includes('storage.cloud.google.com')
    );
  } catch {
    return false;
  }
}

/** For Cloudinary image-type PDF uploads, swap /image/upload/ → /raw/upload/ so the PDF MIME is served correctly */
function normalizeCloudinaryPdfUrl(url: string): string {
  if (!url.includes('cloudinary.com')) return url;
  // If uploaded as image type, force raw delivery
  return url.replace('/image/upload/', '/raw/upload/');
}

export function PdfViewer({ 
  url, 
  title = 'PDF Document', 
  className = 'w-full h-full',
  showToolbar = false
}: PdfViewerProps) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [useDirectEmbed, setUseDirectEmbed] = useState<boolean>(false);

  const resolvedUrl = url ? normalizeCloudinaryPdfUrl(url) : '';

  const fetchPdfBlob = () => {
    if (!resolvedUrl) {
      setError('No PDF URL provided');
      setLoading(false);
      return;
    }

    // Direct support if already a data URL or blob URL
    if (resolvedUrl.startsWith('blob:') || resolvedUrl.startsWith('data:application/pdf')) {
      setBlobUrl(resolvedUrl);
      setLoading(false);
      return;
    }

    // For Cloudinary and other CDN URLs — embed directly in iframe, skip fetch
    if (isDirectEmbeddable(resolvedUrl)) {
      setUseDirectEmbed(true);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    setUseDirectEmbed(false);

    let active = true;
    let createdUrl: string | null = null;

    fetch(resolvedUrl, {
      method: 'GET',
      headers: { Accept: 'application/pdf,*/*' },
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Server returned HTTP ${response.status}`);
        }
        const rawBlob = await response.blob();
        const pdfBlob = new Blob([rawBlob], { type: 'application/pdf' });
        if (active) {
          createdUrl = URL.createObjectURL(pdfBlob);
          setBlobUrl(createdUrl);
          setLoading(false);
        }
      })
      .catch((err: any) => {
        if (active) {
          console.error('Failed to stream PDF for inline preview:', err);
          // Fall back to direct embed on fetch failure
          setUseDirectEmbed(true);
          setLoading(false);
        }
      });

    return () => {
      active = false;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  };

  useEffect(() => {
    setBlobUrl(null);
    setUseDirectEmbed(false);
    setError(null);
    const cleanup = fetchPdfBlob();
    return () => {
      if (cleanup) cleanup();
      if (blobUrl && blobUrl.startsWith('blob:')) URL.revokeObjectURL(blobUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedUrl]);

  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = blobUrl || resolvedUrl;
    link.download = title.endsWith('.pdf') ? title : `${title}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const iframeSrc = blobUrl || (useDirectEmbed ? resolvedUrl : null);

  return (
    <div className={`relative flex flex-col rounded-xl border border-border bg-surface overflow-hidden ${className}`}>
      {/* Optional Top action bar */}
      {showToolbar && (
        <div className="flex-shrink-0 h-9 flex items-center justify-between border-b border-border bg-surface-elevated px-3 text-xs z-10 select-none">
          <span className="font-semibold text-text-secondary truncate max-w-[260px]" title={title}>
            {title}
          </span>
          <div className="flex items-center gap-2">
            {resolvedUrl && (
              <a
                href={resolvedUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-semibold text-brand-primary hover:bg-brand-primary/10 transition-colors"
                title="Open full page in new tab"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                <span>Open in Tab</span>
              </a>
            )}
            <button
              type="button"
              onClick={handleDownload}
              className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-semibold text-text-secondary hover:text-text-primary hover:bg-surface-elevated transition-colors"
              title="Download PDF"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Download</span>
            </button>
          </div>
        </div>
      )}

      {/* Main preview container */}
      <div className="relative flex-1 min-h-0 w-full h-full flex items-center justify-center bg-surface-elevated/20 overflow-hidden">
        {loading && (
          <div className="flex flex-col items-center justify-center gap-2 p-6 text-text-secondary">
            <Loader2 className="h-8 w-8 animate-spin text-brand-primary" />
            <p className="text-xs font-medium">Loading PDF preview...</p>
          </div>
        )}

        {error && !loading && (
          <div className="flex flex-col items-center justify-center gap-3 p-6 text-center max-w-sm">
            <AlertCircle className="h-8 w-8 text-semantic-warning" />
            <div className="space-y-1">
              <p className="text-xs font-bold text-text-primary">Preview Not Available Inline</p>
              <p className="text-[11px] text-text-secondary leading-relaxed">
                The document could not be previewed directly. You can still open it in a new tab or download it.
              </p>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <button
                type="button"
                onClick={fetchPdfBlob}
                className="inline-flex items-center gap-1 rounded bg-surface border border-border px-2.5 py-1 text-xs font-medium text-text-primary hover:bg-surface-elevated transition-colors"
              >
                <RefreshCw className="h-3 w-3" />
                Retry
              </button>
              <a
                href={resolvedUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded bg-brand-primary px-3 py-1 text-xs font-semibold text-white shadow-xs hover:bg-brand-primary/90 transition-colors"
              >
                <ExternalLink className="h-3 w-3" />
                Open File
              </a>
            </div>
          </div>
        )}

        {iframeSrc && !loading && !error && (
          <iframe
            src={iframeSrc}
            title={title}
            className="w-full h-full border-0 block"
            onError={() => setError('Could not embed PDF')}
          />
        )}
      </div>
    </div>
  );
}

export default PdfViewer;
