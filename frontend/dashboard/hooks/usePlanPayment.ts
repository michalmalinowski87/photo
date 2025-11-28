import { useState, useCallback } from "react";

import { useToast } from "./useToast";
import api, { formatApiError } from "../lib/api-service";
import { getPlan, type PlanKey } from "../lib/pricing-plans";

interface SelectedPlan {
  planKey: PlanKey;
  priceCents: number;
}

interface UsePlanPaymentOptions {
  galleryId: string;
  onSuccess?: () => void;
  onClose?: () => void;
}

interface RedirectInfo {
  totalAmountCents: number;
  stripeFeeCents?: number;
  checkoutUrl?: string;
}

export const usePlanPayment = ({ galleryId, onSuccess, onClose }: UsePlanPaymentOptions) => {
  const { showToast } = useToast();
  const [isProcessing, setIsProcessing] = useState(false);
  const [showRedirectOverlay, setShowRedirectOverlay] = useState(false);
  const [redirectInfo, setRedirectInfo] = useState<RedirectInfo | null>(null);

  const handleSelectPlan = useCallback(
    async (selectedPlan: SelectedPlan | null) => {
      if (!selectedPlan) {
        showToast("error", "Błąd", "Proszę wybrać plan.");
        return;
      }

      setIsProcessing(true);
      try {
        const planMetadata = getPlan(selectedPlan.planKey);
        if (!planMetadata) {
          showToast("error", "Błąd", "Nieprawidłowy plan.");
          setIsProcessing(false);
          return;
        }

        // First, call dry run to determine payment method
        const dryRunResult = await api.galleries.pay(galleryId, {
          dryRun: true,
          plan: selectedPlan.planKey,
          priceCents: selectedPlan.priceCents,
        });

        // If Stripe will be used, show redirect overlay first
        if (
          dryRunResult.paymentMethod !== "WALLET" &&
          dryRunResult.stripeAmountCents &&
          dryRunResult.stripeAmountCents > 0
        ) {
          // Update gallery first
          await api.galleries.update(galleryId, {
            plan: selectedPlan.planKey,
            priceCents: selectedPlan.priceCents,
            originalsLimitBytes: planMetadata.storageLimitBytes,
            finalsLimitBytes: planMetadata.storageLimitBytes,
          });

          // Get actual payment result
          const paymentResult = await api.galleries.pay(galleryId, {});

          if (paymentResult.checkoutUrl) {
            setRedirectInfo({
              totalAmountCents: paymentResult.totalAmountCents ?? selectedPlan.priceCents,
              stripeFeeCents: paymentResult.stripeFeeCents,
              checkoutUrl: paymentResult.checkoutUrl,
            });
            setShowRedirectOverlay(true);
            setIsProcessing(false);
            return;
          }
        }

        // If wallet payment, proceed directly
        // First, update gallery with the selected plan details
        await api.galleries.update(galleryId, {
          plan: selectedPlan.planKey,
          priceCents: selectedPlan.priceCents,
          originalsLimitBytes: planMetadata.storageLimitBytes,
          finalsLimitBytes: planMetadata.storageLimitBytes,
        });

        // Construct redirect URL back to the current page
        const redirectUrl =
          typeof window !== "undefined"
            ? `${window.location.origin}${window.location.pathname}?payment=success`
            : undefined;

        // Now proceed to payment
        const paymentResult = await api.galleries.pay(galleryId, {
          redirectUrl,
        });

        if (paymentResult.checkoutUrl) {
          // This shouldn't happen if dry run said wallet, but handle it
          setRedirectInfo({
            totalAmountCents: paymentResult.totalAmountCents ?? selectedPlan.priceCents,
            stripeFeeCents: paymentResult.stripeFeeCents,
            checkoutUrl: paymentResult.checkoutUrl,
          });
          setShowRedirectOverlay(true);
        } else if (paymentResult.paid) {
          // Already paid or paid via wallet
          showToast("success", "Sukces", "Plan został wybrany i opłacony!");
          onSuccess?.();
          onClose?.();
        } else {
          showToast("error", "Błąd", "Nie udało się przetworzyć płatności.");
        }
      } catch (error: unknown) {
        showToast("error", "Błąd", formatApiError(error as Error));
      } finally {
        setIsProcessing(false);
      }
    },
    [galleryId, showToast, onSuccess, onClose]
  );

  return {
    handleSelectPlan,
    isProcessing,
    showRedirectOverlay,
    redirectInfo,
    setShowRedirectOverlay,
  };
};

