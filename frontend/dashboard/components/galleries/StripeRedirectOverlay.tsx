import React from "react";

interface StripeRedirectOverlayProps {
  isVisible: boolean;
  totalAmountCents: number;
  stripeFeeCents?: number;
  onCancel?: () => void;
  onConfirm?: () => void;
}

export const StripeRedirectOverlay: React.FC<StripeRedirectOverlayProps> = ({
  isVisible,
  totalAmountCents,
  stripeFeeCents,
  onCancel,
  onConfirm,
}) => {
  if (!isVisible) {
    return null;
  }

  const formatPrice = (cents: number): string => {
    return `${(cents / 100).toFixed(2)} PLN`;
  };

  const totalWithFee = totalAmountCents + (stripeFeeCents ?? 0);

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 dark:bg-black/90 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl max-w-md w-full mx-4 p-8">
        <div className="text-center">
          <div className="mb-6">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
              <svg
                className="w-8 h-8 text-blue-600 dark:text-blue-400 animate-spin"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
              Przekierowywanie do płatności
            </h2>
            <p className="text-gray-600 dark:text-gray-400">
              Zostaniesz przekierowany do Stripe, aby dokonać płatności
            </p>
          </div>

          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 mb-6">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm text-gray-600 dark:text-gray-400">Kwota:</span>
              <span className="text-lg font-semibold text-gray-900 dark:text-white">
                {formatPrice(totalAmountCents)}
              </span>
            </div>
            {stripeFeeCents && stripeFeeCents > 0 && (
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  Opłata transakcyjna:
                </span>
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {formatPrice(stripeFeeCents)}
                </span>
              </div>
            )}
            <div className="border-t border-gray-200 dark:border-gray-700 mt-2 pt-2">
              <div className="flex justify-between items-center">
                <span className="text-sm font-semibold text-gray-900 dark:text-white">
                  Do zapłaty:
                </span>
                <span className="text-xl font-bold text-gray-900 dark:text-white">
                  {formatPrice(totalWithFee)}
                </span>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-center gap-2 text-sm text-gray-600 dark:text-gray-400">
              <svg
                className="w-5 h-5 text-blue-600 dark:text-blue-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                />
              </svg>
              <span>Płatność jest bezpieczna i szyfrowana</span>
            </div>

            <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
              <div className="flex gap-3">
                {onCancel && (
                  <button
                    onClick={onCancel}
                    className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors border border-gray-300 dark:border-gray-600 rounded-lg"
                  >
                    Anuluj
                  </button>
                )}
                {onConfirm && (
                  <button
                    onClick={onConfirm}
                    className="flex-1 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700 rounded-lg transition-colors"
                  >
                    Przejdź do płatności
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

