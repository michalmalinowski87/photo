import React, { createContext, useContext, useCallback, ReactNode, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useDownloadStore } from '../store/downloadSlice';
import { ZipDownloadProgress } from '../components/ui/zip-download/ZipDownloadProgress';

interface ZipDownloadContextType {
  startZipDownload: (orderId: string, galleryId: string) => string;
  updateZipDownload: (id: string, updates: Partial<{ status: 'generating' | 'downloading' | 'error' | 'success'; error?: string }>) => void;
  removeZipDownload: (id: string) => void;
}

const ZipDownloadContext = createContext<ZipDownloadContextType | undefined>(undefined);

export const useZipDownload = () => {
  const context = useContext(ZipDownloadContext);
  if (!context) {
    throw new Error('useZipDownload must be used within ZipDownloadProvider');
  }
  return context;
};

interface ZipDownloadProviderProps {
  children: ReactNode;
}

export const ZipDownloadProvider: React.FC<ZipDownloadProviderProps> = ({ children }) => {
  // Read from Zustand store (same store used by withZipDownload hook)
  const downloads = useDownloadStore((state) => state.downloads);
  const addDownload = useDownloadStore((state) => state.addDownload);
  const updateDownload = useDownloadStore((state) => state.updateDownload);
  const removeDownload = useDownloadStore((state) => state.removeDownload);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const startZipDownload = useCallback((orderId: string, galleryId: string): string => {
    const id = `${galleryId}-${orderId}-${Date.now()}`;
    // Remove any existing downloads for this order/gallery combination
    const currentDownloads = useDownloadStore.getState().downloads;
    Object.entries(currentDownloads).forEach(([existingId, download]) => {
      if (download.orderId === orderId && download.galleryId === galleryId) {
        removeDownload(existingId);
      }
    });
    addDownload(id, { orderId, galleryId, status: 'generating' });
    return id;
  }, [addDownload, removeDownload]);

  const updateZipDownload = useCallback((id: string, updates: Partial<{ status: 'generating' | 'downloading' | 'error' | 'success'; error?: string }>) => {
    updateDownload(id, updates);
  }, [updateDownload]);

  const removeZipDownload = useCallback((id: string) => {
    removeDownload(id);
  }, [removeDownload]);

  const downloadItems = Object.values(downloads);

  return (
    <ZipDownloadContext.Provider value={{ startZipDownload, updateZipDownload, removeZipDownload }}>
      {children}
      {/* Render download progress indicators via portal */}
      {mounted && typeof window !== 'undefined' && downloadItems.length > 0 && createPortal(
        <div 
          className="flex flex-col gap-2 pointer-events-none" 
          style={{ 
            position: 'fixed',
            bottom: '16px',
            right: '16px',
            zIndex: 2147483646, // Very high z-index to ensure it's above everything
            pointerEvents: 'none',
          } as React.CSSProperties}
        >
          {downloadItems.map((download) => (
            <div 
              key={download.id} 
              className="pointer-events-auto"
              style={{ pointerEvents: 'auto' }}
            >
              <ZipDownloadProgress
                orderId={download.orderId}
                galleryId={download.galleryId}
                status={download.status}
                error={download.error}
                onDismiss={() => removeZipDownload(download.id)}
              />
            </div>
          ))}
        </div>,
        document.body
      )}
    </ZipDownloadContext.Provider>
  );
};

