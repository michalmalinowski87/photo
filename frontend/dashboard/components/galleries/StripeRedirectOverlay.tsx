import { Loader2 } from "lucide-react";
import React, { useEffect } from "react";
import { createPortal } from "react-dom";

interface StripeRedirectOverlayProps {
  isVisible: boolean;
  checkoutUrl?: string;
}

export const StripeRedirectOverlay = ({ isVisible, checkoutUrl }: StripeRedirectOverlayProps) => {
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

  const overlayContent = (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 dark:bg-black/90 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl max-w-md w-full mx-4 p-8">
        <div className="text-center">
          <div className="mb-6">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-photographer-elevated dark:bg-photographer-accentDark/30 flex items-center justify-center">
              <Loader2
                className="w-8 h-8 text-photographer-accent dark:text-photographer-accentLight animate-spin"
                strokeWidth={2}
              />
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

  // Render overlay via portal to document.body to ensure it's above all other content
  if (typeof window !== "undefined") {
    return createPortal(overlayContent, document.body);
  }

  return overlayContent;
};
