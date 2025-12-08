import { useState, useEffect } from "react";

import { useCreateCheckout } from "../../hooks/mutations/useWalletMutations";
import { useToast } from "../../hooks/useToast";
import { formatApiError } from "../../lib/api-service";
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
  const createCheckoutMutation = useCreateCheckout();
  const [showTopUpRedirect, setShowTopUpRedirect] = useState(false);
  const [topUpCheckoutUrl, setTopUpCheckoutUrl] = useState<string | undefined>(undefined);
  const [customTopUpAmount, setCustomTopUpAmount] = useState<string>("");

  const isLoading = externalLoading || createCheckoutMutation.isPending;

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

    try {
      // Construct redirect URL back to the current page, preserving existing query parameters
      let redirectUrl = "";
      if (typeof window !== "undefined") {
        const url = new URL(window.location.href);
        // Preserve existing query parameters (e.g., publish=true&galleryId=xxx)
        url.searchParams.set("payment", "success");
        redirectUrl = url.toString();
      }

      const data = await createCheckoutMutation.mutateAsync({
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
      }
    } catch (err) {
      const errorMsg = formatApiError(err as Error);
      showToast("error", "Błąd", errorMsg);
      setShowTopUpRedirect(false);
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
                hint="Minimalna kwota doładowania to 20 PLN"
                className="flex-1"
              />
              <Button
                variant="primary"
                onClick={handleCustomTopUp}
                disabled={isLoading}
                className="h-11"
              >
                Doładuj
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Stripe Redirect Overlay */}
      <StripeRedirectOverlay isVisible={showTopUpRedirect} checkoutUrl={topUpCheckoutUrl} />
    </>
  );
};
