import { useState, useEffect } from "react";

import { useToast } from "../../hooks/useToast";
import api, { formatApiError } from "../../lib/api-service";
import { formatCurrencyInput } from "../../lib/currency";
import { StripeRedirectOverlay } from "../galleries/StripeRedirectOverlay";
import Button from "../ui/button/Button";
import Input from "../ui/input/InputField";

interface WalletTopUpSectionProps {
  onTopUp?: () => void; // Optional callback after successful topup initiation
  isLoading?: boolean; // External loading state (optional)
  quickAmounts?: number[]; // Quick amount buttons in cents (default: [2000, 5000, 10000])
  showCustomInput?: boolean; // Show custom amount input (default: false)
  className?: string; // Optional className for container
}

export const WalletTopUpSection: React.FC<WalletTopUpSectionProps> = ({
  onTopUp,
  isLoading: externalLoading = false,
  quickAmounts = [2000, 5000, 10000], // Default: 20, 50, 100 PLN
  showCustomInput = false,
  className = "",
}) => {
  const { showToast } = useToast();
  const [isTopUpLoading, setIsTopUpLoading] = useState(false);
  const [showTopUpRedirect, setShowTopUpRedirect] = useState(false);
  const [topUpCheckoutUrl, setTopUpCheckoutUrl] = useState<string | undefined>(undefined);
  const [customTopUpAmount, setCustomTopUpAmount] = useState<string>("");

  const isLoading = externalLoading || isTopUpLoading;

  // Handle payment success redirect
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("payment") === "success") {
        showToast("success", "Sukces", "Portfel został doładowany pomyślnie");
        // Clear the payment success parameter from URL
        window.history.replaceState({}, "", window.location.pathname);
        // Call optional callback
        onTopUp?.();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleTopUp = async (amountCents: number): Promise<void> => {
    if (amountCents < 2000) {
      const errorMsg = "Minimalna kwota doładowania to 20 PLN";
      showToast("error", "Błąd", errorMsg);
      return;
    }

    // Show redirect overlay IMMEDIATELY when button is clicked
    setShowTopUpRedirect(true);
    setIsTopUpLoading(true);

    try {
      // Construct redirect URL back to the current page
      const redirectUrl =
        typeof window !== "undefined"
          ? `${window.location.origin}${window.location.pathname}?payment=success`
          : "";

      const data = await api.payments.createCheckout({
        amountCents,
        type: "wallet_topup",
        redirectUrl,
      });

      if (data.checkoutUrl) {
        // Update checkout URL once we receive it
        setTopUpCheckoutUrl(data.checkoutUrl);
      } else {
        const errorMsg = "Nie otrzymano URL do płatności";
        showToast("error", "Błąd", errorMsg);
        setShowTopUpRedirect(false);
        setIsTopUpLoading(false);
      }
    } catch (err) {
      const errorMsg = formatApiError(err as Error);
      showToast("error", "Błąd", errorMsg);
      setShowTopUpRedirect(false);
      setIsTopUpLoading(false);
    }
  };

  const handleCustomTopUp = (): void => {
    const amount = parseFloat(customTopUpAmount);
    if (isNaN(amount) || amount < 20) {
      showToast("error", "Błąd", "Minimalna kwota doładowania to 20 PLN");
      return;
    }
    void handleTopUp(Math.round(amount * 100));
  };

  return (
    <>
      <div className={className}>
        {quickAmounts.length > 0 && (
          <div className="mb-4">
            <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Szybkie doładowanie:
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {quickAmounts.map((amountCents) => (
                <Button
                  key={amountCents}
                  size="sm"
                  variant="primary"
                  onClick={() => handleTopUp(amountCents)}
                  disabled={isLoading}
                >
                  +{amountCents / 100} PLN
                </Button>
              ))}
            </div>
          </div>
        )}

        {showCustomInput && (
          <div>
            <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Własna kwota
            </div>
            <div className="flex gap-2">
              <Input
                type="text"
                placeholder="Kwota (min 20 PLN)"
                value={customTopUpAmount}
                onChange={(e) => {
                  const formatted = formatCurrencyInput(e.target.value);
                  setCustomTopUpAmount(formatted);
                }}
                className="flex-1"
              />
              <Button variant="primary" onClick={handleCustomTopUp} disabled={isLoading}>
                Doładuj
              </Button>
            </div>
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
              Minimalna kwota doładowania: 20 PLN
            </p>
          </div>
        )}
      </div>

      {/* Stripe Redirect Overlay */}
      <StripeRedirectOverlay isVisible={showTopUpRedirect} checkoutUrl={topUpCheckoutUrl} />
    </>
  );
};
