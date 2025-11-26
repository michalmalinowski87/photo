import React from 'react';
import { Loading } from '../loading/Loading';

interface ZipDownloadProgressProps {
  orderId: string;
  galleryId: string;
  status: 'generating' | 'downloading' | 'error' | 'success';
  error?: string;
  onDismiss: () => void;
}

export const ZipDownloadProgress: React.FC<ZipDownloadProgressProps> = ({
  orderId,
  galleryId,
  status,
  error,
  onDismiss,
}) => {
  const getStatusText = () => {
    switch (status) {
      case 'generating':
        return 'Generowanie ZIP...';
      case 'downloading':
        return 'Pobieranie ZIP...';
      case 'error':
        return 'Błąd';
      case 'success':
        return 'Pobrano';
      default:
        return 'Przetwarzanie...';
    }
  };

  const getStatusIcon = () => {
    if (status === 'error') {
      return (
        <svg className="w-5 h-5 text-error-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      );
    }
    if (status === 'success') {
      return (
        <svg className="w-5 h-5 text-success-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      );
    }
    return <Loading size="sm" />;
  };

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-4 min-w-[320px] max-w-[400px]">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 mt-0.5">
            {getStatusIcon()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-1">
              <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
                {getStatusText()}
              </h4>
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onDismiss();
                }}
                className="flex-shrink-0 ml-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors cursor-pointer relative z-10 p-1"
                style={{ zIndex: 10, pointerEvents: 'auto' }}
                aria-label="Zamknij"
                type="button"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
              Zamówienie: {orderId}
            </p>
            {error && (
              <p className="text-xs text-error-600 dark:text-error-400 mt-1 break-words">
                {error}
              </p>
            )}
            {status === 'generating' && (
              <div className="mt-2">
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1">
                  <div className="bg-brand-500 h-1 rounded-full animate-pulse" style={{ width: '60%' }} />
                </div>
              </div>
            )}
          </div>
        </div>
    </div>
  );
};

