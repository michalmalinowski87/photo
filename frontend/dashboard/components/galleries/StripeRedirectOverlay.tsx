import React, { useEffect } from "react";

interface StripeRedirectOverlayProps {
  isVisible: boolean;
  checkoutUrl?: string;
}

export const StripeRedirectOverlay: React.FC<StripeRedirectOverlayProps> = ({
  isVisible,
  checkoutUrl,
}) => {
  useEffect(() => {
    if (isVisible && checkoutUrl) {
      // Redirect automatically after a short delay once we have the checkout URL
      const timer = setTimeout(() => {
        window.location.href = checkoutUrl;
      }, 1000); // 1 second delay to show the notification

      return () => clearTimeout(timer);
    }
    return undefined;
  }, [isVisible, checkoutUrl]);

  // Show overlay immediately even if checkoutUrl is not yet available
  // This provides instant feedback when the button is clicked

  if (!isVisible) {
    return null;
  }

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
              Zostaniesz przekierowany do bezpiecznej strony płatności...
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
