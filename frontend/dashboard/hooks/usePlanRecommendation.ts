import { useState, useEffect, useRef } from "react";

import { getPlanRecommendation } from "../lib/calculate-plan";
import type { PlanRecommendation } from "../lib/plan-types";
import {
  getPlanByStorageAndDuration,
  calculatePriceWithDiscount,
  getPlan,
  type Duration,
} from "../lib/pricing-plans";

interface UsePlanRecommendationProps {
  galleryId: string;
  needsPayment: boolean;
  selectionEnabled: boolean;
  originalsBytesUsed?: number;
}

export function usePlanRecommendation({
  galleryId,
  needsPayment,
  selectionEnabled,
  originalsBytesUsed = 0,
}: UsePlanRecommendationProps) {
  const [planRecommendation, setPlanRecommendation] = useState<PlanRecommendation | null>(null);
  const [isLoadingPlanRecommendation, setIsLoadingPlanRecommendation] = useState(false);
  const [uploadedSizeBytes, setUploadedSizeBytes] = useState<number | null>(null);
  const [selectedDuration, setSelectedDuration] = useState<Duration | null>(null);

  const prevSelectedDurationRef = useRef<Duration | null>(null);
  const prevGalleryIdRef = useRef<string | null>(null);
  const isUpdatingDurationRef = useRef(false);

  // Helper function to update recommendation with new duration
  const updateRecommendationWithDuration = (
    recommendation: PlanRecommendation,
    duration: Duration
  ): void => {
    const storageMatch = recommendation.suggestedPlan.name.match(/^(\d+GB)/);
    const storage = (storageMatch ? storageMatch[1] : "1GB") as "1GB" | "3GB" | "10GB";
    const planKey = getPlanByStorageAndDuration(storage, duration);
    if (planKey) {
      const plan = getPlan(planKey);
      if (plan) {
        setPlanRecommendation((prev) => {
          const updated = {
            ...recommendation,
            suggestedPlan: {
              ...recommendation.suggestedPlan,
              planKey,
              name: plan.label,
              priceCents: calculatePriceWithDiscount(planKey, selectionEnabled),
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
  };

  // Listen for gallery updates (e.g., after uploads) to refresh data
  useEffect(() => {
    if (!needsPayment || !galleryId) {
      setPlanRecommendation(null);
      setUploadedSizeBytes(null);
      setIsLoadingPlanRecommendation(false);
      return;
    }

    const onlyDurationChanged =
      prevGalleryIdRef.current === galleryId &&
      prevSelectedDurationRef.current !== selectedDuration &&
      planRecommendation !== null;

    if (onlyDurationChanged) {
      prevGalleryIdRef.current = galleryId;
      prevSelectedDurationRef.current = selectedDuration;
      if (planRecommendation) {
        updateRecommendationWithDuration(planRecommendation, selectedDuration ?? "1m");
      }
      return;
    }

    if (!onlyDurationChanged) {
      setPlanRecommendation(null);
    }

    prevGalleryIdRef.current = galleryId;
    prevSelectedDurationRef.current = selectedDuration;

    let requestCounter = 0;

    // Refresh recommendation when gallery bytes change (Zustand subscriptions handle state updates)
    const refreshRecommendation = async () => {
      requestCounter += 1;
      const currentRequest = requestCounter;

      if (!planRecommendation) {
        setIsLoadingPlanRecommendation(true);
      }
      try {
        const recommendation = await getPlanRecommendation(galleryId);

        if (currentRequest !== requestCounter) {
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

          updateRecommendationWithDuration(recommendation, currentDuration);
        } else {
          setPlanRecommendation(null);
          setUploadedSizeBytes(0);
        }
      } catch (error) {
        if (currentRequest === requestCounter) {
          console.error("Failed to refresh plan recommendation:", error);
          setPlanRecommendation(null);
          setUploadedSizeBytes(0);
        }
      } finally {
        if (currentRequest === requestCounter) {
          setIsLoadingPlanRecommendation(false);
        }
      }
    };

    void refreshRecommendation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [galleryId, needsPayment, selectionEnabled, originalsBytesUsed]);

  // Also refresh when gallery prop changes
  useEffect(() => {
    if (!needsPayment || !galleryId) {
      setPlanRecommendation(null);
      setUploadedSizeBytes(null);
      setIsLoadingPlanRecommendation(false);
      return;
    }

    const onlyDurationChanged =
      prevGalleryIdRef.current === galleryId &&
      prevSelectedDurationRef.current !== selectedDuration &&
      planRecommendation !== null;

    if (onlyDurationChanged) {
      prevGalleryIdRef.current = galleryId;
      prevSelectedDurationRef.current = selectedDuration;
      if (planRecommendation) {
        updateRecommendationWithDuration(planRecommendation, selectedDuration ?? "1m");
      }
      return;
    }

    if (!onlyDurationChanged) {
      setPlanRecommendation(null);
    }

    prevGalleryIdRef.current = galleryId;
    prevSelectedDurationRef.current = selectedDuration;

    const currentBytes = originalsBytesUsed;
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

      if (!planRecommendation) {
        setIsLoadingPlanRecommendation(true);
      }
      try {
        const recommendation = await getPlanRecommendation(galleryId);

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

          updateRecommendationWithDuration(recommendation, currentDuration);
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

    const timeoutId = setTimeout(() => {
      void refreshData();
    }, 200);

    return () => {
      isCancelled = true;
      clearTimeout(timeoutId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [galleryId, originalsBytesUsed, needsPayment, selectionEnabled]);

  // Load uploaded size and plan recommendation if photos are uploaded
  useEffect(() => {
    if (!needsPayment) {
      setPlanRecommendation(null);
      setUploadedSizeBytes(null);
      setIsLoadingPlanRecommendation(false);
      return;
    }

    const onlyDurationChanged =
      prevGalleryIdRef.current === galleryId &&
      prevSelectedDurationRef.current !== selectedDuration &&
      planRecommendation !== null;

    if (onlyDurationChanged) {
      prevGalleryIdRef.current = galleryId;
      prevSelectedDurationRef.current = selectedDuration;
      if (planRecommendation) {
        updateRecommendationWithDuration(planRecommendation, selectedDuration ?? "1m");
      }
      return;
    }

    if (!onlyDurationChanged) {
      setPlanRecommendation(null);
    }

    prevGalleryIdRef.current = galleryId;
    prevSelectedDurationRef.current = selectedDuration;

    const loadUploadedSizeAndPlan = async () => {
      if (!planRecommendation) {
        setIsLoadingPlanRecommendation(true);
      }
      try {
        const recommendation = await getPlanRecommendation(galleryId);
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

          updateRecommendationWithDuration(recommendation, currentDuration);
        } else {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [galleryId, originalsBytesUsed, needsPayment, selectionEnabled]);

  // Separate useEffect to handle duration changes without calling API
  useEffect(() => {
    if (!planRecommendation || !selectedDuration || isUpdatingDurationRef.current) {
      return;
    }

    if (prevSelectedDurationRef.current === selectedDuration) {
      return;
    }

    isUpdatingDurationRef.current = true;
    prevSelectedDurationRef.current = selectedDuration;

    updateRecommendationWithDuration(planRecommendation, selectedDuration);

    isUpdatingDurationRef.current = false;
  }, [selectedDuration, selectionEnabled, planRecommendation?.suggestedPlan.name]);

  return {
    planRecommendation,
    isLoadingPlanRecommendation,
    uploadedSizeBytes,
    selectedDuration,
    setSelectedDuration,
  };
}
