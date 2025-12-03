import { CheckCircle2, Image as ImageIcon, Check } from "lucide-react";
import React from "react";

interface GalleryTypeStepProps {
  selectionEnabled: boolean;
  onSelectionEnabledChange: (enabled: boolean) => void;
}

export const GalleryTypeStep: React.FC<GalleryTypeStepProps> = ({
  selectionEnabled,
  onSelectionEnabledChange,
}) => {
  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      <div className="text-center space-y-2">
        <h3 className="text-2xl font-bold text-gray-900 dark:text-white">Typ galerii</h3>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Wybierz czy klient będzie mógł wybierać zdjęcia czy otrzyma wszystkie
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <button
          onClick={() => onSelectionEnabledChange(true)}
          className={`relative p-8 rounded-2xl border-2 transition-all duration-300 ${
            selectionEnabled
              ? "border-brand-500 bg-brand-50 dark:bg-brand-500/10 shadow-lg scale-105"
              : "border-gray-200 dark:border-gray-700 bg-white/50 dark:bg-gray-800/50 hover:border-gray-300 dark:hover:border-gray-600"
          }`}
        >
          <div className="flex flex-col items-center space-y-4">
            <div
              className={`w-20 h-20 rounded-full flex items-center justify-center ${
                selectionEnabled ? "bg-brand-500" : "bg-gray-200 dark:bg-gray-700"
              }`}
            >
              <CheckCircle2 className="w-10 h-10 text-white" strokeWidth={2} />
            </div>
            <div className="text-center">
              <div
                className={`text-xl font-semibold mb-2 ${
                  selectionEnabled
                    ? "text-brand-600 dark:text-brand-400"
                    : "text-gray-900 dark:text-white"
                }`}
              >
                Wybór przez klienta
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400">
                Klient wybiera zdjęcia, które chce otrzymać
              </div>
            </div>
          </div>
          {selectionEnabled && (
            <div className="absolute top-4 right-4">
              <div className="w-6 h-6 rounded-full bg-brand-500 flex items-center justify-center">
                <Check size={16} className="text-white" />
              </div>
            </div>
          )}
        </button>
        <button
          onClick={() => onSelectionEnabledChange(false)}
          className={`relative p-8 rounded-2xl border-2 transition-all duration-300 ${
            !selectionEnabled
              ? "border-brand-500 bg-brand-50 dark:bg-brand-500/10 shadow-lg scale-105"
              : "border-gray-200 dark:border-gray-700 bg-white/50 dark:bg-gray-800/50 hover:border-gray-300 dark:hover:border-gray-600"
          }`}
        >
          <div className="flex flex-col items-center space-y-4">
            <div
              className={`w-20 h-20 rounded-full flex items-center justify-center ${
                !selectionEnabled ? "bg-brand-500" : "bg-gray-200 dark:bg-gray-700"
              }`}
            >
              <ImageIcon className="w-10 h-10 text-white" strokeWidth={2} />
            </div>
            <div className="text-center">
              <div
                className={`text-xl font-semibold mb-2 ${
                  !selectionEnabled
                    ? "text-brand-600 dark:text-brand-400"
                    : "text-gray-900 dark:text-white"
                }`}
              >
                Wszystkie zdjęcia
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400">
                Klient otrzyma wszystkie zdjęcia bez możliwości wyboru
              </div>
            </div>
          </div>
          {!selectionEnabled && (
            <div className="absolute top-4 right-4">
              <div className="w-6 h-6 rounded-full bg-brand-500 flex items-center justify-center">
                <Check size={16} className="text-white" />
              </div>
            </div>
          )}
        </button>
      </div>
    </div>
  );
};
