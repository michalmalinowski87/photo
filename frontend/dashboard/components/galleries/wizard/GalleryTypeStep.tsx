import { CheckCircle2, Image as ImageIcon, Check } from "lucide-react";
import React from "react";

interface GalleryTypeStepProps {
  selectionEnabled?: boolean;
  onSelectionEnabledChange: (enabled: boolean) => void;
}

export const GalleryTypeStep: React.FC<GalleryTypeStepProps> = ({
  selectionEnabled,
  onSelectionEnabledChange,
}) => {
  const isFirstSelected = selectionEnabled === true;
  const isSecondSelected = selectionEnabled === false;

  return (
    <div className="w-full">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl ml-0">
        <button
          onClick={() => onSelectionEnabledChange(true)}
          className={`relative p-10 md:p-12 rounded-2xl border-2 transition-all duration-300 ${
            isFirstSelected
              ? "border-brand-500 bg-brand-50 dark:bg-brand-500/10 shadow-lg scale-105"
              : "border-gray-200 dark:border-gray-700 bg-white/50 dark:bg-gray-800/50 hover:border-gray-300 dark:hover:border-gray-600"
          }`}
        >
          <div className="flex flex-col items-center space-y-4">
            <div
              className={`w-20 h-20 rounded-full flex items-center justify-center ${
                isFirstSelected ? "bg-brand-500" : "bg-gray-200 dark:bg-gray-700"
              }`}
            >
              <CheckCircle2 className="w-10 h-10 text-white" strokeWidth={2} />
            </div>
            <div className="text-center">
              <div
                className={`text-xl font-semibold mb-2 ${
                  isFirstSelected
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
          {isFirstSelected && (
            <div className="absolute top-4 right-4">
              <div className="w-6 h-6 rounded-full bg-brand-500 flex items-center justify-center">
                <Check size={16} className="text-white" />
              </div>
            </div>
          )}
        </button>
        <button
          onClick={() => onSelectionEnabledChange(false)}
          className={`relative p-10 md:p-12 rounded-2xl border-2 transition-all duration-300 ${
            isSecondSelected
              ? "border-brand-500 bg-brand-50 dark:bg-brand-500/10 shadow-lg scale-105"
              : "border-gray-200 dark:border-gray-700 bg-white/50 dark:bg-gray-800/50 hover:border-gray-300 dark:hover:border-gray-600"
          }`}
        >
          <div className="flex flex-col items-center space-y-4">
            <div
              className={`w-20 h-20 rounded-full flex items-center justify-center ${
                isSecondSelected ? "bg-brand-500" : "bg-gray-200 dark:bg-gray-700"
              }`}
            >
              <ImageIcon className="w-10 h-10 text-white" strokeWidth={2} />
            </div>
            <div className="text-center">
              <div
                className={`text-xl font-semibold mb-2 ${
                  isSecondSelected
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
          {isSecondSelected && (
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
