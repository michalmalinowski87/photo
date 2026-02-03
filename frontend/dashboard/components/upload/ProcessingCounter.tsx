import React from "react";

import { ThreeDotsIndicator } from "../ui/loading/Loading";

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
        <ThreeDotsIndicator size="sm" />
        <p className="text-sm text-gray-700 dark:text-gray-300">
          Przetwarzanie: <span className="font-medium">{count}</span> zdjęć
        </p>
      </div>
    </div>
  );
};
