import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { ZipDownloadProgress } from '../components/ui/zip-download/ZipDownloadProgress';

interface ZipDownload {
  id: string;
  orderId: string;
  galleryId: string;
  status: 'generating' | 'downloading' | 'error' | 'success';
  error?: string;
}

interface ZipDownloadContextType {
  startZipDownload: (orderId: string, galleryId: string) => string;
  updateZipDownload: (id: string, updates: Partial<ZipDownload>) => void;
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
  const [downloads, setDownloads] = useState<ZipDownload[]>([]);

  const startZipDownload = useCallback((orderId: string, galleryId: string): string => {
    const id = `${galleryId}-${orderId}-${Date.now()}`;
    setDownloads((prev) => [
      ...prev.filter((d) => !(d.orderId === orderId && d.galleryId === galleryId)),
      { id, orderId, galleryId, status: 'generating' },
    ]);
    return id;
  }, []);

  const updateZipDownload = useCallback((id: string, updates: Partial<ZipDownload>) => {
    setDownloads((prev) =>
      prev.map((d) => (d.id === id ? { ...d, ...updates } : d))
    );
  }, []);

  const removeZipDownload = useCallback((id: string) => {
    setDownloads((prev) => prev.filter((d) => d.id !== id));
  }, []);

  return (
    <ZipDownloadContext.Provider value={{ startZipDownload, updateZipDownload, removeZipDownload }}>
      {children}
      {/* Render download progress indicators */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
        {downloads.map((download) => (
          <div key={download.id} className="pointer-events-auto">
            <ZipDownloadProgress
              orderId={download.orderId}
              galleryId={download.galleryId}
              status={download.status}
              error={download.error}
              onDismiss={() => removeZipDownload(download.id)}
            />
          </div>
        ))}
      </div>
    </ZipDownloadContext.Provider>
  );
};

