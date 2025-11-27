import Link from "next/link";
import { useRouter } from "next/router";
import React, { useState, useEffect, useRef } from "react";

import { useToast } from "../../hooks/useToast";
import api, { formatApiError } from "../../lib/api-service";
import { getPlanRecommendation, getPricingModalData } from "../../lib/calculate-plan";
import { formatPrice } from "../../lib/format-price";
import type { PlanRecommendation, PricingModalData } from "../../lib/plan-types";
import {
  getPlanByStorageAndDuration,
  calculatePriceWithDiscount,
  getPlan,
  type Duration,
} from "../../lib/pricing-plans";

import { GalleryPricingModal } from "./GalleryPricingModal";

interface Gallery {
  state?: string;
  paymentStatus?: string;
  plan?: string;
  priceCents?: number;
  originalsLimitBytes?: number;
  finalsLimitBytes?: number;
  originalsBytesUsed?: number;
  finalsBytesUsed?: number;
  selectionEnabled?: boolean;
  [key: string]: unknown;
}

interface PaymentGuidanceBannerProps {
  galleryId: string;
  gallery: Gallery;
  onPaymentComplete?: () => void;
}

export const PaymentGuidanceBanner: React.FC<PaymentGuidanceBannerProps> = ({
  galleryId,
  gallery,
  onPaymentComplete,
}) => {
  const router = useRouter();
  const { showToast } = useToast();

  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [pricingModalData, setPricingModalData] = useState<PricingModalData | null>(null);
  const [uploadedSizeBytes, setUploadedSizeBytes] = useState<number | null>(null);
  const [planRecommendation, setPlanRecommendation] = useState<PlanRecommendation | null>(null);
  const [isLoadingPlanRecommendation, setIsLoadingPlanRecommendation] = useState(false);
  const [selectedDuration, setSelectedDuration] = useState<Duration | null>(null);
  const [paymentMethodInfo, setPaymentMethodInfo] = useState<{
    paymentMethod?: 'WALLET' | 'STRIPE' | 'MIXED';
    walletAmountCents?: number;
    stripeAmountCents?: number;
    stripeFeeCents?: number;
    totalAmountCents?: number;
  } | null>(null);
  const prevSelectedDurationRef = useRef<Duration | null>(null);
  const prevGalleryIdRef = useRef<string | null>(null);
  const lastDryRunParamsRef = useRef<{ planKey: string; priceCents: number } | null>(null);

  // Check if gallery needs payment
  const needsPayment = gallery.state === "DRAFT" || gallery.paymentStatus === "UNPAID";

  // Listen for gallery updates (e.g., after uploads) to refresh data
  useEffect(() => {
    if (!needsPayment || !galleryId) {
      // Clear recommendation when not needed to prevent flicker
      setPlanRecommendation(null);
      setUploadedSizeBytes(null);
      setIsLoadingPlanRecommendation(false);
      return;
    }

    // Don't clear recommendation if only duration changed (not galleryId or other props)
    // This prevents the component from disappearing when only duration changes
    const onlyDurationChanged = 
      prevGalleryIdRef.current === galleryId && 
      prevSelectedDurationRef.current !== selectedDuration &&
      planRecommendation !== null;
    
    // If only duration changed, skip the API call - just update the recommendation in place
    if (onlyDurationChanged) {
      // Update refs
      prevGalleryIdRef.current = galleryId;
      prevSelectedDurationRef.current = selectedDuration;
      // Don't fetch from API, just update the existing recommendation with new duration
      if (planRecommendation) {
        const storageMatch = planRecommendation.suggestedPlan.name.match(/^(\d+GB)/);
        const storage = (storageMatch ? storageMatch[1] : "1GB") as "1GB" | "3GB" | "10GB";
        const currentDuration = selectedDuration ?? "1m";
        const planKey = getPlanByStorageAndDuration(storage, currentDuration);
        if (planKey) {
          const plan = getPlan(planKey);
          if (plan) {
            setPlanRecommendation((prev) => {
              if (!prev) {
                return prev;
              }
              return {
                ...prev,
                suggestedPlan: {
                  ...prev.suggestedPlan,
                  planKey,
                  name: plan.label,
                  priceCents: calculatePriceWithDiscount(planKey, gallery.selectionEnabled !== false),
                  duration: plan.duration,
                },
                originalsLimitBytes: plan.storageLimitBytes,
                finalsLimitBytes: plan.storageLimitBytes,
              };
            });
          }
        }
      }
      return; // Skip the API call when only duration changed
    }
    
    if (!onlyDurationChanged) {
      setPlanRecommendation(null);
    }
    
    // Update refs
    prevGalleryIdRef.current = galleryId;
    prevSelectedDurationRef.current = selectedDuration;

    let requestCounter = 0;

    const handleGalleryUpdate = async () => {

      // Increment counter to track the latest request
      requestCounter += 1;
      const currentRequest = requestCounter;

      // Refresh uploaded size and plan recommendation when gallery is updated
      // Only show loading if we don't have a recommendation yet (to prevent flicker when only duration changes)
      // When only duration changes, we don't need to reload the recommendation from API
      if (!planRecommendation) {
        setIsLoadingPlanRecommendation(true);
      }
      try {
        const recommendation = await getPlanRecommendation(galleryId);
        
        // Only update if this is still the latest request (prevent stale data from race conditions)
        if (currentRequest !== requestCounter) {
          return;
        }
        
        const size = recommendation.uploadedSizeBytes || 0;
        setUploadedSizeBytes(size);

        // If photos are uploaded, store plan recommendation with selected duration
        if (size > 0 && recommendation) {
          // Extract initial duration from suggested plan if not already set
          const currentDuration =
            selectedDuration ??
            (() => {
              const suggestedDuration = recommendation.suggestedPlan.name.includes("12")
                ? "12m"
                : recommendation.suggestedPlan.name.includes("3")
                  ? "3m"
                  : "1m";
              setSelectedDuration(suggestedDuration as Duration);
              return suggestedDuration as Duration;
            })();

          const storageMatch = recommendation.suggestedPlan.name.match(/^(\d+GB)/);
          const storage = (storageMatch ? storageMatch[1] : "1GB") as "1GB" | "3GB" | "10GB";
          const planKey = getPlanByStorageAndDuration(storage, currentDuration);
          if (planKey) {
            const plan = getPlan(planKey);
            if (plan) {
              // Update existing recommendation in place if it exists, otherwise create new one
              setPlanRecommendation((prev) => {
                const updated = {
                  ...recommendation,
                  suggestedPlan: {
                    ...recommendation.suggestedPlan,
                    planKey,
                    name: plan.label,
                    priceCents: calculatePriceWithDiscount(planKey, gallery.selectionEnabled !== false),
                    duration: plan.duration,
                  },
                  originalsLimitBytes: plan.storageLimitBytes,
                  finalsLimitBytes: plan.storageLimitBytes,
                };
                // Preserve uploadedSizeBytes and usagePercentage from previous recommendation if available
                if (prev) {
                  updated.uploadedSizeBytes = prev.uploadedSizeBytes ?? recommendation.uploadedSizeBytes;
                  updated.usagePercentage = prev.usagePercentage ?? recommendation.usagePercentage;
                  updated.isNearCapacity = prev.isNearCapacity ?? recommendation.isNearCapacity;
                }
                return updated;
              });
            } else {
              setPlanRecommendation(recommendation);
            }
          } else {
            setPlanRecommendation(recommendation);
          }
        } else {
          // No photos uploaded - clear recommendation
          setPlanRecommendation(null);
          setUploadedSizeBytes(0);
        }
      } catch (error) {
        // Only update on error if this is still the latest request
        if (currentRequest === requestCounter) {
          console.error("Failed to refresh plan recommendation:", error);
          setPlanRecommendation(null);
          setUploadedSizeBytes(0);
        }
      } finally {
        // Only update loading state if this is still the latest request
        if (currentRequest === requestCounter) {
          setIsLoadingPlanRecommendation(false);
        }
      }
    };

    if (typeof window !== "undefined") {
      window.addEventListener("galleryUpdated", handleGalleryUpdate);
      return () => {
        window.removeEventListener("galleryUpdated", handleGalleryUpdate);
        // Invalidate any pending requests
        requestCounter += 1;
      };
    }
    return undefined;
    // Note: selectedDuration is NOT in dependencies - we handle duration changes separately
    // to avoid refetching plan recommendation when only duration changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [galleryId, needsPayment, gallery.selectionEnabled]);

  // Also refresh when gallery prop changes (in case event didn't fire or was missed)
  // This ensures we update even if the event wasn't dispatched
  useEffect(() => {
    if (!needsPayment || !galleryId) {
      // Clear recommendation when not needed to prevent flicker
      setPlanRecommendation(null);
      setUploadedSizeBytes(null);
      setIsLoadingPlanRecommendation(false);
      return;
    }

    // Don't clear recommendation if only duration changed (not galleryId or other props)
    // This prevents the component from disappearing when only duration changes
    const onlyDurationChanged = 
      prevGalleryIdRef.current === galleryId && 
      prevSelectedDurationRef.current !== selectedDuration &&
      planRecommendation !== null;
    
    // If only duration changed, skip the API call - just update the recommendation in place
    if (onlyDurationChanged) {
      // Update refs
      prevGalleryIdRef.current = galleryId;
      prevSelectedDurationRef.current = selectedDuration;
      // Don't fetch from API, just update the existing recommendation with new duration
      if (planRecommendation) {
        const storageMatch = planRecommendation.suggestedPlan.name.match(/^(\d+GB)/);
        const storage = (storageMatch ? storageMatch[1] : "1GB") as "1GB" | "3GB" | "10GB";
        const currentDuration = selectedDuration ?? "1m";
        const planKey = getPlanByStorageAndDuration(storage, currentDuration);
        if (planKey) {
          const plan = getPlan(planKey);
          if (plan) {
            setPlanRecommendation((prev) => {
              if (!prev) {
                return prev;
              }
              return {
                ...prev,
                suggestedPlan: {
                  ...prev.suggestedPlan,
                  planKey,
                  name: plan.label,
                  priceCents: calculatePriceWithDiscount(planKey, gallery.selectionEnabled !== false),
                  duration: plan.duration,
                },
                originalsLimitBytes: plan.storageLimitBytes,
                finalsLimitBytes: plan.storageLimitBytes,
              };
            });
          }
        }
      }
      return; // Skip the API call when only duration changed
    }
    
    if (!onlyDurationChanged) {
      setPlanRecommendation(null);
    }
    
    // Update refs
    prevGalleryIdRef.current = galleryId;
    prevSelectedDurationRef.current = selectedDuration;

    // If gallery shows 0 bytes, immediately clear recommendation (optimistic update)
    const currentBytes = gallery.originalsBytesUsed;
    if (currentBytes === 0 || currentBytes === undefined) {
      setUploadedSizeBytes(0);
      setPlanRecommendation(null);
      setIsLoadingPlanRecommendation(false);
      return;
    }

    let isCancelled = false;

    const refreshData = async () => {
      if (isCancelled) {
        return;
      }
      
      // Only show loading if we don't have a recommendation yet
      // If we have one, we're just updating it, so don't show loading
      if (!planRecommendation) {
        setIsLoadingPlanRecommendation(true);
      }
      try {
        const recommendation = await getPlanRecommendation(galleryId);
        
        // Only update if this effect hasn't been cancelled
        if (isCancelled) {
          return;
        }
        
        const size = recommendation.uploadedSizeBytes || 0;
        setUploadedSizeBytes(size);

        if (size > 0 && recommendation) {
          const currentDuration =
            selectedDuration ??
            (() => {
              const suggestedDuration = recommendation.suggestedPlan.name.includes("12")
                ? "12m"
                : recommendation.suggestedPlan.name.includes("3")
                  ? "3m"
                  : "1m";
              setSelectedDuration(suggestedDuration as Duration);
              return suggestedDuration as Duration;
            })();

          const storageMatch = recommendation.suggestedPlan.name.match(/^(\d+GB)/);
          const storage = (storageMatch ? storageMatch[1] : "1GB") as "1GB" | "3GB" | "10GB";
          const planKey = getPlanByStorageAndDuration(storage, currentDuration);
          if (planKey) {
            const plan = getPlan(planKey);
            if (plan) {
              // Update existing recommendation in place if it exists, otherwise create new one
              setPlanRecommendation((prev) => {
                const updated = {
                  ...recommendation,
                  suggestedPlan: {
                    ...recommendation.suggestedPlan,
                    planKey,
                    name: plan.label,
                    priceCents: calculatePriceWithDiscount(planKey, gallery.selectionEnabled !== false),
                    duration: plan.duration,
                  },
                  originalsLimitBytes: plan.storageLimitBytes,
                  finalsLimitBytes: plan.storageLimitBytes,
                };
                // Preserve uploadedSizeBytes and usagePercentage from previous recommendation if available
                if (prev) {
                  updated.uploadedSizeBytes = prev.uploadedSizeBytes ?? recommendation.uploadedSizeBytes;
                  updated.usagePercentage = prev.usagePercentage ?? recommendation.usagePercentage;
                  updated.isNearCapacity = prev.isNearCapacity ?? recommendation.isNearCapacity;
                }
                return updated;
              });
            } else {
              setPlanRecommendation(recommendation);
            }
          } else {
            setPlanRecommendation(recommendation);
          }
        } else {
          setPlanRecommendation(null);
        }
      } catch (error) {
        if (isCancelled) {
          return;
        }
        console.error("Failed to refresh data:", error);
      } finally {
        if (!isCancelled) {
          setIsLoadingPlanRecommendation(false);
        }
      }
    };

    // Debounce to avoid too many API calls, but use shorter delay for better UX
    const timeoutId = setTimeout(() => {
      void refreshData();
    }, 200); // Reduced from 300ms to 200ms for faster updates

    return () => {
      isCancelled = true;
      clearTimeout(timeoutId);
    };
    // Note: selectedDuration is NOT in dependencies - we handle duration changes separately
    // to avoid refetching plan recommendation when only duration changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [galleryId, gallery.originalsBytesUsed, needsPayment, gallery.selectionEnabled]);

  // Load uploaded size and plan recommendation if photos are uploaded
  useEffect(() => {
    if (!needsPayment) {
      // Clear recommendation when not needed to prevent flicker
      setPlanRecommendation(null);
      setUploadedSizeBytes(null);
      setIsLoadingPlanRecommendation(false);
      return;
    }

    // Don't clear recommendation if only duration changed (not galleryId or other props)
    // This prevents the component from disappearing when only duration changes
    const onlyDurationChanged = 
      prevGalleryIdRef.current === galleryId && 
      prevSelectedDurationRef.current !== selectedDuration &&
      planRecommendation !== null;
    
    // If only duration changed, skip the API call - just update the recommendation in place
    if (onlyDurationChanged) {
      // Update refs
      prevGalleryIdRef.current = galleryId;
      prevSelectedDurationRef.current = selectedDuration;
      // Don't fetch from API, just update the existing recommendation with new duration
      if (planRecommendation) {
        const storageMatch = planRecommendation.suggestedPlan.name.match(/^(\d+GB)/);
        const storage = (storageMatch ? storageMatch[1] : "1GB") as "1GB" | "3GB" | "10GB";
        const currentDuration = selectedDuration ?? "1m";
        const planKey = getPlanByStorageAndDuration(storage, currentDuration);
        if (planKey) {
          const plan = getPlan(planKey);
          if (plan) {
            setPlanRecommendation((prev) => {
              if (!prev) {
                return prev;
              }
              return {
                ...prev,
                suggestedPlan: {
                  ...prev.suggestedPlan,
                  planKey,
                  name: plan.label,
                  priceCents: calculatePriceWithDiscount(planKey, gallery.selectionEnabled !== false),
                  duration: plan.duration,
                },
                originalsLimitBytes: plan.storageLimitBytes,
                finalsLimitBytes: plan.storageLimitBytes,
              };
            });
          }
        }
      }
      return; // Skip the API call when only duration changed
    }
    
    if (!onlyDurationChanged) {
      setPlanRecommendation(null);
    }
    
    // Update refs
    prevGalleryIdRef.current = galleryId;
    prevSelectedDurationRef.current = selectedDuration;

    const loadUploadedSizeAndPlan = async () => {

      // Always fetch from API to get the latest data, regardless of gallery prop
      // This ensures we have the most up-to-date information even if gallery prop hasn't updated yet
      // Only show loading if we don't have a recommendation yet (to prevent flicker when only duration changes)
      if (!planRecommendation) {
        setIsLoadingPlanRecommendation(true);
      }
      try {
        const recommendation = await getPlanRecommendation(galleryId);
        const size = recommendation.uploadedSizeBytes || 0;
        setUploadedSizeBytes(size);

        // If photos are uploaded, store plan recommendation with selected duration
        if (size > 0 && recommendation) {
          // Extract initial duration from suggested plan if not already set
          const currentDuration =
            selectedDuration ??
            (() => {
              const suggestedDuration = recommendation.suggestedPlan.name.includes("12")
                ? "12m"
                : recommendation.suggestedPlan.name.includes("3")
                  ? "3m"
                  : "1m";
              setSelectedDuration(suggestedDuration as Duration);
              return suggestedDuration as Duration;
            })();

          const storageMatch = recommendation.suggestedPlan.name.match(/^(\d+GB)/);
          const storage = (storageMatch ? storageMatch[1] : "1GB") as "1GB" | "3GB" | "10GB";
          const planKey = getPlanByStorageAndDuration(storage, currentDuration);
          if (planKey) {
            const plan = getPlan(planKey);
            if (plan) {
              // Update existing recommendation in place if it exists, otherwise create new one
              setPlanRecommendation((prev) => {
                const updated = {
                  ...recommendation,
                  suggestedPlan: {
                    ...recommendation.suggestedPlan,
                    planKey,
                    name: plan.label,
                    priceCents: calculatePriceWithDiscount(planKey, gallery.selectionEnabled !== false),
                    duration: plan.duration,
                  },
                  originalsLimitBytes: plan.storageLimitBytes,
                  finalsLimitBytes: plan.storageLimitBytes,
                };
                // Preserve uploadedSizeBytes and usagePercentage from previous recommendation if available
                if (prev) {
                  updated.uploadedSizeBytes = prev.uploadedSizeBytes ?? recommendation.uploadedSizeBytes;
                  updated.usagePercentage = prev.usagePercentage ?? recommendation.usagePercentage;
                  updated.isNearCapacity = prev.isNearCapacity ?? recommendation.isNearCapacity;
                }
                return updated;
              });
            } else {
              setPlanRecommendation(recommendation);
            }
          } else {
            setPlanRecommendation(recommendation);
          }
        } else {
          // No photos uploaded - clear recommendation
          setPlanRecommendation(null);
          setUploadedSizeBytes(0);
        }
      } catch (error: unknown) {
        console.error("Failed to load uploaded size:", error);
        setPlanRecommendation(null);
        setUploadedSizeBytes(0);
      } finally {
        setIsLoadingPlanRecommendation(false);
      }
    };

    void loadUploadedSizeAndPlan();
    // Note: selectedDuration is NOT in dependencies - we handle duration changes separately
    // to avoid refetching plan recommendation when only duration changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    galleryId,
    gallery.originalsBytesUsed,
    needsPayment,
    gallery.selectionEnabled,
  ]);

  // Separate useEffect to handle duration changes without calling API
  // This prevents flickering when user changes duration
  useEffect(() => {
    if (!planRecommendation || !selectedDuration) {
      return;
    }

    // Update the recommendation in place with new duration
    const storageMatch = planRecommendation.suggestedPlan.name.match(/^(\d+GB)/);
    const storage = (storageMatch ? storageMatch[1] : "1GB") as "1GB" | "3GB" | "10GB";
    const currentDuration = selectedDuration ?? "1m";
    const planKey = getPlanByStorageAndDuration(storage, currentDuration);
    if (planKey) {
      const plan = getPlan(planKey);
      if (plan) {
        setPlanRecommendation((prev) => {
          if (!prev) {
            return prev;
          }
          return {
            ...prev,
            suggestedPlan: {
              ...prev.suggestedPlan,
              planKey,
              name: plan.label,
              priceCents: calculatePriceWithDiscount(planKey, gallery.selectionEnabled !== false),
              duration: plan.duration,
            },
            originalsLimitBytes: plan.storageLimitBytes,
            finalsLimitBytes: plan.storageLimitBytes,
          };
        });
      }
    }
  }, [selectedDuration, planRecommendation, gallery.selectionEnabled]);

  // Call dry run to determine payment method when plan recommendation is available
  useEffect(() => {
    if (!needsPayment || !galleryId || !planRecommendation || isLoadingPlanRecommendation) {
      // Don't clear paymentMethodInfo to prevent flickering - keep the last value
      lastDryRunParamsRef.current = null;
      return;
    }

    const callDryRun = async () => {
      // Get plan key for selected duration
      const storageMatch = planRecommendation.suggestedPlan.name.match(/^(\d+GB)/);
      const storage = (storageMatch ? storageMatch[1] : "1GB") as "1GB" | "3GB" | "10GB";
      const currentDuration = selectedDuration ?? "1m";
      const planKey = getPlanByStorageAndDuration(storage, currentDuration);
      
      if (!planKey) {
        // Don't clear paymentMethodInfo to prevent flickering
        lastDryRunParamsRef.current = null;
        return;
      }

      const plan = getPlan(planKey);
      if (!plan) {
        // Don't clear paymentMethodInfo to prevent flickering
        lastDryRunParamsRef.current = null;
        return;
      }

      const priceCents = calculatePriceWithDiscount(planKey, gallery.selectionEnabled !== false);

      // Skip API call if we already called it with the same parameters
      if (
        lastDryRunParamsRef.current &&
        lastDryRunParamsRef.current.planKey === planKey &&
        lastDryRunParamsRef.current.priceCents === priceCents
      ) {
        return; // Already have the data for these parameters
      }

      // Don't set loading state - API is fast and we want to avoid flickering
      try {
        // Call dry run with plan details
        const dryRunResult = await api.galleries.pay(galleryId, {
          dryRun: true,
          plan: planKey,
          priceCents,
        });

        // Store the parameters we just called with
        lastDryRunParamsRef.current = { planKey, priceCents };

        setPaymentMethodInfo({
          paymentMethod: (dryRunResult.paymentMethod ?? "STRIPE") as "WALLET" | "STRIPE" | "MIXED",
          walletAmountCents: Number(dryRunResult.walletAmountCents) ?? 0,
          stripeAmountCents: Number(dryRunResult.stripeAmountCents) ?? 0,
          stripeFeeCents: Number(dryRunResult.stripeFeeCents) ?? 0,
          totalAmountCents: Number(dryRunResult.totalAmountCents) ?? 0,
        });
      } catch (error: unknown) {
        console.error("Failed to get payment method info:", error);
        // Don't clear paymentMethodInfo on error to prevent flickering - keep last known value
        lastDryRunParamsRef.current = null;
      }
    };

    void callDryRun();
    // Use planKey and priceCents derived values instead of planRecommendation object
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    galleryId,
    needsPayment,
    isLoadingPlanRecommendation,
    // Extract stable values from planRecommendation instead of the object itself
    planRecommendation?.suggestedPlan?.name,
    planRecommendation?.suggestedPlan?.planKey,
    selectedDuration,
    gallery.selectionEnabled,
  ]);

  if (!needsPayment) {
    return null;
  }

  const formatBytes = (bytes: number | undefined | null): string => {
    if (!bytes || bytes === 0) {
      return "0 GB";
    }
    if (bytes < 1024 * 1024 * 1024) {
      return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    }
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  };


  // Use plan recommendation data if available (more up-to-date), otherwise fall back to gallery data
  // IMPORTANT: Don't use gallery.originalsBytesUsed until loading is complete to prevent flicker
  const currentUploadedBytes: number =
    uploadedSizeBytes ?? 
    (isLoadingPlanRecommendation
      ? 0 // While loading, assume no photos to prevent flicker
      : planRecommendation?.uploadedSizeBytes ?? gallery.originalsBytesUsed ?? 0);
  // Only show plan content if we're not loading AND we have a plan recommendation
  const hasUploadedPhotos = !isLoadingPlanRecommendation && currentUploadedBytes > 0 && planRecommendation !== null;

  const handlePublishGallery = async () => {
    setIsProcessingPayment(true);
    try {
      // Always calculate plan first - this will determine the best plan based on uploaded photos
      try {
        const modalData = await getPricingModalData(galleryId);
        // Update modal data with selected duration
        if (modalData && hasUploadedPhotos) {
          const storageMatch = modalData.suggestedPlan.name.match(/^(\d+GB)/);
          const storage = (storageMatch ? storageMatch[1] : "1GB") as "1GB" | "3GB" | "10GB";
          const currentDuration = selectedDuration ?? "1m";
          const planKey = getPlanByStorageAndDuration(storage, currentDuration);
          if (planKey) {
            const plan = getPlan(planKey);
            if (plan) {
              modalData.suggestedPlan = {
                ...modalData.suggestedPlan,
                planKey,
                name: plan.label,
                priceCents: calculatePriceWithDiscount(planKey, gallery.selectionEnabled !== false),
                duration: plan.duration,
              };
              modalData.originalsLimitBytes = plan.storageLimitBytes;
              modalData.finalsLimitBytes = plan.storageLimitBytes;
            }
          }
        }
        setPricingModalData(modalData);
        setIsProcessingPayment(false);
        return;
      } catch (_calcError) {
        showToast("error", "Błąd", "Nie udało się obliczyć planu. Spróbuj ponownie.");
        setIsProcessingPayment(false);
        return;
      }
    } catch (error: unknown) {
      showToast("error", "Błąd", formatApiError(error as Error));
      setIsProcessingPayment(false);
    }
  };

  if (isMinimized) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg p-4 mb-6 shadow-md border border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-gray-900 dark:text-white">
              Galeria nieopublikowana
            </span>
          </div>
          <button
            onClick={() => setIsMinimized(false)}
            className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
          >
            Rozwiń
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-6 mb-6 shadow-lg border border-gray-200 dark:border-gray-700">
      <div className="flex items-start justify-between mb-5">
        <div className="flex-1">
          <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
            Opublikuj galerię, aby ją aktywować
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {hasUploadedPhotos
              ? "System przeanalizował przesłane zdjęcia i zaproponował najbardziej optymalny plan. Możesz wybrać ten plan lub inny podczas publikacji galerii."
              : "Prześlij zdjęcia do galerii, aby system mógł wybrać najbardziej optymalny plan dla Twojej galerii. Po przesłaniu zdjęć będziesz mógł opublikować galerię i wybrać plan."}
          </p>
        </div>
        <button
          onClick={() => setIsMinimized(true)}
          className="flex-shrink-0 p-2 rounded-lg text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          aria-label="Minimalizuj"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>

      {/* Plan Recommendation */}
      {hasUploadedPhotos && (
        <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-6 mb-6 border border-gray-200 dark:border-gray-700">
          <div className="flex items-start justify-between mb-5">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
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
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <span className="text-sm font-semibold text-gray-900 dark:text-white">
                  Zaproponowany plan
                </span>
              </div>
              {planRecommendation ? (
                <>
                  <h4 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                    {planRecommendation.suggestedPlan.name.split(" - ")[0]}
                  </h4>

                  {/* Duration Selector */}
                  <div className="flex gap-2">
                    {(["1m", "3m", "12m"] as Duration[]).map((duration) => {
                      const isSelected = (selectedDuration ?? "1m") === duration;

                      return (
                        <button
                          key={duration}
                          onClick={() => setSelectedDuration(duration)}
                          className={`px-3 py-1.5 rounded-md transition-all text-sm font-medium ${
                            isSelected
                              ? "outline-2 outline-blue-500 outline bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
                              : "outline-2 outline-gray-300 dark:outline-gray-600 outline bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:outline-blue-300 dark:hover:outline-blue-600"
                          }`}
                        >
                          {duration === "1m"
                            ? "1 miesiąc"
                            : duration === "3m"
                              ? "3 miesiące"
                              : "12 miesięcy"}
                        </button>
                      );
                    })}
                  </div>
                </>
              ) : (
                <>
                  <h4 className="text-lg font-semibold text-gray-400 dark:text-gray-500 mb-3">-</h4>
                  <div className="flex gap-2">
                    {(["1m", "3m", "12m"] as Duration[]).map((duration) => (
                      <div
                        key={duration}
                        className="px-3 py-1.5 rounded-md border-2 border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-600 text-sm"
                      >
                        {duration === "1m"
                          ? "1 miesiąc"
                          : duration === "3m"
                            ? "3 miesiące"
                            : "12 miesięcy"}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
            <div className="text-right">
              {isLoadingPlanRecommendation ? (
                <div className="text-3xl font-bold text-gray-400 dark:text-gray-500">
                  Kalkulowanie...
                </div>
              ) : planRecommendation ? (
                <>
                  <div className="text-3xl font-bold text-gray-900 dark:text-white">
                        {(() => {
                          // Calculate price for selected duration
                          const storageMatch = planRecommendation.suggestedPlan.name.match(/^(\d+GB)/);
                          const storage = (storageMatch ? storageMatch[1] : "1GB") as "1GB" | "3GB" | "10GB";
                          const currentDuration = selectedDuration ?? "1m";
                          const planKey = getPlanByStorageAndDuration(storage, currentDuration);
                          if (planKey) {
                            return formatPrice(calculatePriceWithDiscount(planKey, gallery.selectionEnabled !== false));
                          }
                          return formatPrice(planRecommendation.suggestedPlan.priceCents);
                        })()}
                      </div>
                      {gallery.selectionEnabled === false && (
                        <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-md bg-green-100 dark:bg-green-900/30 text-xs font-medium text-green-700 dark:text-green-400">
                          Zniżka 20%
                        </span>
                      )}
                </>
              ) : (
                <div className="text-3xl font-bold text-gray-400 dark:text-gray-500">-</div>
              )}
            </div>
          </div>

          {/* Storage Usage and Limits */}
          {planRecommendation && (
            <div className="grid grid-cols-3 gap-4 pt-4 border-t border-gray-200 dark:border-gray-700">
              <div>
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                  Wykorzystane miejsce
                </p>
                <p className="text-lg font-semibold text-gray-900 dark:text-white">
                  {formatBytes(currentUploadedBytes)}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                  Limit oryginałów
                </p>
                <p className="text-lg font-semibold text-gray-900 dark:text-white">
                  {formatBytes(planRecommendation.originalsLimitBytes)}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                  Limit finalnych
                </p>
                <p className="text-lg font-semibold text-gray-900 dark:text-white">
                  {formatBytes(planRecommendation.finalsLimitBytes)}
                </p>
              </div>
            </div>
          )}

          {/* Usage Indicator */}
          {planRecommendation?.usagePercentage !== undefined && (
            <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Wykorzystanie pojemności
                </span>
                <span
                  className={`text-sm font-semibold ${
                    planRecommendation.isNearCapacity
                      ? "text-amber-600 dark:text-amber-400"
                      : "text-gray-900 dark:text-white"
                  }`}
                >
                  {planRecommendation.usagePercentage.toFixed(1)}%
                </span>
              </div>
              <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    planRecommendation.isNearCapacity
                      ? "bg-amber-500 dark:bg-amber-400"
                      : "bg-blue-600 dark:bg-blue-500"
                  }`}
                  style={{
                    width: `${Math.min(planRecommendation.usagePercentage, 100)}%`,
                  }}
                />
              </div>
              {planRecommendation.isNearCapacity && (
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-2 flex items-center gap-1">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                      clipRule="evenodd"
                    />
                  </svg>
                  Galeria jest prawie pełna. Rozważ wybór większego planu.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Payment Method Guidance */}
      {hasUploadedPhotos && paymentMethodInfo && (
        <div className="mb-6">
          {paymentMethodInfo.paymentMethod === 'WALLET' && (
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-5 border border-blue-200 dark:border-blue-800/30">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/40">
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
                      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-gray-900 dark:text-white mb-1">
                    Płatność z portfela
                  </p>
                  <p className="text-sm text-gray-700 dark:text-gray-300">
                    Masz wystarczające środki w portfelu. Płatność zostanie wykonana automatycznie z portfela bez dodatkowych opłat transakcyjnych.
                  </p>
                </div>
              </div>
            </div>
          )}

          {(paymentMethodInfo.paymentMethod === 'STRIPE' || paymentMethodInfo.paymentMethod === 'MIXED') && (
            <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-5 border border-amber-200 dark:border-amber-800/30">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-900/40">
                  <svg
                    className="w-5 h-5 text-amber-600 dark:text-amber-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                    />
                  </svg>
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
                    {paymentMethodInfo.paymentMethod === 'MIXED' 
                      ? 'Niewystarczające saldo portfela'
                      : 'Płatność przez Stripe'}
                  </p>
                  {paymentMethodInfo.paymentMethod === 'MIXED' ? (
                    <>
                      <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">
                        Masz {formatPrice(paymentMethodInfo.walletAmountCents ?? 0)} w portfelu, ale potrzebujesz {formatPrice(paymentMethodInfo.totalAmountCents ?? 0)}.
                      </p>
                      <p className="text-sm text-gray-700 dark:text-gray-300 mb-3">
                        <strong>Tańsze rozwiązanie:</strong> Doładuj portfel, aby uniknąć dodatkowych opłat transakcyjnych Stripe ({formatPrice(paymentMethodInfo.stripeFeeCents ?? 0)}).
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">
                        Płatność zostanie wykonana przez Stripe, co wiąże się z dodatkowymi opłatami transakcyjnymi ({formatPrice(paymentMethodInfo.stripeFeeCents ?? 0)}).
                      </p>
                      <p className="text-sm text-gray-700 dark:text-gray-300 mb-3">
                        <strong>Tańsze rozwiązanie:</strong> Doładuj portfel, aby uniknąć opłat transakcyjnych Stripe.
                      </p>
                    </>
                  )}
                  <Link href="/wallet">
                    <button className="w-full sm:w-auto px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700 text-white font-medium text-sm transition-colors">
                      Przejdź do portfela
                    </button>
                  </Link>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {!hasUploadedPhotos && (
        <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-5 mb-6 border border-amber-200 dark:border-amber-800/30">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-900/40">
              <svg
                className="w-5 h-5 text-amber-600 dark:text-amber-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
                Następne kroki:
              </p>
              <ol className="space-y-2.5">
                {[
                  "Prześlij zdjęcia do galerii (przejdź do zakładki &quot;Zdjęcia&quot;)",
                  "System automatycznie obliczy plan na podstawie rozmiaru przesłanych zdjęć",
                  "Po przesłaniu zdjęć opublikuj galerię i wybierz plan",
                ].map((step, index) => (
                  <li
                    key={index}
                    className="flex items-start gap-3 text-sm text-gray-700 dark:text-gray-300"
                  >
                    <span className="flex-shrink-0 flex items-center justify-center w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 font-semibold text-xs mt-0.5">
                      {index + 1}
                    </span>
                    <span className="flex-1">{step}</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </div>
      )}



      {/* Action Button */}
      <div>
        {hasUploadedPhotos ? (
          <button
            onClick={handlePublishGallery}
            disabled={isProcessingPayment}
            className="w-full flex items-center justify-center gap-2 rounded-lg bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700 px-6 py-3 text-white font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm hover:shadow-md"
          >
            {isProcessingPayment ? (
              <>
                <svg
                  className="animate-spin h-5 w-5"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                <span>Obliczanie planu...</span>
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13 10V3L4 14h7v7l9-11h-7z"
                  />
                </svg>
                <span>Opublikuj galerię</span>
              </>
            )}
          </button>
        ) : (
          <button
            onClick={() => router.push(`/galleries/${galleryId}/photos`)}
            className="w-full flex items-center justify-center gap-2 rounded-lg bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700 px-6 py-3 text-white font-semibold transition-colors shadow-sm hover:shadow-md"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
            <span>Przejdź do zdjęć</span>
          </button>
        )}
      </div>

      {/* Pricing Modal */}
      {pricingModalData && (
        <GalleryPricingModal
          isOpen={!!pricingModalData}
          onClose={() => {
            setPricingModalData(null);
          }}
          galleryId={galleryId}
          suggestedPlan={pricingModalData.suggestedPlan}
          originalsLimitBytes={pricingModalData.originalsLimitBytes}
          finalsLimitBytes={pricingModalData.finalsLimitBytes}
          uploadedSizeBytes={pricingModalData.uploadedSizeBytes}
          selectionEnabled={pricingModalData.selectionEnabled}
          onPlanSelected={() => {
            setPricingModalData(null);
            onPaymentComplete?.();
          }}
        />
      )}
    </div>
  );
};
