import "@uppy/core/css/style.min.css";
import ThumbnailGenerator from "@uppy/thumbnail-generator";
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
import { ThreeDotsIndicator } from "../ui/loading/Loading";

import { UploadCollisionModal } from "./UploadCollisionModal";
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

/** Collect files from a directory entry (recursive). Used so we can run collision check on the whole batch. */
async function collectFilesFromDirectory(entry: FileSystemEntry): Promise<File[]> {
  const files: File[] = [];
  if (entry.isDirectory) {
    const dirReader = (entry as FileSystemDirectoryEntry).createReader();
    const readEntries = (): Promise<FileSystemEntry[]> =>
      new Promise((resolve) => {
        dirReader.readEntries((results) => resolve(Array.from(results)));
      });
    // readEntries may return a subset; keep reading until none left
    let entries = await readEntries();
    while (entries.length > 0) {
      for (const subEntry of entries) {
        files.push(...(await collectFilesFromDirectory(subEntry)));
      }
      entries = await readEntries();
    }
  } else if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) => {
      (entry as FileSystemFileEntry).file(resolve, reject);
    });
    files.push(file);
  }
  return files;
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

// Custom comparison function for ThumbnailItem memoization
// Only re-render if props actually changed
const areThumbnailItemPropsEqual = (
  prevProps: ThumbnailItemProps,
  nextProps: ThumbnailItemProps
): boolean => {
  // Compare all props by value (not just reference)
  // This ensures we only re-render when actual data changes, not just object references
  return (
    prevProps.file.id === nextProps.file.id &&
    prevProps.file.preview === nextProps.file.preview && // Compare preview value, not reference
    prevProps.thumbnail === nextProps.thumbnail &&
    prevProps.status === nextProps.status &&
    prevProps.progress === nextProps.progress &&
    prevProps.uploadComplete === nextProps.uploadComplete &&
    prevProps.onRemove === nextProps.onRemove
  );
};

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
              // Use regular img tag for Uppy thumbnails (data URLs and blob URLs)
              // Next.js Image component has compatibility issues with these URL types
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={`${file.id}-${thumbnail.substring(0, 50)}`}
                src={thumbnail}
                alt={file.name ?? "Image"}
                className="object-cover w-full h-full"
                loading="lazy"
                decoding="async"
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
                <ImageIcon className="w-12 h-12 text-gray-400" strokeWidth={2} />
              </div>
            )}
            {(status === "uploading" || status === "paused") && (
              <div className="absolute inset-0 z-10">
                <div className="absolute inset-0 bg-black/50 dark:bg-black/60"></div>
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/50 to-transparent"></div>
                <div className="absolute bottom-6 left-0 right-0 text-center z-10">
                  <p className="text-white text-xs font-bold drop-shadow-lg">{roundedProgress}%</p>
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
  areThumbnailItemPropsEqual
);

ThumbnailItem.displayName = "ThumbnailItem";

// ============================================================================
// Component
// ============================================================================

/**
 * Inner component that holds all hooks. Wrapped so that when loaded via
 * Next.js dynamic(), the hook-running component is always the same instance,
 * avoiding "Should have a queue" / invalid hook call from the dynamic boundary.
 */
function UppyUploadModalContent({ isOpen, onClose, config }: UppyUploadModalProps) {
  const {
    uppy,
    uploading,
    uploadComplete,
    uploadResult,
    uploadProgress,
    uploadStats,
    isPaused,
    isFinalizing,
    isLoadingKeys,
    collisionPrompt,
    resolveCollisionChoice,
    addFilesWithCollisionCheck,
    startUpload,
    cancelUpload,
    pauseUpload,
    resumeUpload,
    resetUploadState,
  } = useUppyUpload({ ...config, isOpen });

  const [files, setFiles] = useState<TypedUppyFile[]>([]);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [showCompletionOverlay, setShowCompletionOverlay] = useState(false);
  const [showMultipleDirsError, setShowMultipleDirsError] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [viewportHeight, setViewportHeight] = useState<number>(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isMountedRef = useRef(true);
  const isOpenRef = useRef(isOpen);
  const lastSyncedFileIdsRef = useRef<string[]>([]);
  // Cache blob URLs to avoid recreating them on every render
  const blobUrlCacheRef = useRef<Map<string, string>>(new Map());

  // Track last progress values to avoid unnecessary updates
  const lastProgressRef = useRef<Map<string, number>>(new Map());

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
    const lastProgress = lastProgressRef.current;

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
    // Note: thumbnail:generated is handled in a separate useEffect below to trigger re-renders
    // (ThumbnailUploadPlugin also listens to it for S3 upload purposes)
    const eventHandlers = [
      "file-added",
      "file-removed",
      "files-added",
      "upload-success",
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
      // Clear progress tracking
      lastProgress.clear();
    };
  }, [uppy, isOpen]);

  // Listen for thumbnail:generated events - Uppy generates thumbnails automatically
  // Only update the specific file that had its thumbnail generated to prevent re-rendering all items
  useEffect(() => {
    if (!uppy || !isOpen) {
      return;
    }

    // Debounce thumbnail updates to batch rapid thumbnail generations
    let thumbnailUpdateTimeout: NodeJS.Timeout | null = null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars
    const handleThumbnailGenerated = (_file: any) => {
      // Debounce updates to batch rapid thumbnail generations
      if (thumbnailUpdateTimeout) {
        clearTimeout(thumbnailUpdateTimeout);
      }

      thumbnailUpdateTimeout = setTimeout(() => {
        if (!isMountedRef.current || !uppy || !isOpenRef.current) {
          return;
        }

        // OPTIMIZED: Preserve file object references and only update the file that changed
        // This prevents all ThumbnailItem components from re-rendering when only one thumbnail is generated
        setFiles((prevFiles) => {
          const uppyFiles = Object.values(uppy.getFiles()) as TypedUppyFile[];

          // If file count changed, we need a full update (new files added/removed)
          if (prevFiles.length !== uppyFiles.length) {
            return uppyFiles;
          }

          // Create a map of existing files by ID for quick lookup
          const existingFilesMap = new Map(prevFiles.map((f) => [f.id, f]));

          // Check if any file's preview actually changed
          let hasChanges = false;
          const updatedFiles = uppyFiles.map((uppyFile, index) => {
            const existingFile = existingFilesMap.get(uppyFile.id);

            // If file exists and preview changed, create new object with updated preview
            if (existingFile && existingFile.preview !== uppyFile.preview) {
              hasChanges = true;
              // Return new object with updated preview, but keep other properties from existing file
              return { ...existingFile, preview: uppyFile.preview } as TypedUppyFile;
            }

            // Preserve existing reference if nothing changed
            // Also check if the file at this index is the same reference
            if (existingFile && prevFiles[index] === existingFile) {
              return existingFile; // Same reference, same position
            }

            return existingFile ?? uppyFile;
          });

          // CRITICAL: If nothing changed, return the previous array reference
          // This prevents VirtuosoGrid from seeing a change and re-rendering all items
          if (
            !hasChanges &&
            updatedFiles.length === prevFiles.length &&
            updatedFiles.every((f, i) => f === prevFiles[i])
          ) {
            return prevFiles; // Return same array reference - no re-render!
          }

          return updatedFiles;
        });
      }, 16); // Batch updates within one frame (~16ms)
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    (uppy as any).on("thumbnail:generated", handleThumbnailGenerated);

    return () => {
      if (thumbnailUpdateTimeout) {
        clearTimeout(thumbnailUpdateTimeout);
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      (uppy as any).off("thumbnail:generated", handleThumbnailGenerated);
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
    void addFilesWithCollisionCheck(uppy, Array.from(e.target.files));
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!uploading && !uploadComplete && !isLoadingKeys) {
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

    if (uploading || uploadComplete || isLoadingKeys || !uppy) {
      return;
    }

    const items = e.dataTransfer.items;
    if (items && items.length > 0) {
      let directoryCount = 0;
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind === "file") {
          const dataTransferItem = item as DataTransferItem & {
            webkitGetAsEntry?: () => FileSystemEntry | null;
          };
          const entry = dataTransferItem.webkitGetAsEntry?.();
          if (entry?.isDirectory) {
            directoryCount += 1;
          }
        }
      }
      if (directoryCount > 1) {
        setShowMultipleDirsError(true);
        return;
      }
    }

    const collectDroppedFiles = async (): Promise<File[]> => {
      const items = e.dataTransfer.items;
      const files: File[] = [];
      if (items && items.length > 0) {
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          if (item.kind === "file") {
            const dataTransferItem = item as DataTransferItem & {
              webkitGetAsEntry?: () => FileSystemEntry | null;
            };
            const entry = dataTransferItem.webkitGetAsEntry?.();
            if (entry?.isDirectory) {
              files.push(...(await collectFilesFromDirectory(entry)));
            } else {
              const file = item.getAsFile();
              if (file) files.push(file);
            }
          }
        }
      } else {
        const droppedFiles = e.dataTransfer.files;
        if (droppedFiles) {
          files.push(...Array.from(droppedFiles));
        }
      }
      return files;
    };

    void collectDroppedFiles().then((files) => {
      if (files.length > 0) {
        void addFilesWithCollisionCheck(uppy, files);
      }
    });
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
    // Then clear Uppy files
    uppy.clear();

    // CRITICAL FIX: ThumbnailGenerator plugin doesn't automatically reinitialize after clear()
    // We need to reset it by removing and re-adding it to restore thumbnail generation
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
    const thumbnailGeneratorPlugin = (uppy as any).getPlugin("ThumbnailGenerator");
    if (thumbnailGeneratorPlugin) {
      // Remove the plugin first to avoid duplicates
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      (uppy as any).removePlugin(thumbnailGeneratorPlugin);
    }

    // Re-add ThumbnailGenerator with the same configuration
    // This ensures it's properly initialized for new files
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    uppy.use(ThumbnailGenerator, {
      thumbnailWidth: 600,
      thumbnailType: "image/jpeg",
      waitForThumbnailsBeforeUpload: false,
    });
  };

  /**
   * Get thumbnail URL for Uppy file
   *
   * Ultra-minimal: Only use Uppy's preview, no fallbacks
   * - Use file.preview if available (Uppy handles placeholder replacement)
   * - Return undefined if no preview available (let Uppy handle it)
   */
  const getThumbnail = useCallback(
    (file: TypedUppyFile): string | undefined => {
      // Get fresh file data from Uppy to ensure we have latest preview
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      const freshFile = (uppy?.getFile?.(file.id) ?? file) as TypedUppyFile;

      // Use Uppy's generated thumbnail if available
      if (freshFile.preview && typeof freshFile.preview === "string") {
        return freshFile.preview;
      }

      // No fallback - just return undefined if preview not ready
      return undefined;
    },
    [uppy]
  );

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
    [uppy, files, getThumbnail, uploadComplete, handleRemoveFile]
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

      {collisionPrompt && (
        <UploadCollisionModal
          isOpen={true}
          fileName={collisionPrompt.fileName}
          totalCount={collisionPrompt.totalCount}
          onChoice={resolveCollisionChoice}
        />
      )}

      {showMultipleDirsError && (
        <Modal
          isOpen={true}
          onClose={() => setShowMultipleDirsError(false)}
          className="max-w-2xl"
          showCloseButton={true}
        >
          <div className="p-6">
            <h2 className="text-3xl font-semibold text-gray-900 dark:text-white">
              Zbyt wiele folderów
            </h2>

            <div className="mt-3 mb-4 border-t border-gray-300 dark:border-gray-600" />

            <p className="text-lg text-gray-600 dark:text-gray-400 mb-8">
              Próbujesz przesłać zbyt wiele folderów na raz. Spróbuj wczytywać foldery pojedynczo.
            </p>

            <div className="flex justify-end">
              <Button variant="primary" onClick={() => setShowMultipleDirsError(false)}>
                OK
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
          className={`flex flex-col relative ${isDragging ? "bg-blue-50 dark:bg-blue-900/20" : ""}`}
          style={{
            height: "calc(70vh + 200px)",
            maxHeight: "90vh",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* Loading overlay until existing keys are fetched - prevents race and makes collision detection functional */}
          {isLoadingKeys && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/90 dark:bg-gray-900/90 rounded-lg">
              <div className="flex flex-col items-center gap-3">
                <ThreeDotsIndicator />
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Ładowanie modułu
                </p>
              </div>
            </div>
          )}

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
                  } ${uploading || uploadComplete || isLoadingKeys ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
                  onClick={() => {
                    if (!uploading && !uploadComplete && !isLoadingKeys) {
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
                    disabled={uploading || uploadComplete || isLoadingKeys}
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
                  disabled={uploading || uploadComplete || isLoadingKeys}
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
}

/** Public export: hook-free wrapper so dynamic() import does not trigger invalid hook call. */
export function UppyUploadModal(props: UppyUploadModalProps) {
  return <UppyUploadModalContent {...props} />;
}
