import { AlertTriangle } from "lucide-react";
import React from "react";

interface LimitExceededWarningProps {
  uploadedSizeBytes: number;
  originalsLimitBytes: number;
  excessBytes: number;
}

export const LimitExceededWarning = ({
  uploadedSizeBytes,
  originalsLimitBytes,
  excessBytes,
}: LimitExceededWarningProps) => {
  const usedGB = (uploadedSizeBytes / (1024 * 1024 * 1024)).toFixed(2);
  const limitGB = (originalsLimitBytes / (1024 * 1024 * 1024)).toFixed(0);
  const excessMB = (excessBytes / (1024 * 1024)).toFixed(2);
  const excessGB = (excessBytes / (1024 * 1024 * 1024)).toFixed(2);

  return (
    <div className="bg-red-50 dark:bg-red-500/10 border-2 border-red-300 dark:border-red-500/30 rounded-lg p-4 mb-4">
      <div className="flex items-start">
        <AlertTriangle
          size={24}
          className="text-red-600 dark:text-red-400 mt-0.5 mr-3 flex-shrink-0"
        />
        <div className="flex-1">
          <p className="text-base font-semibold text-red-800 dark:text-red-300 mb-2">
            Przekroczono limit miejsca w galerii
          </p>
          <p className="text-sm text-red-700 dark:text-red-200 mb-2">
            Przekroczono limit o {parseFloat(excessGB) >= 1 ? `${excessGB} GB` : `${excessMB} MB`}.
            Obecny limit: {limitGB} GB, użyto: {usedGB} GB.
          </p>
          <p className="text-xs text-red-600 dark:text-red-300">
            Wybierz większy plan, aby zwiększyć limit i kontynuować przesyłanie zdjęć.
          </p>
        </div>
      </div>
    </div>
  );
};
