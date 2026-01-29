import { AlertTriangle } from "lucide-react";
import React, { useState } from "react";

import { useBusinessInfo } from "../../hooks/queries/useAuth";
import { shouldShowWatermarkWarningGlobal } from "../../lib/watermark-warning";
import { WatermarkEditorOverlay } from "../galleries/sidebar/WatermarkEditorOverlay";

export function GallerySettingsTab() {
  const { data: businessInfo } = useBusinessInfo();
  const [showWatermarkEditor, setShowWatermarkEditor] = useState(false);

  const hasGlobalWatermark = Boolean(businessInfo?.defaultWatermarkUrl);
  const showWatermarkWarning =
    businessInfo !== undefined &&
    businessInfo !== null &&
    shouldShowWatermarkWarningGlobal(businessInfo);

  return (
    <div className="space-y-4 pb-8">
      <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Ustawienia</h1>

      <div className="p-6 bg-white border border-gray-400 rounded-lg shadow-sm dark:bg-gray-800 dark:border-gray-700">
        <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-2.5 flex items-center gap-2">
          Znak wodny
          {showWatermarkWarning && (
            <AlertTriangle
              size={24}
              className="text-orange-500 dark:text-orange-400 flex-shrink-0"
              title="Znak wodny nie został ustawiony"
              aria-label="Znak wodny nie został ustawiony"
            />
          )}
        </h2>
        <p className="text-base text-gray-600 dark:text-gray-400 mb-8">
          Ustaw domyślny znak wodny, który będzie używany we wszystkich galeriach, chyba że ustawisz
          znak wodny specyficzny dla galerii.
        </p>

        <div className="max-w-md mx-auto">
          <button
            onClick={() => setShowWatermarkEditor(true)}
            className="relative w-full p-10 md:p-12 rounded-2xl border-2 border-gray-400 dark:border-gray-700 bg-white/50 dark:bg-gray-800/50 hover:border-photographer-accent dark:hover:border-photographer-accent transition-all duration-300 active:scale-[0.98]"
          >
            {showWatermarkWarning && (
              <div className="absolute top-2 right-2">
                <AlertTriangle size={20} className="text-orange-500 dark:text-orange-400" />
              </div>
            )}
            <div className="flex flex-col items-center space-y-4">
              <div className="w-20 h-20 rounded-full flex items-center justify-center bg-photographer-muted dark:bg-gray-700">
                <svg
                  className="w-10 h-10 text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                  />
                </svg>
              </div>
              <div className="text-center">
                <div className="text-xl font-semibold mb-2 text-gray-900 dark:text-white">
                  {hasGlobalWatermark ? "Zarządzaj znakiem wodnym" : "Dodaj znak wodny"}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  {hasGlobalWatermark
                    ? "Edytuj domyślny znak wodny dla wszystkich galerii"
                    : "Ustaw domyślny znak wodny, który będzie używany we wszystkich galeriach"}
                </div>
              </div>
            </div>
          </button>
        </div>
      </div>

      {showWatermarkEditor && (
        <WatermarkEditorOverlay
          isOpen={showWatermarkEditor}
          onClose={() => setShowWatermarkEditor(false)}
          galleryId=""
          gallery={null}
        />
      )}
    </div>
  );
}
