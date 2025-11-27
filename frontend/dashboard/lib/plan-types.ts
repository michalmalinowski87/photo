/**
 * Shared types for plan calculation and recommendations
 */

export interface PlanOption {
  name: string;
  priceCents: number;
  storage: string;
  duration: string;
  planKey: string;
}

export interface NextTierPlan extends PlanOption {
  storageLimitBytes: number;
}

export interface CalculatePlanResponse {
  suggestedPlan: PlanOption;
  originalsLimitBytes: number;
  finalsLimitBytes: number;
  uploadedSizeBytes: number;
  selectionEnabled: boolean;
  usagePercentage?: number;
  isNearCapacity?: boolean;
  isAtCapacity?: boolean;
  exceedsLargestPlan?: boolean;
  nextTierPlan?: NextTierPlan;
}

export interface PlanRecommendation {
  suggestedPlan: PlanOption;
  originalsLimitBytes: number;
  finalsLimitBytes: number;
  uploadedSizeBytes: number;
  selectionEnabled: boolean;
  usagePercentage?: number;
  isNearCapacity?: boolean;
  isAtCapacity?: boolean;
  exceedsLargestPlan?: boolean;
  nextTierPlan?: NextTierPlan;
}

export interface PricingModalData {
  suggestedPlan: PlanOption;
  originalsLimitBytes: number;
  finalsLimitBytes: number;
  uploadedSizeBytes: number;
  selectionEnabled: boolean;
  usagePercentage?: number;
  isNearCapacity?: boolean;
  isAtCapacity?: boolean;
  exceedsLargestPlan?: boolean;
  nextTierPlan?: NextTierPlan;
}
