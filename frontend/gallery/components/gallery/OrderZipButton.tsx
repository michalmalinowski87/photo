"use client";

import { hapticFeedback } from "@/utils/hapticFeedback";

interface ZipStatus {
  status?: "ready" | "generating" | "not_started" | "error";
  generating?: boolean;
  ready?: boolean;
  zipExists?: boolean;
  zipSize?: number;
  error?: {
    message: string;
    attempts: number;
    canRetry: boolean;
  };
}

interface OrderZipButtonProps {
  zipStatus?: ZipStatus;
  onDownloadZip: () => void;
  disabled?: boolean;
}

export function OrderZipButton({
  zipStatus,
  onDownloadZip,
  disabled = false,
}: OrderZipButtonProps) {
  const hasError = zipStatus?.status === "error";
  const zipCtaText = hasError
    ? "BRAK PLIKU ZIP"
    : zipStatus?.ready
    ? "POBIERZ ZIP"
    : zipStatus?.generating
    ? "GENEROWANIE ZIP"
    : "PRZYGOTYWANIE ZIP";
  const zipCtaAriaLabel = hasError
    ? "Brak pliku ZIP - skontaktuj się z fotografem"
    : zipStatus?.ready
    ? "Pobierz ZIP"
    : zipStatus?.generating
    ? "Generowanie ZIP"
    : "Przygotowywanie ZIP";

  return (
    <button
      onClick={() => {
        if (!hasError && !disabled) {
          hapticFeedback('medium');
          onDownloadZip();
        }
      }}
      disabled={hasError || disabled}
      className={`relative h-[44px] py-2 px-4 uppercase text-sm transition-all touch-manipulation min-w-[44px] flex items-center justify-center whitespace-nowrap gap-2 ${
        hasError || disabled ? "cursor-not-allowed opacity-50" : ""
      }`}
      style={{
        color: hasError
          ? "#DC2626" // Red color for error state
          : "#666666",
        fontWeight: "700",
        letterSpacing: "0.05em",
      }}
      aria-label={zipCtaAriaLabel}
    >
      {hasError ? (
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      ) : (
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
          />
        </svg>
      )}
      <span>{zipCtaText}</span>
    </button>
  );
}
