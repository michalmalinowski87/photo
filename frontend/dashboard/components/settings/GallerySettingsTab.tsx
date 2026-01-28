import React, { useState } from "react";
import { WatermarkEditorOverlay } from "../galleries/sidebar/WatermarkEditorOverlay";
import { useBusinessInfo } from "../../hooks/queries/useAuth";

export function GallerySettingsTab() {
  const { data: businessInfo } = useBusinessInfo();
  const [showWatermarkEditor, setShowWatermarkEditor] = useState(false);

  const hasGlobalWatermark = Boolean(businessInfo?.defaultWatermarkUrl);

  return (
    <div className="space-y-6">
      <div className="p-6 bg-white border border-gray-400 rounded-lg shadow-sm dark:bg-gray-800 dark:border-gray-700">
        <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-2.5">
          Znak wodny
        </h2>
        <p className="text-base text-gray-600 dark:text-gray-400 mb-6">
          Ustaw domyślny znak wodny, który będzie używany we wszystkich galeriach, chyba że
          ustawisz znak wodny specyficzny dla galerii.
        </p>

        <button
          onClick={() => setShowWatermarkEditor(true)}
          className="p-6 border-2 border-gray-400 dark:border-gray-700 rounded-lg hover:border-photographer-accent dark:hover:border-photographer-accent transition-colors text-left w-full"
        >
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
            {hasGlobalWatermark ? "Zarządzaj znakiem wodnym" : "Dodaj znak wodny"}
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {hasGlobalWatermark
              ? "Edytuj domyślny znak wodny dla wszystkich galerii"
              : "Ustaw domyślny znak wodny, który będzie używany we wszystkich galeriach"}
          </p>
        </button>
      </div>

      {showWatermarkEditor && (
        <WatermarkEditorOverlay
          isOpen={showWatermarkEditor}
          onClose={() => setShowWatermarkEditor(false)}
          galleryId="" // Not used for global watermark
          gallery={null} // Not used for global watermark
        />
      )}
    </div>
  );
}
