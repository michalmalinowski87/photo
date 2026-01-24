import { X } from "lucide-react";
import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { useUpdateBusinessInfo } from "../../hooks/mutations/useAuthMutations";
import { useBusinessInfo } from "../../hooks/queries/useAuth";
import { useToast } from "../../hooks/useToast";
import Button from "../ui/button/Button";

interface ClientSendSuccessPopupProps {
  isOpen: boolean;
  onClose: () => void;
  galleryName?: string;
}

export const ClientSendSuccessPopup = ({
  isOpen,
  onClose,
  galleryName,
}: ClientSendSuccessPopupProps) => {
  const { showToast } = useToast();
  const { data: businessInfo } = useBusinessInfo();
  const updateBusinessInfoMutation = useUpdateBusinessInfo();
  const [tutorialDisabled, setTutorialDisabled] = useState<boolean | null>(null);
  const [isSavingPreference, setIsSavingPreference] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState(false);

  // Load tutorial preference
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const loadPreference = () => {
      try {
        const disabled =
          businessInfo?.tutorialNextStepsDisabled === true ||
          businessInfo?.tutorialClientSendDisabled === true;
        setTutorialDisabled(disabled ?? false);
        // If already disabled, don't show popup
        if (disabled) {
          onClose();
        }
      } catch (_error) {
        // Default to showing if we can't load preference
        setTutorialDisabled(false);
      }
    };

    if (businessInfo) {
      loadPreference();
    }
  }, [isOpen, onClose, businessInfo]);

  const handleDontShowAgain = async (checked: boolean) => {
    setDontShowAgain(checked);
    if (checked) {
      setIsSavingPreference(true);
      try {
        await updateBusinessInfoMutation.mutateAsync({
          tutorialClientSendDisabled: true,
        });
        setTutorialDisabled(true);
        showToast("info", "Ukryto", "Ten komunikat nie będzie już wyświetlany");
        onClose();
      } catch (_error) {
        showToast("error", "Błąd", "Nie udało się zapisać preferencji");
        setDontShowAgain(false);
      } finally {
        setIsSavingPreference(false);
      }
    }
  };

  if (!isOpen || tutorialDisabled === true) {
    return null;
  }

  const popupContent = (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/50 dark:bg-black/70 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="p-6 border-b border-gray-400 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
              Link został wysłany do klienta!
            </h2>
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-photographer-elevated dark:hover:bg-gray-800 transition-colors"
              aria-label="Zamknij"
            >
              <X className="w-5 h-5" strokeWidth={2} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {galleryName && (
            <p className="text-lg text-gray-700 dark:text-gray-300 mb-6">
              Galeria <strong className="text-gray-900 dark:text-white">{galleryName}</strong>{" "}
              została wysłana do klienta.
            </p>
          )}

          <div className="space-y-4 mb-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Co dalej?</h3>

            <div className="space-y-3">
              <div className="flex items-start gap-3 p-4 bg-blue-50 dark:bg-blue-500/10 rounded-lg border border-blue-200 dark:border-blue-500/30">
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-500 text-white flex items-center justify-center text-sm font-semibold mt-0.5">
                  1
                </div>
                <div>
                  <p className="font-medium text-gray-900 dark:text-white mb-1">
                    Klient wybiera i zatwierdza zdjęcia
                  </p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Klient otrzyma link do galerii i będzie mógł przeglądać zdjęcia, wybierać te,
                    które mu się podobają, i zatwierdzać swój wybór.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-4 bg-yellow-50 dark:bg-yellow-500/10 rounded-lg border border-yellow-200 dark:border-yellow-500/30">
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-yellow-500 text-white flex items-center justify-center text-sm font-semibold mt-0.5">
                  2
                </div>
                <div>
                  <p className="font-medium text-gray-900 dark:text-white mb-1">
                    Klient może poprosić o zmiany
                  </p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Jeśli klient popełni błąd lub zmieni zdanie, może poprosić o możliwość zmiany
                    wyboru. Otrzymasz powiadomienie i będziesz mógł zatwierdzić lub odrzucić prośbę.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-4 bg-green-50 dark:bg-green-500/10 rounded-lg border border-green-200 dark:border-green-500/30">
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-green-500 text-white flex items-center justify-center text-sm font-semibold mt-0.5">
                  3
                </div>
                <div>
                  <p className="font-medium text-gray-900 dark:text-white mb-1">
                    Przejdź do zlecenia po zatwierdzeniu
                  </p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Gdy klient zatwierdzi wybór, zlecenie zmieni status. Przejdź do szczegółów
                    zlecenia, aby zobaczyć wybrane zdjęcia i dostarczyć zdjęcia finalne.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-4 bg-purple-50 dark:bg-purple-500/10 rounded-lg border border-purple-200 dark:border-purple-500/30">
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-purple-500 text-white flex items-center justify-center text-sm font-semibold mt-0.5">
                  4
                </div>
                <div>
                  <p className="font-medium text-gray-900 dark:text-white mb-1">
                    Dostarcz zdjęcia finalne i wyślij finalny link
                  </p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Prześlij przetworzone, finalne zdjęcia do zlecenia. Gdy wszystko będzie gotowe,
                    wyślij klientowi finalny link do pobrania zdjęć.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Don't show again checkbox */}
          <div className="p-4 bg-photographer-background dark:bg-gray-800 rounded-lg border border-gray-400 dark:border-gray-700">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={dontShowAgain}
                onChange={(e) => void handleDontShowAgain(e.target.checked)}
                disabled={isSavingPreference}
                className="w-4 h-4 text-photographer-accent border-photographer-border rounded focus:ring-photographer-accent dark:border-gray-600 dark:bg-gray-700"
              />
              <span className="text-sm text-gray-600 dark:text-gray-400">
                Nie pokazuj tego komunikatu ponownie
              </span>
            </label>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-400 dark:border-gray-700 flex justify-end">
          <Button variant="primary" onClick={onClose}>
            Rozumiem
          </Button>
        </div>
      </div>
    </div>
  );

  // Render via portal to document.body
  if (typeof window !== "undefined") {
    return createPortal(popupContent, document.body);
  }

  return popupContent;
};
