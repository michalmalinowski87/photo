import type { UppyFile } from "@uppy/core";
import Uppy from "@uppy/core";
import { useEffect, useRef, useState } from "react";

import { useUppyUpload, type UseUppyUploadConfig } from "../../hooks/useUppyUpload";
import Button from "../ui/button/Button";
import { Loading } from "../ui/loading/Loading";
import { Modal } from "../ui/modal";

interface UppyUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: UseUppyUploadConfig;
}

export const UppyUploadModal: React.FC<UppyUploadModalProps> = ({
  isOpen,
  onClose,
  config,
}) => {
  const { 
    uppy, 
    uploading, 
    uploadProgress, 
    isPaused,
    startUpload, 
    cancelUpload,
    pauseUpload,
    resumeUpload,
    pauseResumeFile,
  } = useUppyUpload(config);
  const [files, setFiles] = useState<UppyFile[]>([]);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [showRecoveryBanner, setShowRecoveryBanner] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const blobUrlsRef = useRef<Map<string, string>>(new Map()); // Track blob URLs for cleanup
  const thumbnailCacheRef = useRef<Map<string, string>>(new Map()); // Cache thumbnails to prevent re-rendering

  // Update files list when Uppy state changes
  useEffect(() => {
    if (!uppy) {
      return;
    }

    const updateFiles = () => {
      const uppyFiles = Object.values(uppy.getFiles());
      setFiles(uppyFiles);
    };

    // Initial update
    updateFiles();

    // Listen for file changes
    uppy.on("file-added", updateFiles);
    uppy.on("file-removed", updateFiles);
    uppy.on("files-added", updateFiles);
    
    // Listen for thumbnail generation - important for showing previews
    // When thumbnail is generated, update cache and re-render
    const handleThumbnailGenerated = (file: UppyFile, preview: string) => {
      // Update cache with new thumbnail
      thumbnailCacheRef.current.set(file.id, preview);
      // Update files to trigger re-render
      updateFiles();
    };
    uppy.on("thumbnail:generated", handleThumbnailGenerated);

    // Listen for Golden Retriever restoration
    const handleRestored = () => {
      setShowRecoveryBanner(true);
      updateFiles();
    };
    uppy.on("restored", handleRestored);

    return () => {
      uppy.off("file-added", updateFiles);
      uppy.off("file-removed", updateFiles);
      uppy.off("files-added", updateFiles);
      uppy.off("thumbnail:generated", handleThumbnailGenerated);
      uppy.off("restored", handleRestored);
    };
  }, [uppy]);

  // Handle modal close with confirmation during upload
  const handleClose = () => {
    if (uploading) {
      setShowCloseConfirm(true);
    } else {
      onClose();
    }
  };

  const handleConfirmClose = () => {
    cancelUpload();
    setShowCloseConfirm(false);
    onClose();
  };

  const handleCancelClose = () => {
    setShowCloseConfirm(false);
  };

  // Handle file input change (individual files)
  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    if (selectedFiles && uppy) {
      Array.from(selectedFiles).forEach((file) => {
        if (file.type?.startsWith("image/")) {
          uppy.addFile({
            source: "Local",
            name: file.name,
            type: file.type,
            data: file,
          });
        }
      });
    }
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // Handle folder input change (directory upload)
  const handleFolderInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    if (selectedFiles && uppy) {
      // When webkitdirectory is enabled, all files in the folder are included
      Array.from(selectedFiles).forEach((file) => {
        if (file.type?.startsWith("image/")) {
          uppy.addFile({
            source: "Local",
            name: file.name,
            type: file.type,
            data: file,
          });
        }
      });
    }
    // Reset input
    if (folderInputRef.current) {
      folderInputRef.current.value = "";
    }
  };

  // Handle drag and drop
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!uploading) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  // Recursively read directory entries and add image files to Uppy
  const readDirectoryEntry = async (entry: FileSystemEntry, uppyInstance: Uppy): Promise<void> => {
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
      
      // Process all entries
      for (const subEntry of entries) {
        await readDirectoryEntry(subEntry, uppyInstance);
      }
    } else if (entry.isFile) {
      const fileEntry = entry as FileSystemFileEntry;
      fileEntry.file((file) => {
        if (file.type?.startsWith("image/")) {
          uppyInstance.addFile({
            source: "Local",
            name: file.name,
            type: file.type,
            data: file,
          });
        }
      });
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (uploading || !uppy) {
      return;
    }

    // Handle directory drops (folders)
    const items = e.dataTransfer.items;
    if (items && items.length > 0) {
      // Check if it's a directory
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind === "file") {
          const entry = (item as any).webkitGetAsEntry?.();
          if (entry?.isDirectory) {
            // It's a directory - read all files recursively
            await readDirectoryEntry(entry, uppy);
          } else {
            // It's a file
            const file = item.getAsFile();
            if (file && file.type?.startsWith("image/")) {
              uppy.addFile({
                source: "Local",
                name: file.name,
                type: file.type,
                data: file,
              });
            }
          }
        }
      }
    } else {
      // Fallback to files API (for browsers that don't support directory drops)
      const droppedFiles = e.dataTransfer.files;
      if (droppedFiles) {
        Array.from(droppedFiles).forEach((file) => {
          if (file.type?.startsWith("image/")) {
            uppy.addFile({
              source: "Local",
              name: file.name,
              type: file.type,
              data: file,
            });
          }
        });
      }
    }
  };

  // Handle remove file - don't refetch, just remove from Uppy
  const handleRemoveFile = (fileId: string) => {
    if (uppy && !uploading) {
      uppy.removeFile(fileId);
      // No refetch - just remove from the list
    }
  };

  // Format file size
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) {return "0 Bytes";}
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${Math.round(bytes / Math.pow(k, i) * 100) / 100  } ${  sizes[i]}`;
  };

  // Format upload speed
  const formatSpeed = (bytesPerSecond: number): string => {
    if (bytesPerSecond === 0) {return "0 KB/s";}
    return `${formatFileSize(bytesPerSecond)}/s`;
  };

  // Format time remaining
  const formatTimeRemaining = (seconds: number): string => {
    if (seconds <= 0 || !isFinite(seconds)) {return "—";}
    if (seconds < 60) {
      return `${Math.round(seconds)}s`;
    }
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.round(seconds % 60);
    return `${minutes}m ${remainingSeconds}s`;
  };

  // Get file progress percentage
  const getFileProgress = (file: UppyFile): number => {
    if (!file.progress) {return 0;}
    return file.progress.percentage || 0;
  };

  // Get file status
  const getFileStatus = (file: UppyFile): string => {
    if (file.progress?.uploadComplete) {return "completed";}
    if (file.isPaused) {return "paused";}
    if (file.progress?.uploadStarted) {return "uploading";}
    if (file.error) {return "error";}
    return "pending";
  };

  // Get thumbnail preview - check multiple sources and cache results
  const getThumbnail = (file: UppyFile): string | undefined => {
    const fileId = file.id;
    
    // Check cache first - if we have a cached thumbnail, use it (prevents re-rendering)
    const cachedThumbnail = thumbnailCacheRef.current.get(fileId);
    if (cachedThumbnail) {
      return cachedThumbnail;
    }

    let thumbnail: string | undefined;

    // 1. Check Uppy's generated preview (from ThumbnailGenerator)
    if (file.preview) {
      // Clean up any blob URL we might have created for this file
      const existingBlobUrl = blobUrlsRef.current.get(fileId);
      if (existingBlobUrl) {
        URL.revokeObjectURL(existingBlobUrl);
        blobUrlsRef.current.delete(fileId);
      }
      thumbnail = file.preview;
    }
    // 2. Check our plugin's stored preview
    else if (file.meta?.thumbnailPreview) {
      // Clean up any blob URL we might have created for this file
      const existingBlobUrl = blobUrlsRef.current.get(fileId);
      if (existingBlobUrl) {
        URL.revokeObjectURL(existingBlobUrl);
        blobUrlsRef.current.delete(fileId);
      }
      thumbnail = file.meta.thumbnailPreview as string;
    }
    // 3. If file has data, create a blob URL as fallback (while waiting for thumbnail generator)
    else if (file.data && file.data instanceof File) {
      // Check if we already created a blob URL for this file
      const existingBlobUrl = blobUrlsRef.current.get(fileId);
      if (existingBlobUrl) {
        thumbnail = existingBlobUrl;
      } else {
        // Create new blob URL and store it
        const blobUrl = URL.createObjectURL(file.data);
        blobUrlsRef.current.set(fileId, blobUrl);
        thumbnail = blobUrl;
      }
    }

    // Cache the thumbnail so it persists across re-renders
    if (thumbnail) {
      thumbnailCacheRef.current.set(fileId, thumbnail);
    }

    return thumbnail;
  };

  // Cleanup blob URLs and cache when files are removed
  useEffect(() => {
    if (!uppy) {
      return;
    }

    const handleFileRemoved = (file: UppyFile) => {
      const fileId = file.id;
      // Clean up blob URL if it exists
      const blobUrl = blobUrlsRef.current.get(fileId);
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
        blobUrlsRef.current.delete(fileId);
      }
      // Remove from cache
      thumbnailCacheRef.current.delete(fileId);
    };

    uppy.on("file-removed", handleFileRemoved);

    return () => {
      uppy.off("file-removed", handleFileRemoved);
    };
  }, [uppy]);

  // Cleanup blob URLs on unmount
  useEffect(() => {
    return () => {
      blobUrlsRef.current.forEach((url) => {
        URL.revokeObjectURL(url);
      });
      blobUrlsRef.current.clear();
      thumbnailCacheRef.current.clear();
    };
  }, []);

  if (!isOpen) {
    return null;
  }

  return (
    <>
      {/* Close Confirmation Modal */}
      {showCloseConfirm && (
        <Modal isOpen={showCloseConfirm} onClose={handleCancelClose} className="max-w-md">
          <div className="p-6">
            <h2 className="text-xl font-bold mb-4 text-gray-900 dark:text-white">
              Przesyłanie w toku
            </h2>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              Przesyłanie jest w toku. Czy chcesz wstrzymać i zamknąć okno?
            </p>
            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={handleCancelClose}>
                Anuluj
              </Button>
              <Button variant="primary" onClick={handleConfirmClose}>
                Wstrzymaj i zamknij
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
      {/* Full modal drop zone - covers entire modal to prevent missed uploads */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`flex flex-col h-full ${
          isDragging
            ? "bg-blue-50 dark:bg-blue-900/20"
            : ""
        }`}
      >
        {/* Scrollable content area */}
        <div className="p-6 flex flex-col flex-1 min-h-0 overflow-hidden">
          <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">
            Prześlij zdjęcia
          </h2>

          {/* Recovery Banner */}
          {showRecoveryBanner && (
            <div className="mb-4 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-sm text-blue-800 dark:text-blue-200">
                    Odzyskano {files.length} {files.length === 1 ? "plik" : "plików"} z poprzedniej sesji
                  </p>
                </div>
                <button
                  onClick={() => setShowRecoveryBanner(false)}
                  className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          )}

          {/* Top Dropzone Area */}
          <div
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors mb-4 ${
              isDragging
                ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                : "border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800"
            } ${uploading ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
            onClick={() => {
              if (!uploading) {
                fileInputRef.current?.click();
              }
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
              disabled={uploading}
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
            <div className="flex gap-2 justify-center">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  if (!uploading) {
                    folderInputRef.current?.click();
                  }
                }}
                disabled={uploading}
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
              disabled={uploading}
            />
          </div>

          {/* Files Grid - Thumbnail Grid Layout */}
          {files.length > 0 && (
            <div className="flex-1 overflow-y-auto min-h-0">
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
                      {/* Thumbnail */}
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

                        {/* Progress Overlay - Uppy style */}
                        {status === "uploading" && (
                          <div className="absolute inset-0 bg-black/60 dark:bg-black/70 flex items-center justify-center">
                            <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent"></div>
                            <div className="relative text-center z-10">
                              <div className="w-12 h-12 border-3 border-white/30 border-t-white rounded-full animate-spin mb-2 mx-auto"></div>
                              <p className="text-white text-xs font-semibold">{Math.round(progress)}%</p>
                            </div>
                            {/* Progress bar at bottom */}
                            <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/30">
                              <div 
                                className="h-full bg-white transition-all duration-300"
                                style={{ width: `${progress}%` }}
                              ></div>
                            </div>
                          </div>
                        )}

                        {/* Paused Overlay - Uppy style */}
                        {status === "paused" && (
                          <div className="absolute inset-0 bg-black/60 dark:bg-black/70 flex items-center justify-center">
                            <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent"></div>
                            <button
                              onClick={() => pauseResumeFile(file.id)}
                              className="relative z-10 p-3 bg-white/20 hover:bg-white/30 rounded-full backdrop-blur-sm transition-colors"
                              type="button"
                              title="Wznów"
                            >
                              <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M8 5v14l11-7z"/>
                              </svg>
                            </button>
                          </div>
                        )}

                        {/* Status Badges */}
                        {status === "completed" && (
                          <div className="absolute top-2 right-2 bg-green-500 text-white text-xs px-2 py-1 rounded-full">
                            ✓
                          </div>
                        )}
                        {status === "error" && (
                          <div className="absolute top-2 right-2 bg-red-500 text-white text-xs px-2 py-1 rounded-full">
                            ✕
                          </div>
                        )}

                        {/* Remove Button - Uppy style */}
                        {status !== "uploading" && (
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
                        
                        {/* Pause/Resume button for uploading files */}
                        {status === "uploading" && (
                          <button
                            onClick={() => pauseResumeFile(file.id)}
                            className="absolute top-2 right-2 p-1.5 bg-white/90 dark:bg-gray-800/90 text-gray-700 dark:text-gray-200 rounded-full opacity-0 group-hover:opacity-100 transition-all hover:bg-blue-500 hover:text-white shadow-lg backdrop-blur-sm"
                            type="button"
                            title={file.isPaused ? "Wznów" : "Wstrzymaj"}
                          >
                            {file.isPaused ? (
                              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M8 5v14l11-7z"/>
                              </svg>
                            ) : (
                              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/>
                              </svg>
                            )}
                          </button>
                        )}
                      </div>

                      {/* File Info */}
                      <div className="p-2">
                        <p className="text-xs font-medium text-gray-900 dark:text-white truncate" title={file.name}>
                          {file.name}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {formatFileSize(file.size || 0)}
                        </p>
                        {status === "error" && file.error && (
                          <p className="text-xs text-red-600 dark:text-red-400 mt-1 truncate" title={file.error.message}>
                            {file.error.message}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Progress Summary - Uppy style */}
          {uploading && (
            <div className="mb-4 flex-shrink-0 bg-gray-100 dark:bg-gray-800 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  {isPaused ? (
                    <button
                      onClick={resumeUpload}
                      className="p-1.5 text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                      type="button"
                      title="Wznów"
                    >
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z"/>
                      </svg>
                    </button>
                  ) : (
                    <button
                      onClick={pauseUpload}
                      className="p-1.5 text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                      type="button"
                      title="Wstrzymaj"
                    >
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/>
                      </svg>
                    </button>
                  )}
                  <div className="text-sm font-medium text-gray-900 dark:text-white">
                    Przesyłanie...
                  </div>
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  {uploadProgress.total > 0
                    ? Math.round((uploadProgress.current / uploadProgress.total) * 100)
                    : 0}%
                </div>
              </div>
              
              {/* Progress bar */}
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 mb-3 overflow-hidden">
                <div
                  className="bg-blue-600 dark:bg-blue-500 h-2 rounded-full transition-all duration-300"
                  style={{
                    width: `${
                      uploadProgress.total > 0
                        ? (uploadProgress.current / uploadProgress.total) * 100
                        : 0
                    }%`,
                  }}
                />
              </div>

              {/* Detailed stats - Uppy style */}
              <div className="flex items-center justify-between text-xs text-gray-600 dark:text-gray-400">
                <span>
                  {uploadProgress.current} / {uploadProgress.total} • {formatFileSize(uploadProgress.bytesUploaded || 0)} / {formatFileSize(uploadProgress.bytesTotal || 0)}
                </span>
                <div className="flex items-center gap-4">
                  {uploadProgress.speed > 0 && (
                    <span className="flex items-center gap-1">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                      </svg>
                      {formatSpeed(uploadProgress.speed || 0)}
                    </span>
                  )}
                  {uploadProgress.timeRemaining > 0 && (
                    <span>{formatTimeRemaining(uploadProgress.timeRemaining || 0)}</span>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Fixed Actions Footer */}
        <div className="flex justify-end gap-3 p-6 pt-4 border-t border-gray-200 dark:border-gray-700 flex-shrink-0 bg-white dark:bg-gray-900">
            <Button
              variant="secondary"
              onClick={uploading ? cancelUpload : handleClose}
              disabled={uploading && files.length === 0}
            >
              {uploading ? "Anuluj" : "Zamknij"}
            </Button>
            {uploading && (
              <>
                {isPaused ? (
                  <Button onClick={resumeUpload} variant="primary">
                    Wznów
                  </Button>
                ) : (
                  <Button onClick={pauseUpload} variant="secondary">
                    Wstrzymaj
                  </Button>
                )}
                <div className="flex items-center gap-2">
                  <Loading size="sm" />
                  <span className="text-sm text-gray-600 dark:text-gray-400">
                    Przesyłanie...
                  </span>
                </div>
              </>
            )}
            {files.length > 0 && !uploading && (
              <Button onClick={startUpload} variant="primary">
                Prześlij {files.length} {files.length === 1 ? "plik" : "plików"}
              </Button>
            )}
        </div>
      </div>
    </Modal>
    </>
  );
};

