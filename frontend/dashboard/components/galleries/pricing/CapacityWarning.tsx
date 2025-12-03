import { AlertTriangle } from "lucide-react";
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
          <AlertTriangle
            size={20}
            className="text-yellow-600 dark:text-warning-400 mt-0.5 mr-2 flex-shrink-0 fill-current"
          />
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
