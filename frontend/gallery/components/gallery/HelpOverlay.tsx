"use client";

import { X } from "lucide-react";
import type { SelectionState } from "@/types/gallery";

interface HelpOverlayProps {
  isVisible: boolean;
  onClose: () => void;
  selectionState?: SelectionState | null;
}

export function HelpOverlay({ isVisible, onClose, selectionState }: HelpOverlayProps) {
  if (!isVisible) return null;

  // Determine current state
  const state = selectionState
    ? selectionState.hasDeliveredOrder
      ? "delivered"
      : selectionState.changeRequestPending
      ? "changesRequested"
      : selectionState.approved || selectionState.hasClientApprovedOrder
      ? "approved"
      : "selecting"
    : "selecting";

  const baseLimit = selectionState?.pricingPackage?.includedCount || 0;
  const extraPriceCents = selectionState?.pricingPackage?.extraPriceCents || 0;
  const extraPrice = extraPriceCents > 0 ? `${(extraPriceCents / 100).toFixed(2)} zł` : "";

  const getHelpContent = () => {
    switch (state) {
      case "selecting":
        return (
          <div className="space-y-4">
            <h2 className="text-2xl font-bold">Wybór zdjęć</h2>
            <p>
              To jest etap wyboru zdjęć. Wybierz zdjęcia, które chcesz, dotykając ich (co najmniej tyle,
              ile jest zawartych w Twoim pakiecie — zobacz licznik u góry).
            </p>
            {extraPriceCents > 0 && (
              <p>
                Możesz wybrać więcej zdjęć — każde dodatkowe kosztuje {extraPrice}.
              </p>
            )}
            <p>
              Gdy będziesz zadowolony z wyboru, dotknij "Zatwierdź wybór". To zablokuje galerię i pozwoli
              fotografowi rozpocząć edycję.
            </p>
            <p>
              Po zatwierdzeniu nie możesz wprowadzać zmian ani kupować dodatkowych zdjęć, chyba że:
            </p>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li>poprosisz o zmiany, a fotograf je zaakceptuje, lub</li>
              <li>fotograf zakończy pracę i dostarczy zdjęcia (wtedy dodatkowe zdjęcia znów staną się dostępne, jeśli są dozwolone).</li>
            </ul>
          </div>
        );

      case "approved":
        return (
          <div className="space-y-4">
            <h2 className="text-2xl font-bold">Wybór zatwierdzony</h2>
            <p>
              Fotograf przygotowuje teraz Twoje zdjęcia — to ekscytujące!
            </p>
            <p>
              Nie możesz zmienić wyboru na tym etapie.
            </p>
            <p>
              Jeśli potrzebujesz korekt, dotknij "Poproś o zmiany" — fotograf zostanie powiadomiony i może zaakceptować lub odrzucić. Dziękujemy za cierpliwość!
            </p>
          </div>
        );

      case "changesRequested":
        return (
          <div className="space-y-4">
            <h2 className="text-2xl font-bold">Zmiany zgłoszone</h2>
            <p>
              Zgłosiłeś prośbę o zmiany — fotograf został poinformowany.
            </p>
            <p>
              Może zaakceptować (wtedy możesz edytować) lub odrzucić (prawdopodobnie dlatego, że praca jest prawie zakończona — zdjęcia już wkrótce!).
            </p>
            <p>
              Możesz wycofać prośbę w dowolnym momencie, aby fotograf mógł kontynuować bez przerw.
            </p>
          </div>
        );

      case "delivered":
        return (
          <div className="space-y-4">
            <h2 className="text-2xl font-bold">Zdjęcia dostarczone</h2>
            <p>
              Świetne wieści — Twoje zdjęcia są gotowe!
            </p>
            <p>
              Dotknij "Dostarczone zdjęcia" (lub przycisku ZIP), aby uzyskać do nich dostęp.
            </p>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li>
                <strong>Desktop:</strong> pobierz pełny plik ZIP dla wygody
              </li>
              <li>
                <strong>Poszczególne zdjęcia:</strong> użyj ikony pobierania na każdym obrazie
              </li>
            </ul>
            <p className="font-semibold text-red-600">
              Ważne: nie używaj długiego naciśnięcia / kliknięcia prawym przyciskiem → Zapisz obraz — możesz otrzymać miniaturę niskiej rozdzielczości. Zawsze używaj właściwego przycisku pobierania lub ZIP.
            </p>
            {extraPriceCents > 0 && (
              <div className="mt-4 p-4 bg-blue-50 rounded-lg">
                <p className="font-semibold">Chcesz więcej zdjęć?</p>
                <p>
                  Dotknij "Kup więcej zdjęć", aby wybrać dodatkowe ujęcia (dodatkowy koszt). Po zatwierdzeniu tworzone jest nowe zamówienie i dostarczane oddzielnie — wszystko czyste i proste.
                </p>
              </div>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100000] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 md:p-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-6">
          <h1 className="text-3xl font-bold">Pomoc</h1>
          <button
            onClick={onClose}
            className="h-11 w-11 rounded-full flex items-center justify-center bg-gray-100 hover:bg-gray-200 transition-colors touch-manipulation"
            aria-label="Zamknij"
          >
            <X className="w-6 h-6" />
          </button>
        </div>
        <div className="prose prose-sm max-w-none">{getHelpContent()}</div>
      </div>
    </div>
  );
}
