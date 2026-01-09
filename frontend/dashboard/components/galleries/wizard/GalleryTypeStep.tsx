import { CheckCircle2, Image as ImageIcon, Check } from "lucide-react";
import React from "react";

interface GalleryTypeStepProps {
  selectionEnabled?: boolean;
  onSelectionEnabledChange: (enabled: boolean) => void;
}

export const GalleryTypeStep = ({
  selectionEnabled,
  onSelectionEnabledChange,
}: GalleryTypeStepProps) => {
  const isFirstSelected = selectionEnabled === true;
  const isSecondSelected = selectionEnabled === false;

  return (
    <div className="w-full mt-[150px]">
      <div className="mb-8 md:mb-12">
        <div className="text-2xl md:text-3xl font-medium text-gray-900 dark:text-white mb-2">
          Wybierz typ galerii *
        </div>
        <p className="text-base text-gray-500 dark:text-gray-400 italic">
          Jak klient będzie korzystał z galerii?
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl ml-0">
        <button
          onClick={() => onSelectionEnabledChange(true)}
          className={`relative p-10 md:p-12 rounded-2xl border-2 transition-all duration-300 active:scale-[0.98] ${
            isFirstSelected
              ? "border-photographer-accent bg-photographer-accentLight/50 dark:bg-photographer-accent/10 shadow-lg scale-105"
              : "border-gray-400 dark:border-gray-700 bg-white/50 dark:bg-gray-800/50 hover:border-gray-400 dark:hover:border-gray-600"
          }`}
        >
          <div className="flex flex-col items-center space-y-4">
            <div
              className={`w-20 h-20 rounded-full flex items-center justify-center ${
                isFirstSelected
                  ? "bg-photographer-accent"
                  : "bg-photographer-muted dark:bg-gray-700"
              }`}
            >
              <CheckCircle2 className="w-10 h-10 text-white" strokeWidth={2} />
            </div>
            <div className="text-center">
              <div
                className={`text-xl font-semibold mb-2 ${
                  isFirstSelected
                    ? "text-photographer-accent dark:text-photographer-accent"
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
          {isFirstSelected && (
            <div className="absolute top-4 right-4">
              <div className="w-6 h-6 rounded-full bg-photographer-accent flex items-center justify-center">
                <Check size={16} className="text-white" />
              </div>
            </div>
          )}
        </button>
        <button
          onClick={() => onSelectionEnabledChange(false)}
          className={`relative p-10 md:p-12 rounded-2xl border-2 transition-all duration-300 active:scale-[0.98] ${
            isSecondSelected
              ? "border-photographer-accent bg-photographer-accentLight/50 dark:bg-photographer-accent/10 shadow-lg scale-105"
              : "border-gray-400 dark:border-gray-700 bg-white/50 dark:bg-gray-800/50 hover:border-gray-400 dark:hover:border-gray-600"
          }`}
        >
          <div className="flex flex-col items-center space-y-4">
            <div
              className={`w-20 h-20 rounded-full flex items-center justify-center ${
                isSecondSelected
                  ? "bg-photographer-accent"
                  : "bg-photographer-muted dark:bg-gray-700"
              }`}
            >
              <ImageIcon className="w-10 h-10 text-white" strokeWidth={2} />
            </div>
            <div className="text-center">
              <div
                className={`text-xl font-semibold mb-2 ${
                  isSecondSelected
                    ? "text-photographer-accent dark:text-photographer-accent"
                    : "text-gray-900 dark:text-white"
                }`}
              >
                Bez wyboru
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400">
                Klient otrzyma wszystkie zdjęcia bez możliwości wyboru
              </div>
            </div>
          </div>
          {isSecondSelected && (
            <div className="absolute top-4 right-4">
              <div className="w-6 h-6 rounded-full bg-photographer-accent flex items-center justify-center">
                <Check size={16} className="text-white" />
              </div>
            </div>
          )}
        </button>
      </div>
    </div>
  );
};
