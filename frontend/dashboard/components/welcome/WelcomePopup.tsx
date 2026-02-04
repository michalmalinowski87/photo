import { CircleDollarSign, Sparkles } from "lucide-react";
import React from "react";

import { formatPrice } from "../../lib/format-price";
import Button from "../ui/button/Button";
import { Modal } from "../ui/modal";

interface WelcomePopupProps {
  isOpen: boolean;
  onClose: () => void;
  welcomeBonusCents: number;
  onCreateGallery?: () => void;
}

export const WelcomePopup = ({
  isOpen,
  onClose,
  welcomeBonusCents,
  onCreateGallery,
}: WelcomePopupProps) => {
  return (
    <Modal isOpen={isOpen} onClose={onClose} className="max-w-2xl max-h-[90vh] flex flex-col">
      <div className="overflow-y-auto flex-1 p-6">
        {/* Header with celebration */}
        <div className="text-center mb-5 md:mb-6">
          <div className="relative inline-flex items-center justify-center mb-4">
            {/* Animated background circle */}
            <div className="absolute inset-0 rounded-full bg-photographer-accent/20 animate-pulse"></div>
            <div className="relative inline-flex items-center justify-center w-16 h-16 md:w-20 md:h-20 rounded-full bg-gradient-to-br from-photographer-accent to-photographer-accentHover shadow-lg">
              <Sparkles className="w-8 h-8 md:w-10 md:h-10 text-white" strokeWidth={2} />
            </div>
          </div>
          <h2 className="text-2xl md:text-3xl font-bold mb-2 text-photographer-accentDark dark:text-photographer-accentLight">
            Witamy w PixiProof!
          </h2>
          <p className="text-base md:text-lg text-gray-700 dark:text-gray-300 leading-relaxed">
            Jesteśmy zachwyceni, że dołączyłeś do naszej społeczności fotografów!
          </p>
          <p className="text-sm md:text-base text-gray-600 dark:text-gray-400 mt-1.5">
            Chcemy, aby Twoja przygoda z nami zaczęła się od czegoś wyjątkowego...
          </p>
        </div>

        {/* Welcome Bonus Section - More Exciting */}
        <div className="relative overflow-hidden bg-gradient-to-br from-photographer-background via-photographer-elevated to-photographer-background dark:from-photographer-accent/20 dark:via-photographer-accent/15 dark:to-photographer-accent/20 rounded-xl md:rounded-2xl p-4 md:p-6 mb-5 md:mb-6 border-2 border-photographer-border dark:border-photographer-accent/30 shadow-lg">
          {/* Decorative elements */}
          <div className="absolute top-0 right-0 w-24 h-24 md:w-32 md:h-32 bg-photographer-accent/10 rounded-full -mr-12 -mt-12 md:-mr-16 md:-mt-16"></div>
          <div className="absolute bottom-0 left-0 w-20 h-20 md:w-24 md:h-24 bg-photographer-accent/10 rounded-full -ml-10 -mb-10 md:-ml-12 md:-mb-12"></div>

          <div className="relative flex flex-col md:flex-row items-start gap-3 md:gap-4">
            <div className="flex-shrink-0">
              <div className="w-12 h-12 md:w-14 md:h-14 rounded-xl bg-gradient-to-br from-photographer-accent to-photographer-accentHover flex items-center justify-center shadow-lg">
                <CircleDollarSign className="w-6 h-6 md:w-7 md:h-7 text-white" strokeWidth={2.5} />
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-lg md:text-xl font-bold text-gray-900 dark:text-white mb-2">
                Prezent powitalny od nas! 🎁
              </h3>
              <p className="text-sm md:text-base text-gray-800 dark:text-gray-200 mb-3 leading-relaxed">
                W podziękowaniu za zaufanie, jakie nam okazujesz, przygotowaliśmy dla Ciebie{" "}
                <span className="inline-flex items-center gap-1 font-bold text-xl md:text-2xl text-photographer-accentDark dark:text-photographer-accent px-2 py-0.5 bg-white/50 dark:bg-gray-800/50 rounded-lg border border-photographer-border dark:border-photographer-accent/30">
                  {formatPrice(welcomeBonusCents)}
                </span>{" "}
                bonusu powitalnego!
              </p>
              <div className="bg-white/60 dark:bg-gray-800/60 rounded-lg md:rounded-xl p-3 md:p-4 border border-photographer-border dark:border-photographer-accent/30">
                <p className="text-xs md:text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                  <span className="font-semibold text-photographer-accentDark dark:text-photographer-accent">
                    To wystarczy na plan 1GB - 3 miesiące!
                  </span>{" "}
                  Możesz od razu rozpocząć pracę i utworzyć swoją pierwszą galerię bez dodatkowych
                  kosztów. To nasz sposób na pokazanie, jak bardzo cieszymy się, że jesteś z nami!
                  ✨
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* First Steps Section - More Friendly */}
        <div className="mb-4 md:mb-5">
          <div className="flex items-center gap-2 md:gap-3 mb-3 md:mb-4">
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-gray-300 dark:via-gray-600 to-transparent"></div>
            <h3 className="text-lg md:text-xl font-bold text-gray-900 dark:text-white whitespace-nowrap">
              Zacznijmy razem!
            </h3>
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-gray-300 dark:via-gray-600 to-transparent"></div>
          </div>
          <div className="space-y-2 md:space-y-2.5">
            <div className="group flex items-start gap-2.5 md:gap-3 p-2.5 md:p-3 rounded-lg md:rounded-xl hover:bg-photographer-background dark:hover:bg-gray-800/50 transition-colors">
              <div className="flex-shrink-0 w-8 h-8 md:w-9 md:h-9 rounded-lg md:rounded-xl bg-gradient-to-br from-photographer-accent to-photographer-accentHover flex items-center justify-center text-sm md:text-base font-bold text-white shadow-md">
                1
              </div>
              <div className="flex-1 min-w-0 pt-0">
                <h4 className="font-semibold text-gray-900 dark:text-white mb-1 text-sm md:text-base">
                  Utwórz swoją pierwszą galerię
                </h4>
                <p className="text-xs md:text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                  Kliknij przycisk &quot;Utwórz galerię&quot; w menu. To zajmie tylko chwilę, a już
                  będziesz mógł rozpocząć pracę z klientami!
                </p>
              </div>
            </div>

            <div className="group flex items-start gap-2.5 md:gap-3 p-2.5 md:p-3 rounded-lg md:rounded-xl hover:bg-photographer-background dark:hover:bg-gray-800/50 transition-colors">
              <div className="flex-shrink-0 w-8 h-8 md:w-9 md:h-9 rounded-lg md:rounded-xl bg-gradient-to-br from-photographer-accent to-photographer-accentHover flex items-center justify-center text-sm md:text-base font-bold text-white shadow-md">
                2
              </div>
              <div className="flex-1 min-w-0 pt-0">
                <h4 className="font-semibold text-gray-900 dark:text-white mb-1 text-sm md:text-base">
                  Prześlij zdjęcia i opublikuj galerię
                </h4>
                <p className="text-xs md:text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                  Po utworzeniu galerii, prześlij zdjęcia do przeglądu przez klienta lub od razu
                  zdjęcia finalne - Ty decydujesz o przepływie pracy.
                </p>
              </div>
            </div>

            <div className="group flex items-start gap-2.5 md:gap-3 p-2.5 md:p-3 rounded-lg md:rounded-xl hover:bg-photographer-background dark:hover:bg-gray-800/50 transition-colors">
              <div className="flex-shrink-0 w-8 h-8 md:w-9 md:h-9 rounded-lg md:rounded-xl bg-gradient-to-br from-photographer-accent to-photographer-accentHover flex items-center justify-center text-sm md:text-base font-bold text-white shadow-md">
                3
              </div>
              <div className="flex-1 min-w-0 pt-0">
                <h4 className="font-semibold text-gray-900 dark:text-white mb-1 text-sm md:text-base">
                  Udostępnij galerię klientowi
                </h4>
                <p className="text-xs md:text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                  Wyślij link do galerii klientowi jednym kliknięciem. Będzie mógł przeglądać,
                  wybierać i komentować zdjęcia w wygodny sposób.
                </p>
              </div>
            </div>

            <div className="group flex items-start gap-2.5 md:gap-3 p-2.5 md:p-3 rounded-lg md:rounded-xl hover:bg-photographer-background dark:hover:bg-gray-800/50 transition-colors">
              <div className="flex-shrink-0 w-8 h-8 md:w-9 md:h-9 rounded-lg md:rounded-xl bg-gradient-to-br from-photographer-accent to-photographer-accentHover flex items-center justify-center text-sm md:text-base font-bold text-white shadow-md">
                4
              </div>
              <div className="flex-1 min-w-0 pt-0">
                <h4 className="font-semibold text-gray-900 dark:text-white mb-1 text-sm md:text-base">
                  Zarządzaj zleceniami
                </h4>
                <p className="text-xs md:text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                  Śledź status zleceń, przetwarzaj wybory klientów i finalizuj dostawy - wszystko w
                  jednym miejscu, bez zbędnych komplikacji.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Actions - Fixed at bottom */}
      <div className="flex-shrink-0 border-t border-gray-400 dark:border-gray-700 bg-white dark:bg-gray-900 rounded-b-3xl p-3 md:p-4 pt-3 md:pt-4">
        <div className="flex flex-col sm:flex-row gap-2 md:gap-3">
          <Button
            variant="primary"
            className="flex-1 text-sm md:text-base py-2.5 md:py-3 font-semibold shadow-lg hover:shadow-xl transition-shadow"
            onClick={() => {
              onClose();
              if (onCreateGallery) {
                onCreateGallery();
              }
            }}
          >
            Utwórz pierwszą galerię
          </Button>
          <Button
            variant="outline"
            className="flex-1 text-sm md:text-base py-2.5 md:py-3 font-medium"
            onClick={onClose}
          >
            Pozwól mi najpierw rozejrzeć się
          </Button>
        </div>

        {/* Closing message */}
        <p className="text-center text-xs md:text-sm text-gray-500 dark:text-gray-400 mt-3 md:mt-3 italic">
          Mamy nadzieję, że będziesz się świetnie bawić! Jeśli masz pytania, jesteśmy tutaj, aby
          pomóc. ❤️
        </p>
      </div>
    </Modal>
  );
};
