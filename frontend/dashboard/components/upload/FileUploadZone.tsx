import { useRef, useState } from "react";

import { Loading } from "../ui/loading/Loading";

interface FileUploadZoneProps {
  onFileSelect: (files: FileList) => void;
  uploading?: boolean;
  accept?: string;
  multiple?: boolean;
  children?: React.ReactNode; // Optional custom content (e.g., storage usage display)
}

export const FileUploadZone: React.FC<FileUploadZoneProps> = ({
  onFileSelect,
  uploading = false,
  accept = "image/*",
  multiple = true,
  children,
}) => {
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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

  return (
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
  );
};
