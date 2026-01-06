import React from "react";

interface ProcessingCounterProps {
  count: number;
}

export const ProcessingCounter = ({ count }: ProcessingCounterProps) => {
  if (count === 0) {
    return null;
  }

  return (
    <div className="px-4 py-2 border-t border-gray-400 dark:border-gray-700">
      <div className="flex items-center gap-2">
        <div className="w-4 h-4 flex items-center justify-center">
          <div className="w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
        <p className="text-sm text-gray-700 dark:text-gray-300">
          Przetwarzanie: <span className="font-medium">{count}</span> zdjęć
        </p>
      </div>
    </div>
  );
};
