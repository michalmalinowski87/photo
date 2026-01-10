import Uppy from "@uppy/core";
import "@uppy/core/css/style.min.css";
import {
  Upload,
  Image as ImageIcon,
  Play,
  Pause,
  Check,
  X,
  ArrowUp,
  CheckCircle2,
  Trash2,
} from "lucide-react";
import dynamic from "next/dynamic";
import React, { useCallback, useEffect, useRef, useState } from "react";

import { useUppyUpload, type UseUppyUploadConfig } from "../../hooks/useUppyUpload";
import { type TypedUppyFile } from "../../lib/uppy-config";
import Button from "../ui/button/Button";
import { Modal } from "../ui/modal";
import { Tooltip } from "../ui/tooltip/Tooltip";

import { UploadCompletionOverlay } from "./UploadCompletionOverlay";

// Lazy load react-virtuoso (~60KB) - only needed when files are present
const VirtuosoGrid = dynamic(
  () => import("react-virtuoso").then((mod) => ({ default: mod.VirtuosoGrid })),
  {
    ssr: false,
  }
);

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
    (file.type?.startsWith("image/") ?? false) ||
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
  } catch (_error) {
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

function getFileProgress(file: TypedUppyFile): number {
  return file.progress?.percentage ?? 0;
}

function getFileStatus(
  file: TypedUppyFile
): "completed" | "uploading" | "paused" | "error" | "pending" {
  if (file.progress?.uploadComplete) {
    return "completed";
  }
  if (file.progress?.uploadStarted) {
    const isPaused = file.isPaused ?? false;
    const status = isPaused ? "paused" : "uploading";
    return status;
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
            void readEntries().then(resolve);
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
// Memoized Thumbnail Item Component
// ============================================================================

interface ThumbnailItemProps {
  file: TypedUppyFile;
  thumbnail: string | undefined;
  status: "pending" | "uploading" | "paused" | "completed" | "error";
  progress: number;
  uploadComplete: boolean;
  onRemove: (fileId: string) => void;
}

  // Memoized thumbnail item to prevent unnecessary re-renders
  // Only re-renders when props actually change
  const ThumbnailItem = React.memo<ThumbnailItemProps>(
    ({ file, thumbnail, status, progress, uploadComplete, onRemove }) => {
      // Removed manual decode() call - browser handles decoding asynchronously via decoding="async" attribute
      // Manual decode() was causing 28+ second blocking delays per image
      // The <img> element already has decoding="async" and loading="lazy" which provides optimal performance

    const roundedProgress = Math.round(progress);

    return (
      <div className="p-1.5 h-full" style={{ contain: "layout style paint" }}>
        <div
          className="relative group bg-white dark:bg-gray-800 rounded-lg border border-gray-400 dark:border-gray-700 overflow-hidden h-full"
          style={{ willChange: "transform" }}
        >
          <div className="relative" style={{ aspectRatio: "1 / 1", contain: "layout" }}>
            {thumbnail ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={thumbnail}
                alt={file.name ?? "Image"}
                className="w-full h-full object-cover"
                loading="lazy"
                decoding="async"
                fetchPriority="low"
                style={{
                  contentVisibility: "auto",
                  transform: "translateZ(0)",
                  imageRendering: "auto",
                  backfaceVisibility: "hidden",
                  WebkitBackfaceVisibility: "hidden",
                }}
              />
            ) : (
              <div className="w-full h-full bg-photographer-muted dark:bg-gray-700 flex items-center justify-center">
                <ImageIcon
                  className="w-12 h-12 text-gray-400"
                  strokeWidth={2}
                />
              </div>
            )}
            {(status === "uploading" || status === "paused") && (
              <div className="absolute inset-0 z-10">
                <div className="absolute inset-0 bg-black/50 dark:bg-black/60"></div>
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/50 to-transparent"></div>
                <div className="absolute bottom-6 left-0 right-0 text-center z-10">
                  <p className="text-white text-xs font-bold drop-shadow-lg">
                    {roundedProgress}%
                  </p>
                </div>
                <div className="absolute bottom-0 left-0 right-0 h-2 bg-black/50 dark:bg-black/60 overflow-hidden">
                  <div
                    className="h-full bg-white dark:bg-blue-400 transition-all duration-200 ease-out shadow-sm origin-left"
                    style={{
                      // Use scaleX for GPU acceleration instead of width
                      transform: `scaleX(${Math.max(0, Math.min(1, progress / 100))})`,
                      width: "100%",
                    }}
                  ></div>
                </div>
              </div>
            )}
            {status === "completed" && (
              <div className="absolute top-2 right-2 bg-photographer-accent text-white text-xs px-2 py-1 rounded-full shadow-lg flex items-center justify-center w-6 h-6">
                <Check size={16} />
              </div>
            )}
            {status === "error" && (
              <div className="absolute top-2 right-2 bg-red-500 text-white text-xs px-2 py-1 rounded-full shadow-lg flex items-center justify-center w-6 h-6">
                <X size={16} />
              </div>
            )}
            {status !== "uploading" && !uploadComplete && (
              <div className="absolute top-2 right-2 z-20">
                <Tooltip content="Usuń">
                  <button
                    onClick={() => onRemove(file.id)}
                    className="p-1.5 bg-white/90 dark:bg-gray-800/90 text-gray-700 dark:text-gray-200 rounded-full opacity-0 group-hover:opacity-100 transition-all hover:bg-red-500 hover:text-white shadow-lg backdrop-blur-sm"
                    type="button"
                  >
                    <X size={16} />
                  </button>
                </Tooltip>
              </div>
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
                {formatFileSize(file.size ?? 0)}
              </p>
              {status === "uploading" && (
                <p className="text-xs text-gray-600 dark:text-gray-300 font-semibold">
                  {roundedProgress}%
                </p>
              )}
            </div>
            {status === "error" && file.error && (
              <p
                className="text-xs text-red-600 dark:text-red-400 mt-1 truncate"
                title={String(file.error)}
              >
                {String(file.error)}
              </p>
            )}
          </div>
        </div>
      </div>
    );
  },
  // Custom comparison function - only re-render if these props change
  (prevProps, nextProps) => {
    return (
      prevProps.file.id === nextProps.file.id &&
      prevProps.thumbnail === nextProps.thumbnail &&
      prevProps.status === nextProps.status &&
      Math.abs(prevProps.progress - nextProps.progress) < 1 && // Only update if progress changes by >= 1%
      prevProps.uploadComplete === nextProps.uploadComplete
    );
  }
);

ThumbnailItem.displayName = "ThumbnailItem";

// ============================================================================
// Component
// ============================================================================

export const UppyUploadModal = ({ isOpen, onClose, config }: UppyUploadModalProps) => {
  const {
    uppy,
    uploading,
    uploadComplete,
    uploadResult,
    uploadProgress,
    uploadStats,
    isPaused,
    isFinalizing,
    startUpload,
    cancelUpload,
    pauseUpload,
    resumeUpload,
    resetUploadState,
  } = useUppyUpload(config);

  const [files, setFiles] = useState<TypedUppyFile[]>([]);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [showCompletionOverlay, setShowCompletionOverlay] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [viewportHeight, setViewportHeight] = useState<number>(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isMountedRef = useRef(true);
  const isOpenRef = useRef(isOpen);
  const lastSyncedFileIdsRef = useRef<string[]>([]);
  // Cache blob URLs to avoid recreating them on every render
  const blobUrlCacheRef = useRef<Map<string, string>>(new Map());
  // Track which files have loaded their preview thumbnails (prevents flicker)
  const previewLoadedRef = useRef<Set<string>>(new Set());
  
  // Track last progress values to avoid unnecessary updates
  const lastProgressRef = useRef<Map<string, number>>(new Map());
  // Per-file thumbnail source cache - ensures consistent source selection
  // Once a source is chosen for a file, we stick with it to prevent quality inconsistencies
  const fileThumbnailSourceRef = useRef<Map<string, string | undefined>>(new Map());

  // Track viewport height to conditionally hide dropzone visual on small screens
  useEffect(() => {
    const updateViewportHeight = () => {
      setViewportHeight(window.innerHeight);
    };

    updateViewportHeight();
    window.addEventListener("resize", updateViewportHeight);

    return () => {
      window.removeEventListener("resize", updateViewportHeight);
    };
  }, []);

  // Show completion overlay when upload completes
  // Listen directly to Uppy's complete event - this is the primary trigger
  useEffect(() => {
    if (!uppy || !isOpen) {
      return;
    }

    const handleComplete = () => {
      // Uppy's complete event has fired
      // The hook's onComplete callback will set uploadComplete and uploadStats synchronously
      // Wait a moment for React to process the state updates, then show overlay
      // The fallback effect below will ensure it only shows when stats are actually available
      setTimeout(() => {
        if (!showCompletionOverlay) {
          setShowCompletionOverlay(true);
        }
      }, 200);
    };

    // Listen to Uppy's complete event
    uppy.on("complete", handleComplete);

    return () => {
      uppy.off("complete", handleComplete);
    };
  }, [uppy, isOpen, showCompletionOverlay]);

  // Show overlay when uploadComplete and uploadStats become available
  // This is the primary mechanism - ensures overlay only shows when stats are ready
  // The complete event listener above helps trigger it, but this effect is the gatekeeper
  useEffect(() => {
    if (uploadComplete && uploadStats && isOpen && !showCompletionOverlay) {
      setShowCompletionOverlay(true);
    }
  }, [uploadComplete, uploadStats, isOpen, showCompletionOverlay]);

  // Reset upload state when modal closes (but don't clear Uppy files - let user see completed uploads)
  // Only reset our UI state, files will be cleared when user explicitly closes after completion
  useEffect(() => {
    if (!isOpen && !uploading) {
      resetUploadState();
      setShowCompletionOverlay(false);
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

    // Copy refs to local variables for cleanup (satisfies ESLint)
    const blobUrls = blobUrlCacheRef.current;
    const previewLoaded = previewLoadedRef.current;
    const lastProgress = lastProgressRef.current;
    const fileThumbnailSource = fileThumbnailSourceRef.current;

    // Debounce syncFiles to batch rapid events (file-added, files-added) and reduce re-renders
    let syncTimeout: NodeJS.Timeout | null = null;
    let pendingForceUpdate = false;

    // Sync our files state with Uppy's current state
    // Trust Uppy - it manages all file state, we just display it
    const syncFiles = (forceUpdate = false) => {
      // Use ref to check if modal is still open (avoids stale closure)
      if (!isMountedRef.current || !uppy || !isOpenRef.current) {
        return;
      }
      // Get current files from Uppy - this is the source of truth
      const uppyFiles = Object.values(uppy.getFiles());
      const currentFileIds = uppyFiles.map((f) => f.id).sort();
      const lastFileIds = lastSyncedFileIdsRef.current.sort();

      // Only sync if files actually changed (compare IDs) OR if forced (for progress updates)
      const filesChanged =
        currentFileIds.length !== lastFileIds.length ||
        !currentFileIds.every((id, idx) => id === lastFileIds[idx]);

      // If forceUpdate is true, check if progress actually changed
      if (!filesChanged && forceUpdate) {
        let progressChanged = false;
        for (const file of uppyFiles) {
          const currentProgress = file.progress?.percentage ?? 0;
          const lastProgress = lastProgressRef.current.get(file.id) ?? 0;
          // Only update if progress changed by at least 1% (reduces unnecessary renders)
          if (Math.abs(currentProgress - lastProgress) >= 1) {
            progressChanged = true;
            lastProgressRef.current.set(file.id, currentProgress);
          }
        }
        if (!progressChanged) {
          return; // Progress hasn't changed enough, skip sync
        }
      }

      if (!filesChanged && !forceUpdate) {
        return; // No change, skip sync
      }

      // Update progress tracking
      for (const file of uppyFiles) {
        lastProgressRef.current.set(file.id, file.progress?.percentage ?? 0);
      }

      lastSyncedFileIdsRef.current = currentFileIds;
      setFiles(uppyFiles as TypedUppyFile[]);
    };

    // Initial sync - get files that Uppy already has (should be 0 after clear)
    syncFiles();

    // Listen to ALL Uppy events that affect file state
    // Uppy will notify us of every change, we just display what Uppy tells us
    const eventHandlers = [
      "file-added",
      "file-removed",
      "files-added",
      "upload-success",
      "thumbnail:generated",
      "upload-error",
      "restriction-failed",
      "complete",
    ];

    // Track if this is the first file-added event (needs immediate sync for initial render)
    let isFirstFileAdded = true;
    
    // Debounced sync function for batching rapid events
    const debouncedSyncFiles = (forceUpdate = false, immediate = false) => {
      pendingForceUpdate = pendingForceUpdate || forceUpdate;
      
      // Immediate sync for first file-added to show initial render quickly
      if (immediate && isFirstFileAdded) {
        if (syncTimeout) {
          clearTimeout(syncTimeout);
          syncTimeout = null;
        }
        syncFiles(pendingForceUpdate);
        pendingForceUpdate = false;
        isFirstFileAdded = false;
        return;
      }
      
      if (syncTimeout) {
        clearTimeout(syncTimeout);
      }
      syncTimeout = setTimeout(() => {
        syncFiles(pendingForceUpdate);
        pendingForceUpdate = false;
        syncTimeout = null;
        isFirstFileAdded = false;
      }, 16); // Batch events within one frame (~16ms) to reduce re-renders
    };

    // Store event handlers for proper cleanup
    const storedEventHandlers: Array<{ event: string; handler: () => void }> = [];

    eventHandlers.forEach((event) => {
      const handler = () => {
        // Immediate sync for file-added events to show initial render quickly
        debouncedSyncFiles(false, event === "file-added" || event === "files-added");
      };
      storedEventHandlers.push({ event, handler });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call
      (uppy.on as any)(event, handler);
    });

    // For upload-progress, always force update to show progress overlays
    const handleUploadProgress = () => {
      syncFiles(true);
    };
    uppy.on("upload-progress", handleUploadProgress);

    // Listen to upload events to catch pause/resume state changes (force update)
    const handleUpload = () => {
      syncFiles(true);
    };
    uppy.on("upload", handleUpload);

    return () => {
      isMountedRef.current = false;
      if (syncTimeout) {
        clearTimeout(syncTimeout);
        syncTimeout = null;
      }
      storedEventHandlers.forEach(({ event, handler }) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call
        (uppy.off as any)(event, handler);
      });
      uppy.off("upload-progress", handleUploadProgress);
      uppy.off("upload", handleUpload);
      // Clear files and reset tracking when effect cleans up (modal closed)
      setFiles([]);
      lastSyncedFileIdsRef.current = [];
      // Clean up blob URLs (using refs copied at effect start)
      blobUrls.forEach((url) => URL.revokeObjectURL(url));
      blobUrls.clear();
      // Clear preview loaded tracking
      previewLoaded.clear();
      // Clear progress tracking
      lastProgress.clear();
      // Clear thumbnail source cache
      fileThumbnailSource.clear();
    };
  }, [uppy, isOpen]);

  // Preload preview thumbnails when they become available to prevent flicker
  // OPTIMIZATION: Removed 'files' from dependencies to prevent render loop
  // Instead, we listen to Uppy events directly and use refs to track state
  useEffect(() => {
    if (!uppy || !isOpen) {
      return;
    }

    const preloadPreview = (file: TypedUppyFile) => {
      // If preview exists but hasn't been loaded yet, preload it
      if (file.preview && !previewLoadedRef.current.has(file.id)) {
        const img = new Image();
        img.onload = () => {
          // Mark as loaded - no need to call setFiles, the thumbnail will be used on next render
          previewLoadedRef.current.add(file.id);
          // Trigger a single update via syncFiles (which will check if files changed)
          // Use a small delay to batch multiple preview loads
          if (isMountedRef.current && uppy && isOpenRef.current) {
            setTimeout(() => {
              if (isMountedRef.current && uppy && isOpenRef.current) {
                const uppyFiles = Object.values(uppy.getFiles());
                const currentFileIds = uppyFiles.map((f) => f.id).sort();
                const lastFileIds = lastSyncedFileIdsRef.current.sort();
                const filesChanged =
                  currentFileIds.length !== lastFileIds.length ||
                  !currentFileIds.every((id, idx) => id === lastFileIds[idx]);
                // Only update if files actually changed
                if (filesChanged) {
                  lastSyncedFileIdsRef.current = currentFileIds;
                  setFiles(uppyFiles as TypedUppyFile[]);
                }
              }
            }, 50); // Batch preview loads within 50ms
          }
        };
        img.onerror = () => {
          // If preview fails to load, keep using blob URL
          // Don't mark as loaded, so we'll keep using blob URL
        };
        img.src = file.preview;
      }
    };

    // Preload previews for all files that have them
    const uppyFiles = Object.values(uppy.getFiles()) as TypedUppyFile[];
    uppyFiles.forEach(preloadPreview);

    // Listen for thumbnail:generated event to preload new previews
    const handleThumbnailGenerated = () => {
      const currentFiles = Object.values(uppy.getFiles()) as TypedUppyFile[];
      currentFiles.forEach(preloadPreview);
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    (uppy.on as any)("thumbnail:generated", handleThumbnailGenerated);

    return () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      (uppy.off as any)("thumbnail:generated", handleThumbnailGenerated);
    };
  }, [uppy, isOpen]); // Removed 'files' dependency to prevent render loop

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
        // Clear preview loaded tracking
        previewLoadedRef.current.clear();
        // Clear thumbnail source cache
        fileThumbnailSourceRef.current.clear();
        // Then clear Uppy files
        uppy.clear();
      }
      // Reset upload state when closing
      resetUploadState();
      setShowCompletionOverlay(false);
      onClose();
    }
  };

  const handleCompletionOverlayClose = () => {
    setShowCompletionOverlay(false);
    handleClose();
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

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!uploading && !uploadComplete) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
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
          const dataTransferItem = item as DataTransferItem & {
            webkitGetAsEntry?: () => FileSystemEntry | null;
          };
          const entry = dataTransferItem.webkitGetAsEntry?.();
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
        Array.from(droppedFiles).forEach((file) => {
          addFileToUppy(uppy, file);
        });
      }
    }
  };

  const handleRemoveFile = useCallback(
    (fileId: string) => {
      if (uppy && !uploading && !uploadComplete) {
        uppy.removeFile(fileId);
      }
    },
    [uppy, uploading, uploadComplete]
  );

  const handleClearFiles = () => {
    if (!uppy || uploading || uploadComplete) {
      return;
    }
    // Clear local state FIRST so it's immediately updated
    setFiles([]);
    // Reset file tracking
    lastSyncedFileIdsRef.current = [];
    // Clean up blob URLs
    blobUrlCacheRef.current.forEach((url) => URL.revokeObjectURL(url));
    blobUrlCacheRef.current.clear();
    // Clear thumbnail source cache
    fileThumbnailSourceRef.current.clear();
    // Then clear Uppy files
    uppy.clear();
  };

  /**
   * Get thumbnail URL for Uppy file
   *
   * Strategy for consistent quality:
   * - Use per-file source cache to ensure same source is always used for same file
   * - Prefer generated thumbnail (file.preview) once available - consistent 250px quality
   * - Use blob URL only as temporary fallback until thumbnail is generated
   * - Once thumbnail is generated, always use it (consistent quality)
   */
  const getThumbnail = useCallback((file: TypedUppyFile): string | undefined => {
    const cachedBlobUrl = blobUrlCacheRef.current.get(file.id);
    let thumbnail: string | undefined;

    // STRATEGY: Always use generated thumbnail (file.preview) once available for consistency
    // Generated thumbnails provide consistent 250px JPEG quality for all images
    // CRITICAL: Check preview FIRST, even if cache exists, to ensure we upgrade to preview when available
    
    // PRIORITY 1: Use generated thumbnail if available (consistent 250px JPEG quality)
    // Always prefer preview once available - ensures consistent quality across all images
    // This check happens BEFORE cache to ensure we upgrade from blob URL to preview
    if (file.preview) {
      thumbnail = file.preview;
      // Update cache immediately when preview becomes available (ensures consistency)
      fileThumbnailSourceRef.current.set(file.id, thumbnail);
      return thumbnail;
    }
    
    // Check cache only if preview is not available (fallback to cached source)
    const cachedThumbnail = fileThumbnailSourceRef.current.get(file.id);
    if (cachedThumbnail !== undefined) {
      return cachedThumbnail;
    }

    // PRIORITY 2: Use blob URL as temporary fallback until thumbnail is generated
    if (cachedBlobUrl) {
      thumbnail = cachedBlobUrl;
    }
    // PRIORITY 3: Create blob URL from File object (temporary until thumbnail is generated)
    else if (file.data && file.data instanceof File) {
      thumbnail = URL.createObjectURL(file.data);
      blobUrlCacheRef.current.set(file.id, thumbnail);
    }

    // Cache the chosen source for this file (ensures consistency across renders)
    fileThumbnailSourceRef.current.set(file.id, thumbnail);

    return thumbnail;
  }, []);

  // Memoize itemContent callback to prevent unnecessary re-renders
  // MUST be before early return to satisfy React hooks rules
  const renderFileItem = useCallback(
    (index: number) => {
      const file = files[index];
      if (!file) return null;

      // Get fresh file state from Uppy to ensure we have latest isPaused value
      const freshFile = (uppy?.getFile(file.id) ?? file) as TypedUppyFile;
      const status = getFileStatus(freshFile);
      const progress = getFileProgress(freshFile);
      const thumbnail = getThumbnail(freshFile);

      // Use memoized component for better performance
      return (
        <ThumbnailItem
          file={freshFile}
          thumbnail={thumbnail}
          status={status}
          progress={progress}
          uploadComplete={uploadComplete}
          onRemove={handleRemoveFile}
        />
      );
    },
    [files, uppy, getThumbnail, uploadComplete, handleRemoveFile]
  );

  if (!isOpen) {
    return null;
  }

  const progressPercentage =
    uploadProgress.total > 0
      ? Math.round((uploadProgress.current / uploadProgress.total) * 100)
      : 0;

  return (
    <>
      {/* Upload Completion Overlay */}
      {uploadStats && (
        <UploadCompletionOverlay
          isOpen={showCompletionOverlay}
          onClose={handleCompletionOverlayClose}
          stats={uploadStats}
          uploadType={config.type}
          isFinalizing={isFinalizing}
        />
      )}

      {showCloseConfirm && (
        <Modal isOpen={showCloseConfirm} onClose={handleCancelClose} className="max-w-md">
          <div className="p-6">
            <h2 className="text-xl font-bold mb-4 text-gray-900 dark:text-white">
              Anulować przesyłanie?
            </h2>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              Przesyłanie zostało wstrzymane. Jeśli anulujesz, wszystkie przesłane pliki zostaną
              usunięte z galerii.
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
        className="w-[70vw] max-w-[90vw] max-h-[90vh]"
        showCloseButton={true}
        closeOnClickOutside={false}
      >
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`flex flex-col ${isDragging ? "bg-blue-50 dark:bg-blue-900/20" : ""}`}
          style={{
            height: "calc(70vh + 200px)",
            maxHeight: "90vh",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div
            style={{
              flex: "1 1 0%",
              overflowY: "auto",
              overflowX: "hidden",
              minHeight: 0,
              willChange: "scroll-position",
              WebkitOverflowScrolling: "touch",
            }}
          >
            <div className="p-6">
              <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">
                Prześlij zdjęcia
              </h2>

              {/* Dropzone - hide only when files are present AND viewport height <= 610px */}
              {!(files.length > 0 && viewportHeight <= 610) && (
                <div
                  className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors mb-4 ${
                    isDragging
                      ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                      : "border-gray-400 dark:border-gray-600 bg-white dark:bg-gray-800"
                  } ${uploading || uploadComplete ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
                  onClick={() => {
                    if (!uploading && !uploadComplete) {
                      fileInputRef.current?.click();
                    }
                  }}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept="image/*"
                    onChange={handleFileInputChange}
                    className="hidden"
                    disabled={uploading || uploadComplete}
                  />
                  <div className="space-y-2">
                    <Upload className="mx-auto h-12 w-12 text-gray-400" strokeWidth={2} />
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Przeciągnij i upuść zdjęcia lub cały folder tutaj, lub kliknij, aby wybrać
                      pliki
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-500">
                      Obsługiwane formaty: JPG, PNG, WebP
                    </p>
                  </div>
                </div>
              )}

              {/* Hidden file input - always present for drag/drop functionality */}
              {files.length > 0 && viewportHeight <= 610 && (
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="image/*"
                  onChange={handleFileInputChange}
                  className="hidden"
                  disabled={uploading || uploadComplete}
                />
              )}

              {files.length > 0 && (
                <>
                  <div
                    style={{
                      height: "calc(80vh - 200px)",
                      minHeight: "400px",
                      maxHeight: "calc(90vh - 200px)",
                    }}
                  >
                    <VirtuosoGrid
                      totalCount={files.length}
                      data={files}
                      overscan={100}
                      increaseViewportBy={50}
                      itemContent={(index) => {
                        return renderFileItem(index);
                      }}
                      style={{ height: "100%" }}
                      components={{
                        List: (() => {
                          const VirtuosoGridList = React.forwardRef<
                            HTMLDivElement,
                            { style?: React.CSSProperties; children?: React.ReactNode }
                          >(({ style, children }, ref) => (
                            <div
                              ref={ref}
                              style={{
                                ...style,
                                display: "grid",
                                gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
                                gap: "0.75rem",
                                willChange: "transform",
                                transform: "translateZ(0)",
                                contain: "layout style paint",
                              }}
                            >
                              {children}
                            </div>
                          ));
                          VirtuosoGridList.displayName = "VirtuosoGridList";
                          return VirtuosoGridList;
                        })(),
                      }}
                    />
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-4 px-6 py-4 flex-shrink-0 border-t border-gray-400 dark:border-gray-700 bg-white dark:bg-gray-900">
            <div className="flex items-center justify-between gap-4">
              <div className="flex-1">
                {uploading ? (
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => {
                        if (isPaused) {
                          resumeUpload();
                        } else {
                          pauseUpload();
                        }
                      }}
                      className="p-1.5 text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors flex-shrink-0"
                      type="button"
                    >
                      <Tooltip content={isPaused ? "Wznów" : "Wstrzymaj"}>
                        {isPaused ? <Play size={20} /> : <Pause size={20} />}
                      </Tooltip>
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
                      <div className="w-full bg-photographer-muted dark:bg-gray-700 rounded-full h-2 overflow-hidden">
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
                              <ArrowUp size={12} />
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
                    <CheckCircle2
                      size={20}
                      className="text-photographer-accent dark:text-photographer-accentLight flex-shrink-0"
                    />
                    <p className="text-sm font-medium text-photographer-accentDark dark:text-photographer-accentLight">
                      {uploadResult.failed > 0
                        ? uploadResult.successful > 0
                          ? `Przesłano ${uploadResult.successful} z ${uploadResult.successful + uploadResult.failed} ${config.type === "finals" ? "zdjęć finalnych" : "zdjęć"}. ${uploadResult.failed} nie powiodło się.`
                          : `Nie udało się przesłać żadnego ${config.type === "finals" ? "zdjęcia finalnego" : "zdjęcia"}.`
                        : `${uploadResult.successful} ${uploadResult.successful === 1 ? (config.type === "finals" ? "zdjęcie finalne" : "zdjęcie") : config.type === "finals" ? "zdjęć finalnych" : "zdjęć"} zostało przesłanych`}
                    </p>
                  </div>
                ) : null}
              </div>

              <div className="flex gap-3 flex-shrink-0">
                {uploadComplete ? (
                  <Button variant="primary" onClick={handleClose} className="min-w-[90px]">
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
                    {files.length > 0 && !uploading && !uploadComplete && (
                      <Button
                        variant="secondary"
                        onClick={handleClearFiles}
                        className="flex items-center gap-2"
                      >
                        <Trash2 size={16} />
                        Wyczyść
                      </Button>
                    )}
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
