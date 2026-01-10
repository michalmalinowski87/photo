import { useState, useCallback } from "react";

import { formatApiError } from "../lib/api-service";
import { getPlan, type PlanKey } from "../lib/pricing-plans";
import { usePayGallery, useUpdateGallery } from "./mutations/useGalleryMutations";
import { useToast } from "./useToast";

interface SelectedPlan {
  planKey: PlanKey;
  priceCents: number;
}

interface UsePlanPaymentOptions {
  galleryId: string;
  onSuccess?: () => void;
  onClose?: () => void;
  mode?: "publish" | "limitExceeded";
  selectedDuration?: string;
  selectedPlanKey?: string;
}

interface RedirectInfo {
  totalAmountCents: number;
  stripeFeeCents?: number;
  checkoutUrl?: string;
}

export const usePlanPayment = ({
  galleryId,
  onSuccess,
  onClose,
  mode = "publish",
  selectedDuration,
  selectedPlanKey,
}: UsePlanPaymentOptions) => {
  const { showToast } = useToast();
  const payGalleryMutation = usePayGallery();
  const updateGalleryMutation = useUpdateGallery();
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

        // Construct redirect URL back to the current page (needed for both Stripe and wallet flows)
        const params = new URLSearchParams();
        params.set("payment", "success");
        if (mode === "limitExceeded") {
          params.set("limitExceeded", "true");
          if (selectedDuration) {
            params.set("duration", selectedDuration);
          }
          if (selectedPlanKey) {
            params.set("planKey", selectedPlanKey);
          }
        }

        const redirectUrl =
          typeof window !== "undefined"
            ? `${window.location.origin}${window.location.pathname}?${params.toString()}`
            : undefined;

        // First, call dry run to determine payment method
        const dryRunResult = await payGalleryMutation.mutateAsync({
          galleryId,
          options: {
            dryRun: true,
            plan: selectedPlan.planKey,
            priceCents: selectedPlan.priceCents,
          },
        });

        // If Stripe will be used, show redirect overlay first
        if (
          dryRunResult.paymentMethod !== "WALLET" &&
          dryRunResult.stripeAmountCents &&
          dryRunResult.stripeAmountCents > 0
        ) {
          // For upgrades (limitExceeded mode), don't update gallery plan before payment
          // The backend needs to see the current plan to detect the upgrade
          // For regular payments (publish mode), update gallery plan first
          if (mode === "publish") {
            await updateGalleryMutation.mutateAsync({
              galleryId,
              data: {
                plan: selectedPlan.planKey,
                priceCents: selectedPlan.priceCents,
                originalsLimitBytes: planMetadata.storageLimitBytes,
                finalsLimitBytes: planMetadata.storageLimitBytes,
              },
            });
          }

          // Get actual payment result
          // Pass plan and priceCents explicitly for upgrade detection
          const paymentResult = await payGalleryMutation.mutateAsync({
            galleryId,
            options: {
              plan: selectedPlan.planKey,
              priceCents: selectedPlan.priceCents,
              redirectUrl,
            },
          });

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
        // For upgrades (limitExceeded mode), don't update gallery plan before payment
        // The backend needs to see the current plan to detect the upgrade
        // For regular payments (publish mode), update gallery plan first
        if (mode === "publish") {
          await updateGalleryMutation.mutateAsync({
            galleryId,
            data: {
              plan: selectedPlan.planKey,
              priceCents: selectedPlan.priceCents,
              originalsLimitBytes: planMetadata.storageLimitBytes,
              finalsLimitBytes: planMetadata.storageLimitBytes,
            },
          });
        }

        // Now proceed to payment
        // Pass plan and priceCents explicitly for upgrade detection
        const paymentResult = await payGalleryMutation.mutateAsync({
          galleryId,
          options: {
            plan: selectedPlan.planKey,
            priceCents: selectedPlan.priceCents,
            redirectUrl,
          },
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
    [
      galleryId,
      showToast,
      onSuccess,
      onClose,
      payGalleryMutation,
      updateGalleryMutation,
      mode,
      selectedDuration,
      selectedPlanKey,
    ]
  );

  return {
    handleSelectPlan,
    isProcessing,
    showRedirectOverlay,
    redirectInfo,
    setShowRedirectOverlay,
  };
};
