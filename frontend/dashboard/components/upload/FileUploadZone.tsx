import { useEffect, useRef, useState } from "react";

import { Loading } from "../ui/loading/Loading";

interface FileUploadZoneProps {
  onFileSelect: (files: FileList) => void;
  uploading?: boolean;
  accept?: string;
  multiple?: boolean;
  children?: React.ReactNode; // Optional custom content (e.g., storage usage display)
  fullPageDrop?: boolean; // Enable full-page drop detection (default: true)
}

export const FileUploadZone: React.FC<FileUploadZoneProps> = ({
  onFileSelect,
  uploading = false,
  accept = "image/*",
  multiple = true,
  children,
  fullPageDrop = true,
}) => {
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [isFullPageDragging, setIsFullPageDragging] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const dragCounterRef = useRef<number>(0); // Counter to handle nested drag enter/leave events
  const isDraggingFilesRef = useRef<boolean>(false); // Track if we're dragging files (not other content)

  const handleDrop = (e: React.DragEvent<HTMLDivElement>): void => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      void onFileSelect(files);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>): void => {
    e.preventDefault();
    e.stopPropagation();
    if (!uploading) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>): void => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleClick = (): void => {
    if (!uploading) {
      fileInputRef.current?.click();
    }
  };

  // Set up global drag event listeners for full-page drop detection
  useEffect(() => {
    if (!fullPageDrop || uploading) {
      return;
    }

    const handleDocumentDragEnter = (e: DragEvent): void => {
      // Only activate for file drags, not text or other content
      const hasFiles = e.dataTransfer?.types.some(
        (type) => type === "Files" || type === "application/x-moz-file"
      );
      if (!hasFiles) {
        return;
      }

      // Check if drag is over sidebar (left side < 380px) - don't activate overlay for sidebar
      const isOverSidebar = e.clientX < 380;
      if (isOverSidebar) {
        // Don't activate full-page dragging for sidebar area
        return;
      }

      isDraggingFilesRef.current = true;
      dragCounterRef.current += 1;
      if (!uploading) {
        setIsFullPageDragging(true);
      }
    };

    const handleDocumentDragOver = (e: DragEvent): void => {
      // Check if drag is over sidebar (left side < 380px) - don't interfere with sidebar drag/drop
      const isOverSidebar = e.clientX < 380;
      if (isOverSidebar) {
        // Don't prevent default or stop propagation for sidebar drag events
        return;
      }
      
      e.preventDefault();
      e.stopPropagation();
      if (!uploading && isDraggingFilesRef.current) {
        setIsFullPageDragging(true);
      }
    };

    const handleDocumentDragLeave = (e: DragEvent): void => {
      // Only handle drag leave if we're leaving the document (not just moving between elements)
      // Check if we're leaving to a non-document element
      const relatedTarget = e.relatedTarget as Node | null;
      if (!relatedTarget || !document.documentElement.contains(relatedTarget)) {
        dragCounterRef.current -= 1;
        // Only deactivate when we've left the document entirely (counter reaches 0)
        if (dragCounterRef.current === 0) {
          setIsFullPageDragging(false);
          isDraggingFilesRef.current = false;
        }
      }
    };

    const handleDocumentDrop = (e: DragEvent): void => {
      // Check if drop is over sidebar (left side < 380px) - don't interfere with sidebar drag/drop
      const isOverSidebar = e.clientX < 380;
      if (isOverSidebar) {
        // Don't prevent default or stop propagation for sidebar drop events
        // Reset state but let the sidebar handle the drop
        setIsFullPageDragging(false);
        dragCounterRef.current = 0;
        isDraggingFilesRef.current = false;
        return;
      }
      
      e.preventDefault();
      e.stopPropagation();
      setIsFullPageDragging(false);
      dragCounterRef.current = 0;
      isDraggingFilesRef.current = false;

      const files = e.dataTransfer?.files;
      if (files && files.length > 0 && !uploading) {
        void onFileSelect(files);
      }
    };

    // Attach listeners to document
    document.addEventListener("dragenter", handleDocumentDragEnter);
    document.addEventListener("dragover", handleDocumentDragOver);
    document.addEventListener("dragleave", handleDocumentDragLeave);
    document.addEventListener("drop", handleDocumentDrop);

    return () => {
      document.removeEventListener("dragenter", handleDocumentDragEnter);
      document.removeEventListener("dragover", handleDocumentDragOver);
      document.removeEventListener("dragleave", handleDocumentDragLeave);
      document.removeEventListener("drop", handleDocumentDrop);
      // Reset state on cleanup
      setIsFullPageDragging(false);
      dragCounterRef.current = 0;
      isDraggingFilesRef.current = false;
    };
  }, [fullPageDrop, uploading, onFileSelect]);

  return (
    <>
      {/* Full-page invisible overlay for drop detection - excludes sidebar (380px) */}
      {fullPageDrop && isFullPageDragging && (
        <div
          className="fixed top-0 right-0 bottom-0 left-[380px] z-50 pointer-events-auto"
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setIsFullPageDragging(false);
            dragCounterRef.current = 0;
            isDraggingFilesRef.current = false;

            const files = e.dataTransfer.files;
            if (files && files.length > 0 && !uploading) {
              void onFileSelect(files);
            }
          }}
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            e.stopPropagation();
            // Only deactivate when leaving the overlay entirely
            const relatedTarget = e.relatedTarget as Node | null;
            if (!relatedTarget || !document.documentElement.contains(relatedTarget)) {
              setIsFullPageDragging(false);
              dragCounterRef.current = 0;
              isDraggingFilesRef.current = false;
            }
          }}
        />
      )}

      <div
        className={`relative w-full rounded-lg border-2 border-dashed transition-colors ${
          isDragging
            ? "border-brand-500 bg-brand-50 dark:bg-brand-500/10"
            : "border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800"
        } ${uploading ? "opacity-50 pointer-events-none" : ""}`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={handleClick}
      >
        <div className="p-8 text-center cursor-pointer">
          {uploading ? (
            <div className="space-y-2">
              <Loading size="lg" />
              <p className="text-sm text-gray-600 dark:text-gray-400">Przesyłanie zdjęć...</p>
            </div>
          ) : (
            <>
              {children ?? (
                <div className="space-y-2">
                  <svg
                    className="mx-auto h-12 w-12 text-gray-400"
                    stroke="currentColor"
                    fill="none"
                    viewBox="0 0 48 48"
                    aria-hidden="true"
                  >
                    <path
                      d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02"
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    <span className="font-semibold text-brand-600 dark:text-brand-400">
                      Kliknij aby przesłać
                    </span>{" "}
                    lub przeciągnij i upuść
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-500">
                    Obsługiwane formaty: JPEG, PNG
                  </p>
                </div>
              )}
            </>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept={accept}
          multiple={multiple}
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) {
              void onFileSelect(e.target.files);
            }
          }}
          className="hidden"
        />
      </div>
    </>
  );
};
