import React from "react";

import { formatBytes } from "../../utils/format-bytes";

interface StorageDisplayProps {
  /** Current bytes used */
  bytesUsed: number;
  /** Limit bytes (optional - if not provided, only shows used) */
  limitBytes?: number;
  /** Label for the storage type (e.g., "Oryginały", "Finalne") */
  label: string;
  /** Optional loading state indicator */
  isLoading?: boolean;
}

/**
 * Reusable component for displaying storage usage with progress bar
 * Used in upload zones and other places where storage needs to be shown
 */
export const StorageDisplay: React.FC<StorageDisplayProps> = ({
  bytesUsed,
  limitBytes,
  label,
  isLoading = false,
}) => {
  const usagePercentage = limitBytes ? (bytesUsed / limitBytes) * 100 : 0;
  const isWarning = usagePercentage > 75 && usagePercentage <= 90;
  const isError = usagePercentage > 90;

  return (
    <div>
      <div className="text-xs text-gray-600 dark:text-gray-400 mb-1">
        {label}: {formatBytes(bytesUsed)}
        {limitBytes !== undefined && (
          <span className="text-gray-500"> / {formatBytes(limitBytes)}</span>
        )}
        {isLoading && <span className="ml-2 text-xs text-gray-400">(aktualizowanie...)</span>}
      </div>
      {limitBytes !== undefined && (
        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 mb-1">
          <div
            className={`h-2 rounded-full transition-all ${
              isError ? "bg-error-500" : isWarning ? "bg-warning-500" : "bg-brand-500"
            }`}
            style={{
              width: `${Math.min(usagePercentage, 100)}%`,
            }}
          />
        </div>
      )}
    </div>
  );
};
