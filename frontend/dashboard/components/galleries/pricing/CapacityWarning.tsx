import React from "react";

interface CapacityWarningProps {
  uploadedSizeBytes: number;
  originalsLimitBytes: number;
}

export const CapacityWarning: React.FC<CapacityWarningProps> = ({
  uploadedSizeBytes,
  originalsLimitBytes,
}) => {
  const usagePercentage = (uploadedSizeBytes / originalsLimitBytes) * 100;
  const usedGB = (uploadedSizeBytes / (1024 * 1024 * 1024)).toFixed(2);
  const limitGB = (originalsLimitBytes / (1024 * 1024 * 1024)).toFixed(0);

  if (usagePercentage >= 95) {
    return (
      <div className="bg-yellow-50 dark:bg-warning-500/10 border border-yellow-300 dark:border-warning-500/20 rounded-lg p-4 mb-4">
        <div className="flex items-start">
          <svg
            className="w-5 h-5 text-yellow-600 dark:text-warning-400 mt-0.5 mr-2 flex-shrink-0"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path
              fillRule="evenodd"
              d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
              clipRule="evenodd"
            />
          </svg>
          <div>
            <p className="text-sm font-semibold text-yellow-800 dark:text-warning-300 mb-1">
              Uwaga: Galeria jest prawie pełna
            </p>
            <p className="text-sm text-yellow-700 dark:text-warning-200 mb-2">
              Używasz {usedGB} GB z {limitGB} GB ({usagePercentage.toFixed(1)}% pojemności). Po
              opłaceniu będziesz mógł przesłać tylko niewielką ilość dodatkowych zdjęć.
            </p>
            <p className="text-xs text-yellow-600 dark:text-warning-300">
              💡 <strong>Wskazówka:</strong> Rozważ wybór większego planu, aby mieć więcej miejsca
              na przyszłe zdjęcia.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (usagePercentage >= 80) {
    return (
      <div className="bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 rounded-lg p-4 mb-4">
        <p className="text-sm text-blue-700 dark:text-blue-300">
          ℹ️ Używasz {usedGB} GB z {limitGB} GB ({usagePercentage.toFixed(1)}% pojemności). Po
          opłaceniu będziesz mógł przesłać jeszcze{" "}
          {((originalsLimitBytes - uploadedSizeBytes) / (1024 * 1024 * 1024)).toFixed(1)} GB zdjęć.
        </p>
      </div>
    );
  }

  return null;
};
