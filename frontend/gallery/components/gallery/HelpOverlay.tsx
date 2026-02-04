"use client";

import { X } from "lucide-react";
import { hapticFeedback } from "@/utils/hapticFeedback";
import type { SelectionState } from "@/types/gallery";
import { PostHogActions } from "@photocloud/posthog-types";

interface HelpOverlayProps {
  isVisible: boolean;
  onClose: () => void;
  selectionState?: SelectionState | null;
}

export function HelpOverlay({ isVisible, onClose, selectionState }: HelpOverlayProps) {
  // TODO: Add PostHog tracking for helpOverlayOpen when PostHog is installed
  // useEffect(() => {
  //   if (isVisible) {
  //     posthog.capture('gallery_app:help_overlay_open');
  //   }
  // }, [isVisible]);
  
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
              Wybierz zdjęcia, które chcesz, klikajac ikonę + (co najmniej tyle,
              ile jest zawartych w Twoim pakiecie — zobacz licznik u góry).
            </p>
            {extraPriceCents > 0 && (
              <p>
                Możesz wybrać więcej zdjęć — każde dodatkowe kosztuje {extraPrice}.
              </p>
            )}
            <p>
              Gdy będziesz zadowolony z wyboru, kliknij "Zatwierdź wybór". To zablokuje galerię i pozwoli
              fotografowi rozpocząć edycję.
            </p>
            <p>
              Po zatwierdzeniu nie możesz wprowadzać zmian ani kupować dodatkowych zdjęć, chyba że:
            </p>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li>poprosisz o zmiany, a fotograf je zaakceptuje, lub</li>
              <li>fotograf zakończy pracę i dostarczy zdjęcia (wtedy dodatkowe, nie wybrane zdjęcia, znów staną się dostępne, jeśli fotograf zezwala na zakup dodatkowych zdjęć).</li>
            </ul>
          </div>
        );

      case "approved":
        return (
          <div className="space-y-4">
            <h2 className="text-2xl font-bold">Wybór zatwierdzony</h2>
            <p>
              Fotograf przygotowuje teraz Twoje zdjęcia!
            </p>
            <p>
              Nie możesz zmienić wyboru na tym etapie.
            </p>
            <p>
              Jeśli potrzebujesz korekt, kliknij "Poproś o zmiany" — fotograf zostanie powiadomiony i może zaakceptować lub odrzucić prośbę.
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
              Może zaakceptować (wtedy możesz edytować) lub odrzucić (prawdopodobnie dlatego, że praca jest prawie zakończona).
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
              Kliknij "Dostarczone zdjęcia", aby uzyskać do nich dostęp.
            </p>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li>
                <strong>Desktop:</strong> pobierz pełny plik ZIP dla wygody
              </li>
              <li>
                <strong>Poszczególne zdjęcia:</strong> użyj ikony pobierania na każdym obrazie aby pobrać zdjęcie
              </li>
            </ul>
            <p className="font-semibold text-red-600">
              Ważne: nie używaj długiego naciśnięcia / kliknięcia prawym przyciskiem → Zapisz obraz — możesz otrzymać miniaturę niskiej rozdzielczości. Zawsze używaj właściwego przycisku pobierania lub ZIP.
            </p>
            {extraPriceCents > 0 && (
              <div className="mt-4 p-4 bg-blue-50 rounded-lg">
                <p className="font-semibold">Chcesz więcej zdjęć?</p>
                <p>
                  Kliknij "Kup więcej zdjęć", aby wybrać dodatkowe ujęcia (dodatkowy koszt). Po zatwierdzeniu utworzone będzie nowe zamówienie i dostarczane oddzielnie.
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
        {/* Match confirmation modal layout: stage header + divider, no extra "Pomoc" header */}
        <div className="mb-6">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-2xl font-bold text-gray-900">
              {state === "selecting"
                ? "Wybór zdjęć"
                : state === "approved"
                ? "Wybór zatwierdzony"
                : state === "changesRequested"
                ? "Zmiany zgłoszone"
                : "Zdjęcia dostarczone"}
            </h2>
            {/* Keep small X for convenience, but the primary CTA is the OK button */}
            <button
              onClick={() => {
                // TODO: Add PostHog tracking for helpOverlayClose when PostHog is installed
                // posthog.capture('gallery_app:help_overlay_close');
                onClose();
              }}
              className="h-11 w-11 rounded transition-colors flex items-center justify-center border-0 touch-manipulation bg-transparent text-gray-400 hover:text-gray-600"
              aria-label="Zamknij"
              title="Zamknij"
              data-ph-action={PostHogActions.galleryApp.helpOverlayClose}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="mt-4 h-px w-full bg-gray-200" />
        </div>

        {/* Content (without internal per-state H2 headers) */}
        <div className="prose prose-sm max-w-none">
          {(() => {
            const content = getHelpContent();
            // getHelpContent currently includes its own H2; hide it visually to avoid double headers.
            return <div className="[&>div>h2]:hidden">{content}</div>;
          })()}
        </div>

        <div className="mt-8 flex justify-end">
            <button
              onClick={() => {
                hapticFeedback("light");
                // TODO: Add PostHog tracking for helpOverlayClose when PostHog is installed
                // posthog.capture('gallery_app:help_overlay_close');
                onClose();
              }}
              className="btn-primary touch-manipulation min-h-[44px]"
              aria-label="OK"
              data-ph-action={PostHogActions.galleryApp.helpOverlayClose}
            >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
