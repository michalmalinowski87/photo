/**
 * Reusable utility for calculating and normalizing plan recommendations
 */

import { QueryClient } from "@tanstack/react-query";

import api from "./api-service";
import type {
  CalculatePlanResponse,
  PlanRecommendation,
  PricingModalData,
  PlanOption,
  NextTierPlan,
} from "./plan-types";
import { queryKeys } from "./react-query";

/**
 * Calculate the best plan for a gallery based on uploaded photos
 * This is the single source of truth for plan calculation logic
 *
 * @param galleryId - The gallery ID
 * @param duration - Plan duration preference ('1m', '3m', or '12m'), defaults to '1m'
 * @param queryClient - Optional React Query client for caching (if available)
 * @returns Normalized plan recommendation data
 * @throws Error if calculation fails
 */
export async function calculateBestPlan(
  galleryId: string,
  duration: string = "1m",
  queryClient?: QueryClient
): Promise<CalculatePlanResponse> {
  if (!galleryId) {
    throw new Error("Gallery ID is required");
  }

  // Use React Query for caching if available
  const planResult = queryClient
    ? await queryClient.fetchQuery({
        queryKey: queryKeys.galleries.calculatePlan(galleryId, duration),
        queryFn: () => api.galleries.calculatePlan(galleryId, duration),
      })
    : await api.galleries.calculatePlan(galleryId, duration);

  // Normalize suggestedPlan - ensure it's always a PlanOption object
  let suggestedPlan: PlanOption;
  if (typeof planResult.suggestedPlan === "string") {
    // If it's a string (planKey), we need to construct the PlanOption
    // This shouldn't happen based on backend, but handle it defensively
    throw new Error("Invalid plan data format: suggestedPlan is a string");
  } else if (
    planResult.suggestedPlan &&
    typeof planResult.suggestedPlan === "object" &&
    "planKey" in planResult.suggestedPlan
  ) {
    suggestedPlan = planResult.suggestedPlan as PlanOption;
  } else {
    throw new Error("Invalid plan data format: suggestedPlan is not a valid PlanOption");
  }

  // Normalize nextTierPlan
  let nextTierPlan: NextTierPlan | undefined;
  if (
    planResult.nextTierPlan &&
    typeof planResult.nextTierPlan === "object" &&
    "storageLimitBytes" in planResult.nextTierPlan
  ) {
    nextTierPlan = planResult.nextTierPlan as NextTierPlan;
  }

  return {
    suggestedPlan,
    originalsLimitBytes: planResult.originalsLimitBytes,
    finalsLimitBytes: planResult.finalsLimitBytes,
    uploadedSizeBytes: planResult.uploadedSizeBytes,
    selectionEnabled: planResult.selectionEnabled,
    usagePercentage: planResult.usagePercentage,
    isNearCapacity: planResult.isNearCapacity,
    isAtCapacity: planResult.isAtCapacity,
    exceedsLargestPlan: planResult.exceedsLargestPlan,
    nextTierPlan,
  };
}

/**
 * Get plan recommendation for display purposes (simplified version)
 * Returns only the essential data needed for recommendation display
 */
export async function getPlanRecommendation(
  galleryId: string,
  duration: string = "1m",
  queryClient?: QueryClient
): Promise<PlanRecommendation> {
  const result = await calculateBestPlan(galleryId, duration, queryClient);
  return {
    suggestedPlan: result.suggestedPlan,
    originalsLimitBytes: result.originalsLimitBytes,
    finalsLimitBytes: result.finalsLimitBytes,
    uploadedSizeBytes: result.uploadedSizeBytes,
    selectionEnabled: result.selectionEnabled,
    usagePercentage: result.usagePercentage,
    isNearCapacity: result.isNearCapacity,
    isAtCapacity: result.isAtCapacity,
    exceedsLargestPlan: result.exceedsLargestPlan,
    nextTierPlan: result.nextTierPlan,
  };
}

/**
 * Get pricing modal data for opening the pricing modal
 * Returns data formatted specifically for the GalleryPricingModal component
 */
export async function getPricingModalData(
  galleryId: string,
  duration: string = "1m",
  queryClient?: QueryClient
): Promise<PricingModalData> {
  const result = await calculateBestPlan(galleryId, duration, queryClient);
  return {
    suggestedPlan: result.suggestedPlan,
    originalsLimitBytes: result.originalsLimitBytes,
    finalsLimitBytes: result.finalsLimitBytes,
    uploadedSizeBytes: result.uploadedSizeBytes,
    selectionEnabled: result.selectionEnabled,
    usagePercentage: result.usagePercentage,
    isNearCapacity: result.isNearCapacity,
    isAtCapacity: result.isAtCapacity,
    exceedsLargestPlan: result.exceedsLargestPlan,
    nextTierPlan: result.nextTierPlan,
  };
}

/**
 * Calculate plan with error handling wrapper
 * Returns null on error instead of throwing
 */
export async function calculateBestPlanSafe(
  galleryId: string,
  duration: string = "1m",
  queryClient?: QueryClient
): Promise<CalculatePlanResponse | null> {
  try {
    return await calculateBestPlan(galleryId, duration, queryClient);
  } catch (_error) {
    return null;
  }
}
