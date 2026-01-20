"use client";

import { X, Eye } from "lucide-react";
import { hapticFeedback } from "@/utils/hapticFeedback";

export function OwnerPreviewInfoOverlay({
  isVisible,
  onClose,
}: {
  isVisible: boolean;
  onClose: () => void;
}) {
  if (!isVisible) return null;

  return (
    <div
      className="fixed inset-0 z-[100001] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl max-w-2xl w-full p-6 md:p-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-6">
          <div className="flex items-center gap-3">
            <span className="h-11 w-11 rounded-full bg-gray-100 flex items-center justify-center">
              <Eye className="w-6 h-6 text-gray-800" />
            </span>
            <div>
              <h2 className="text-2xl font-bold">Tryb podglądu fotografa</h2>
              <p className="text-sm text-gray-600 mt-1">
                Otwierasz galerię tak, jak widzi ją klient, ale z ograniczeniami bezpieczeństwa.
              </p>
            </div>
          </div>

          <button
            onClick={() => {
              hapticFeedback("light");
              onClose();
            }}
            className="h-11 w-11 rounded-full flex items-center justify-center bg-gray-100 hover:bg-gray-200 transition-colors touch-manipulation"
            aria-label="Zamknij"
            title="Zamknij"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="space-y-5">
          <div>
            <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">
              Co jest włączone
            </h3>
            <ul className="mt-2 list-disc pl-5 text-gray-700 space-y-1">
              <li>Przeglądanie galerii i nawigacja (układy, karuzela, podgląd zdjęć).</li>
              <li>Podgląd aktualnego wyboru klienta (jeśli istnieje).</li>
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">
              Co jest wyłączone
            </h3>
            <ul className="mt-2 list-disc pl-5 text-gray-700 space-y-1">
              <li>Wylogowanie (przycisk jest widoczny, ale zablokowany w tym trybie).</li>
              <li>Pobieranie zdjęć oraz pobieranie ZIP.</li>
              <li>Wszystkie akcje na zdjęciach (np. wybieranie/odznaczanie, przyciski akcji).</li>
              <li>Akcje typu „Kup więcej” oraz inne akcje modyfikujące stan.</li>
            </ul>
          </div>

          <div className="text-sm text-gray-600">
            Ten tryb służy wyłącznie do weryfikacji dostarczanego materiału i nie powinien
            zmieniać żadnych danych po stronie klienta.
          </div>
        </div>

        <div className="flex justify-end mt-7">
          <button
            onClick={() => {
              hapticFeedback("light");
              onClose();
            }}
            className="btn-primary touch-manipulation min-h-[44px]"
            aria-label="Zamknij"
          >
            Zamknij
          </button>
        </div>
      </div>
    </div>
  );
}

