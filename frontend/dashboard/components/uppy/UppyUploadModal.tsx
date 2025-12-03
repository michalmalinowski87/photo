import type { UppyFile } from "@uppy/core";
import Uppy from "@uppy/core";
import { useEffect, useRef, useState } from "react";

import { useUppyUpload, type UseUppyUploadConfig } from "../../hooks/useUppyUpload";
import Button from "../ui/button/Button";
import { Modal } from "../ui/modal";

interface UppyUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: UseUppyUploadConfig;
}

// ============================================================================
// Helper Functions
// ============================================================================

function isImageFile(file: File | { name: string; type?: string }): boolean {
  return (
    file.type?.startsWith("image/") ||
    /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(file.name)
  );
}

function addFileToUppy(uppy: Uppy, file: File): void {
  if (!isImageFile(file)) {
    return;
  }
  try {
    uppy.addFile({
      source: "Local",
      name: file.name,
      type: file.type || "image/jpeg",
      data: file,
    });
  } catch (error) {
    // Silently fail - file restrictions will be handled by Uppy
  }
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) {
    return "0 Bytes";
  }
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${Math.round((bytes / Math.pow(k, i)) * 100) / 100} ${sizes[i]}`;
}

function formatSpeed(bytesPerSecond: number): string {
  return bytesPerSecond === 0 ? "0 KB/s" : `${formatFileSize(bytesPerSecond)}/s`;
}

function formatTimeRemaining(seconds: number): string {
  if (seconds <= 0 || !isFinite(seconds)) {
    return "—";
  }
  if (seconds < 60) {
    return `${Math.round(seconds)}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60);
  return `${minutes}m ${remainingSeconds}s`;
}

function getFileProgress(file: UppyFile): number {
  return file.progress?.percentage ?? 0;
}

function getFileStatus(file: UppyFile): "completed" | "uploading" | "paused" | "error" | "pending" {
  if (file.progress?.uploadComplete) {
    return "completed";
  }
  if (file.progress?.uploadStarted) {
    return file.isPaused ? "paused" : "uploading";
  }
  if (file.error) {
    return "error";
  }
  return "pending";
}

async function readDirectoryEntry(entry: FileSystemEntry, uppy: Uppy): Promise<void> {
  if (entry.isDirectory) {
    const dirReader = (entry as FileSystemDirectoryEntry).createReader();
    const entries: FileSystemEntry[] = [];

    const readEntries = (): Promise<void> => {
      return new Promise((resolve) => {
        dirReader.readEntries((results) => {
          if (results.length > 0) {
            entries.push(...results);
            readEntries().then(resolve);
          } else {
            resolve();
          }
        });
      });
    };

    await readEntries();
    for (const subEntry of entries) {
      await readDirectoryEntry(subEntry, uppy);
    }
  } else if (entry.isFile) {
    const fileEntry = entry as FileSystemFileEntry;
    fileEntry.file((file) => {
      addFileToUppy(uppy, file);
    });
  }
}

// ============================================================================
// Component
// ============================================================================

export const UppyUploadModal: React.FC<UppyUploadModalProps> = ({
  isOpen,
  onClose,
  config,
}) => {
  const {
    uppy,
    uploading,
    uploadComplete,
    uploadResult,
    uploadProgress,
    isPaused,
    startUpload,
    cancelUpload,
    pauseUpload,
    resumeUpload,
    pauseResumeFile,
    resetUploadState,
  } = useUppyUpload(config);

  const [files, setFiles] = useState<UppyFile[]>([]);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const isMountedRef = useRef(true);
  const isOpenRef = useRef(isOpen);
  const lastSyncedFileIdsRef = useRef<string[]>([]);
  // Cache blob URLs to avoid recreating them on every render
  const blobUrlCacheRef = useRef<Map<string, string>>(new Map());

  // Reset upload state when modal closes (but don't clear Uppy files - let user see completed uploads)
  // Only reset our UI state, files will be cleared when user explicitly closes after completion
  useEffect(() => {
    if (!isOpen && !uploading) {
      resetUploadState();
    }
  }, [isOpen, uploading, resetUploadState]);

  // Update ref when isOpen changes
  useEffect(() => {
    isOpenRef.current = isOpen;
  }, [isOpen]);

  // Trust Uppy's state - just sync our display with Uppy's file list
  // Uppy manages file state internally, we just listen to changes and display
  // CRITICAL: Only sync when modal is open to prevent stale state from closed modal
  useEffect(() => {
    if (!uppy) {
      return;
    }

    // Only register event handlers and sync when modal is open
    if (!isOpen) {
      // When modal closes, clear local files state immediately
      setFiles([]);
      return;
    }

    isMountedRef.current = true;

    // Sync our files state with Uppy's current state
    // Trust Uppy - it manages all file state, we just display it
    // Only sync if files actually changed to prevent unnecessary re-renders
    const syncFiles = () => {
      // Use ref to check if modal is still open (avoids stale closure)
      if (!isMountedRef.current || !uppy || !isOpenRef.current) {
        return;
      }
      // Get current files from Uppy - this is the source of truth
      const uppyFiles = Object.values(uppy.getFiles());
      const currentFileIds = uppyFiles.map((f: UppyFile) => f.id).sort();
      const lastFileIds = lastSyncedFileIdsRef.current.sort();
      
      // Only sync if files actually changed (compare IDs)
      const filesChanged =
        currentFileIds.length !== lastFileIds.length ||
        !currentFileIds.every((id, idx) => id === lastFileIds[idx]);
      
      if (!filesChanged) {
        return; // No change, skip sync
      }
      
      lastSyncedFileIdsRef.current = currentFileIds;
      setFiles(uppyFiles);
    };

    // Initial sync - get files that Uppy already has (should be 0 after clear)
    syncFiles();

    // Listen to ALL Uppy events that affect file state
    // Uppy will notify us of every change, we just display what Uppy tells us
    const eventHandlers = [
      "file-added",
      "file-removed",
      "files-added",
      "upload-progress",
      "upload",
      "upload-success",
      "thumbnail:generated",
      "upload-error",
      "restriction-failed",
      "complete",
    ];

    eventHandlers.forEach((event) => {
      uppy.on(event as any, syncFiles);
    });

    return () => {
      isMountedRef.current = false;
      eventHandlers.forEach((event) => {
        uppy.off(event as any, syncFiles);
      });
      // Clear files and reset tracking when effect cleans up (modal closed)
      setFiles([]);
      lastSyncedFileIdsRef.current = [];
    };
  }, [uppy, isOpen]);

  const handleClose = () => {
    if (uploading) {
      // Immediately pause all uploads before showing confirmation
      // Use the hook's pauseUpload() to ensure state is properly updated
      pauseUpload();
      setShowCloseConfirm(true);
    } else {
      // Clear Uppy files when user explicitly closes
      // This ensures fresh state for next open
      if (uppy) {
        // Clear local state FIRST so it's immediately updated
        setFiles([]);
        // Reset file tracking
        lastSyncedFileIdsRef.current = [];
        // Clean up blob URLs
        blobUrlCacheRef.current.forEach((url) => URL.revokeObjectURL(url));
        blobUrlCacheRef.current.clear();
        // Then clear Uppy files
        uppy.clear();
      }
      // Reset upload state when closing
      resetUploadState();
      onClose();
    }
  };

  const handleConfirmClose = async () => {
    // User confirmed - cancel everything and delete from S3
    await cancelUpload(); // This already clears files and resets state via cancelUpload
    setShowCloseConfirm(false);
    onClose();
  };

  const handleCancelClose = () => {
    // User canceled - resume all paused uploads
    setShowCloseConfirm(false);
    
    // Use the hook's resumeUpload() - same as the progress bar uses
    // This ensures proper state updates and synchronization
    if (uploading) {
      resumeUpload();
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !uppy || uploadComplete) {
      return;
    }
    Array.from(e.target.files).forEach((file) => addFileToUppy(uppy, file));
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleFolderInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !uppy || uploadComplete) {
      return;
    }
    Array.from(e.target.files).forEach((file) => addFileToUppy(uppy, file));
    if (folderInputRef.current) {
      folderInputRef.current.value = "";
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!uploading && !uploadComplete) {setIsDragging(true);}
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (uploading || uploadComplete || !uppy) {
      return;
    }

    const items = e.dataTransfer.items;
    if (items && items.length > 0) {
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind === "file") {
          const entry = (item as any).webkitGetAsEntry?.();
          if (entry?.isDirectory) {
            void readDirectoryEntry(entry, uppy);
          } else {
            const file = item.getAsFile();
            if (file) {
              addFileToUppy(uppy, file);
            }
          }
        }
      }
    } else {
      const droppedFiles = e.dataTransfer.files;
      if (droppedFiles) {
        Array.from(droppedFiles).forEach((file) => addFileToUppy(uppy, file));
      }
    }
  };

  const handleRemoveFile = (fileId: string) => {
    if (uppy && !uploading && !uploadComplete) {
      uppy.removeFile(fileId);
    }
  };

  const getThumbnail = (file: UppyFile): string | undefined => {
    // Uppy's ThumbnailGenerator provides file.preview (data URL or blob URL)
    // Prefer this as it's already optimized by Uppy
    if (file.preview) {
      return file.preview;
    }
    
    // Fallback: create blob URL from File object
    // Cache the blob URL to avoid recreating it on every render
    if (file.data && file.data instanceof File) {
      const cachedUrl = blobUrlCacheRef.current.get(file.id);
      if (cachedUrl) {
        return cachedUrl;
      }
      
      const blobUrl = URL.createObjectURL(file.data);
      blobUrlCacheRef.current.set(file.id, blobUrl);
      return blobUrl;
    }
    
    return undefined;
  };

  // Clean up blob URLs when files are removed to prevent memory leaks
  useEffect(() => {
    if (!uppy) {return;}
    
    const cleanup = () => {
      const currentFiles = Object.values(uppy.getFiles());
      const currentFileIds = new Set(currentFiles.map((f: UppyFile) => f.id));
      
      // Remove blob URLs for files that no longer exist
      blobUrlCacheRef.current.forEach((url, fileId) => {
        if (!currentFileIds.has(fileId)) {
          URL.revokeObjectURL(url);
          blobUrlCacheRef.current.delete(fileId);
        }
      });
    };
    
    uppy.on("file-removed", cleanup);
    return () => {
      uppy.off("file-removed", cleanup);
      // Cleanup all blob URLs when component unmounts
      blobUrlCacheRef.current.forEach((url) => URL.revokeObjectURL(url));
      blobUrlCacheRef.current.clear();
    };
  }, [uppy]);


  if (!isOpen) {
    return null;
  }

  const progressPercentage =
    uploadProgress.total > 0
      ? Math.round((uploadProgress.current / uploadProgress.total) * 100)
      : 0;

  return (
    <>
      {showCloseConfirm && (
        <Modal isOpen={showCloseConfirm} onClose={handleCancelClose} className="max-w-md">
          <div className="p-6">
            <h2 className="text-xl font-bold mb-4 text-gray-900 dark:text-white">
              Anulować przesyłanie?
            </h2>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              Przesyłanie zostało wstrzymane. Jeśli anulujesz, wszystkie przesłane pliki zostaną usunięte z galerii.
            </p>
            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={handleCancelClose}>
                Wznów przesyłanie
              </Button>
              <Button variant="primary" onClick={handleConfirmClose}>
                Anuluj i usuń pliki
              </Button>
            </div>
          </div>
        </Modal>
      )}

      <Modal
        isOpen={isOpen && !showCloseConfirm}
        onClose={handleClose}
        className="w-[70vw] h-[70vh] max-w-[90vw] max-h-[90vh]"
        showCloseButton={true}
        closeOnClickOutside={false}
      >
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`flex flex-col ${isDragging ? "bg-blue-50 dark:bg-blue-900/20" : ""}`}
          style={{ height: "70vh", maxHeight: "70vh", display: "flex", flexDirection: "column" }}
        >
          <div style={{ flex: "1 1 0%", overflowY: "auto", overflowX: "hidden", minHeight: 0 }}>
            <div className="p-6">
              <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">
                Prześlij zdjęcia
              </h2>

              <div
                className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors mb-4 ${
                  isDragging
                    ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                    : "border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800"
                } ${uploading || uploadComplete ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
                onClick={() => {
                  if (!uploading && !uploadComplete) {fileInputRef.current?.click();}
                }}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="image/*"
                  webkitdirectory=""
                  directory=""
                  onChange={handleFileInputChange}
                  className="hidden"
                  disabled={uploading || uploadComplete}
                />
                <div className="space-y-2">
                  <svg
                    className="mx-auto h-12 w-12 text-gray-400"
                    stroke="currentColor"
                    fill="none"
                    viewBox="0 0 48 48"
                  >
                    <path
                      d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-4h12m-6-4v12m0 0l-4-4m4 4l4-4"
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Przeciągnij i upuść zdjęcia lub cały folder tutaj, lub kliknij, aby wybrać pliki
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-500">
                    Obsługiwane formaty: JPG, PNG, WebP
                  </p>
                </div>
                <div className="flex gap-2 justify-center mt-4">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      if (!uploading && !uploadComplete) {folderInputRef.current?.click();}
                    }}
                    disabled={uploading || uploadComplete}
                  >
                    <svg
                      className="w-4 h-4 mr-2"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                      />
                    </svg>
                    Wybierz folder
                  </Button>
                </div>
                <input
                  ref={folderInputRef}
                  type="file"
                  multiple
                  accept="image/*"
                  {...({ webkitdirectory: "" } as any)}
                  onChange={handleFolderInputChange}
                  className="hidden"
                  disabled={uploading || uploadComplete}
                />
              </div>

              {files.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                  {files.map((file) => {
                    const status = getFileStatus(file);
                    const progress = getFileProgress(file);
                    const thumbnail = getThumbnail(file);

                    return (
                      <div
                        key={file.id}
                        className="relative group bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden"
                      >
                        <div className="aspect-square relative">
                          {thumbnail ? (
                            <img
                              src={thumbnail}
                              alt={file.name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
                              <svg
                                className="w-12 h-12 text-gray-400"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                                />
                              </svg>
                            </div>
                          )}

                          {(status === "uploading" || status === "paused") && (
                            <div className="absolute inset-0 z-10">
                              <div className="absolute inset-0 bg-black/50 dark:bg-black/60"></div>
                              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/50 to-transparent"></div>

                              <button
                                onClick={() => {
                                  // eslint-disable-next-line no-console
                                  console.log("[UppyUploadModal] Individual file pause/resume clicked", {
                                    fileId: file.id,
                                    fileName: file.name,
                                    currentState: file.isPaused ? "paused" : "uploading",
                                    willChangeTo: file.isPaused ? "uploading" : "paused",
                                  });
                                  pauseResumeFile(file.id);
                                }}
                                className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-20 p-3 bg-white/20 hover:bg-white/30 rounded-full backdrop-blur-sm transition-all shadow-lg"
                                type="button"
                                title={file.isPaused ? "Wznów" : "Wstrzymaj"}
                              >
                                {file.isPaused ? (
                                  <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M8 5v14l11-7z" />
                                  </svg>
                                ) : (
                                  <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                                  </svg>
                                )}
                              </button>

                              <div className="absolute bottom-6 left-0 right-0 text-center z-10">
                                <p className="text-white text-xs font-bold drop-shadow-lg">
                                  {Math.round(progress)}%
                                </p>
                              </div>

                              <div className="absolute bottom-0 left-0 right-0 h-2 bg-black/50 dark:bg-black/60">
                                <div
                                  className="h-full bg-white dark:bg-blue-400 transition-all duration-200 ease-out shadow-sm"
                                  style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
                                ></div>
                              </div>
                            </div>
                          )}

                          {status === "completed" && (
                            <div className="absolute top-2 right-2 bg-green-500 text-white text-xs px-2 py-1 rounded-full shadow-lg flex items-center justify-center w-6 h-6">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={3}
                                  d="M5 13l4 4L19 7"
                                />
                              </svg>
                            </div>
                          )}

                          {status === "error" && (
                            <div className="absolute top-2 right-2 bg-red-500 text-white text-xs px-2 py-1 rounded-full shadow-lg flex items-center justify-center w-6 h-6">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={3}
                                  d="M6 18L18 6M6 6l12 12"
                                />
                              </svg>
                            </div>
                          )}

                          {status !== "uploading" && !uploadComplete && (
                            <button
                              onClick={() => handleRemoveFile(file.id)}
                              className="absolute top-2 right-2 p-1.5 bg-white/90 dark:bg-gray-800/90 text-gray-700 dark:text-gray-200 rounded-full opacity-0 group-hover:opacity-100 transition-all hover:bg-red-500 hover:text-white shadow-lg backdrop-blur-sm"
                              type="button"
                              title="Usuń"
                            >
                              <svg
                                className="w-4 h-4"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2.5}
                                  d="M6 18L18 6M6 6l12 12"
                                />
                              </svg>
                            </button>
                          )}
                        </div>

                        <div className="p-2">
                          <p
                            className="text-xs font-medium text-gray-900 dark:text-white truncate mb-0.5"
                            title={file.name}
                          >
                            {file.name}
                          </p>
                          <div className="flex items-center justify-between">
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              {formatFileSize(file.size || 0)}
                            </p>
                            {status === "uploading" && (
                              <p className="text-xs text-gray-600 dark:text-gray-300 font-semibold">
                                {Math.round(progress)}%
                              </p>
                            )}
                          </div>
                          {status === "error" && file.error && (
                            <p
                              className="text-xs text-red-600 dark:text-red-400 mt-1 truncate"
                              title={file.error.message}
                            >
                              {file.error.message}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-4 px-6 py-4 flex-shrink-0 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
            <div className="flex items-center justify-between gap-4">
              <div className="flex-1">
                {uploading ? (
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => {
                        // eslint-disable-next-line no-console
                        console.log("[UppyUploadModal] Global pause/resume clicked", {
                          currentState: isPaused ? "paused" : "uploading",
                          willChangeTo: isPaused ? "uploading" : "paused",
                          action: isPaused ? "resume" : "pause",
                        });
                        if (isPaused) {
                          resumeUpload();
                        } else {
                          pauseUpload();
                        }
                      }}
                      className="p-1.5 text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors flex-shrink-0"
                      type="button"
                      title={isPaused ? "Wznów" : "Wstrzymaj"}
                    >
                      {isPaused ? (
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M8 5v14l11-7z" />
                        </svg>
                      ) : (
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                        </svg>
                      )}
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-sm font-medium text-gray-900 dark:text-white">
                          Przesyłanie...
                        </div>
                        <div className="text-sm text-gray-600 dark:text-gray-400">
                          {progressPercentage}%
                        </div>
                      </div>
                      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
                        <div
                          className="bg-blue-600 dark:bg-blue-500 h-2 rounded-full transition-all duration-300"
                          style={{ width: `${progressPercentage}%` }}
                        />
                      </div>
                      <div className="flex items-center justify-between text-xs text-gray-600 dark:text-gray-400 mt-1">
                        <span>
                          {uploadProgress.current} / {uploadProgress.total} •{" "}
                          {formatFileSize(uploadProgress.bytesUploaded)} /{" "}
                          {formatFileSize(uploadProgress.bytesTotal)}
                        </span>
                        <div className="flex items-center gap-4">
                          {uploadProgress.speed > 0 && (
                            <span className="flex items-center gap-1">
                              <svg
                                className="w-3 h-3"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M5 10l7-7m0 0l7 7m-7-7v18"
                                />
                              </svg>
                              {formatSpeed(uploadProgress.speed)}
                            </span>
                          )}
                          {uploadProgress.timeRemaining > 0 && (
                            <span>{formatTimeRemaining(uploadProgress.timeRemaining)}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : uploadComplete && uploadResult ? (
                  <div className="flex items-center gap-2">
                    <svg
                      className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    <p className="text-sm font-medium text-green-800 dark:text-green-200">
                      {uploadResult.failed > 0
                        ? uploadResult.successful > 0
                          ? `Przesłano ${uploadResult.successful} z ${uploadResult.successful + uploadResult.failed} ${config.type === "finals" ? "zdjęć finalnych" : "zdjęć"}. ${uploadResult.failed} nie powiodło się.`
                          : `Nie udało się przesłać żadnego ${config.type === "finals" ? "zdjęcia finalnego" : "zdjęcia"}.`
                        : `${uploadResult.successful} ${uploadResult.successful === 1 ? (config.type === "finals" ? "zdjęcie finalne" : "zdjęcie") : (config.type === "finals" ? "zdjęć finalnych" : "zdjęć")} zostało przesłanych`}
                    </p>
                  </div>
                ) : null}
              </div>

              <div className="flex gap-3 flex-shrink-0">
                {uploadComplete ? (
                  <Button variant="primary" onClick={handleClose} className="min-w-[120px]">
                    Zamknij
                  </Button>
                ) : (
                  <>
                    <Button
                      variant="secondary"
                      onClick={handleClose}
                      disabled={uploading && files.length === 0}
                    >
                      {uploading ? "Anuluj" : "Zamknij"}
                    </Button>
                    {files.length > 0 && !uploading && (
                      <Button onClick={startUpload} variant="primary">
                        Prześlij {files.length} {files.length === 1 ? "plik" : "plików"}
                      </Button>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </Modal>
    </>
  );
};
