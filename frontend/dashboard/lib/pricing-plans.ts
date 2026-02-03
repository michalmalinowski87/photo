/**
 * Frontend Pricing Plans
 *
 * Mirrors backend/lib/src/pricing.ts
 * Single source of truth for pricing plan definitions
 */

export type PlanKey =
  | "1GB-1m"
  | "1GB-3m"
  | "1GB-12m"
  | "3GB-1m"
  | "3GB-3m"
  | "3GB-12m"
  | "10GB-1m"
  | "10GB-3m"
  | "10GB-12m";
export type Duration = "1m" | "3m" | "12m";

export interface PlanMetadata {
  priceCents: number;
  storageLimitBytes: number;
  expiryDays: number;
  label: string;
  storage: string;
  duration: string;
}

export const PRICING_PLANS: Record<PlanKey, PlanMetadata> = {
  "1GB-1m": {
    priceCents: 500,
    storageLimitBytes: 1 * 1024 * 1024 * 1024,
    expiryDays: 30,
    label: "1GB - 1 miesiąc",
    storage: "1 GB",
    duration: "1 miesiąc",
  },
  "1GB-3m": {
    priceCents: 700,
    storageLimitBytes: 1 * 1024 * 1024 * 1024,
    expiryDays: 90,
    label: "1GB - 3 miesiące",
    storage: "1 GB",
    duration: "3 miesiące",
  },
  "1GB-12m": {
    priceCents: 1500,
    storageLimitBytes: 1 * 1024 * 1024 * 1024,
    expiryDays: 365,
    label: "1GB - 12 miesięcy",
    storage: "1 GB",
    duration: "12 miesięcy",
  },
  "3GB-1m": {
    priceCents: 800,
    storageLimitBytes: 3 * 1024 * 1024 * 1024,
    expiryDays: 30,
    label: "3GB - 1 miesiąc",
    storage: "3 GB",
    duration: "1 miesiąc",
  },
  "3GB-3m": {
    priceCents: 1000,
    storageLimitBytes: 3 * 1024 * 1024 * 1024,
    expiryDays: 90,
    label: "3GB - 3 miesiące",
    storage: "3 GB",
    duration: "3 miesiące",
  },
  "3GB-12m": {
    priceCents: 2100,
    storageLimitBytes: 3 * 1024 * 1024 * 1024,
    expiryDays: 365,
    label: "3GB - 12 miesięcy",
    storage: "3 GB",
    duration: "12 miesięcy",
  },
  "10GB-1m": {
    priceCents: 1000,
    storageLimitBytes: 10 * 1024 * 1024 * 1024,
    expiryDays: 30,
    label: "10GB - 1 miesiąc",
    storage: "10 GB",
    duration: "1 miesiąc",
  },
  "10GB-3m": {
    priceCents: 1200,
    storageLimitBytes: 10 * 1024 * 1024 * 1024,
    expiryDays: 90,
    label: "10GB - 3 miesiące",
    storage: "10 GB",
    duration: "3 miesiące",
  },
  "10GB-12m": {
    priceCents: 2600,
    storageLimitBytes: 10 * 1024 * 1024 * 1024,
    expiryDays: 365,
    label: "10GB - 12 miesięcy",
    storage: "10 GB",
    duration: "12 miesięcy",
  },
};

/**
 * Get plan metadata by plan key
 */
export function getPlan(planKey: PlanKey): PlanMetadata | null {
  return PRICING_PLANS[planKey] || null;
}

/**
 * Get all plan keys sorted by storage size (ascending)
 */
export function getAllPlanKeys(): PlanKey[] {
  return Object.keys(PRICING_PLANS) as PlanKey[];
}

/**
 * Get plan keys filtered by storage size
 */
export function getPlanKeysByStorage(storage: "1GB" | "3GB" | "10GB"): PlanKey[] {
  return getAllPlanKeys().filter((key) => key.startsWith(storage));
}

/**
 * Get plan keys filtered by duration
 */
export function getPlanKeysByDuration(duration: Duration): PlanKey[] {
  return getAllPlanKeys().filter((key) => key.includes(`-${duration}`));
}

/**
 * Plan keys eligible for referral discount (1 GB and 3 GB, 1m or 3m only).
 */
export const REFERRAL_ELIGIBLE_PLAN_KEYS: PlanKey[] = ['1GB-1m', '1GB-3m', '3GB-1m', '3GB-3m'];

/**
 * Check if a plan is eligible for referral discount.
 */
export function isPlanEligibleForReferralDiscount(planKey: PlanKey): boolean {
  return REFERRAL_ELIGIBLE_PLAN_KEYS.includes(planKey);
}

/**
 * Plan price in cents. Selection and non-selection galleries are priced the same (no discount for galeria bez wyboru).
 */
export function calculatePriceWithDiscount(
  planKey: PlanKey,
  _isSelectionGallery?: boolean
): number {
  const plan = getPlan(planKey);
  if (!plan) {
    return 0;
  }
  return plan.priceCents;
}

/**
 * Calculate plan price with automatic referral discount applied (10% or 15%).
 * Only applies to eligible plans (1GB/3GB, 1m/3m) and only when referralDiscountPercent is set.
 * Does not apply to manual discount codes entered by the user.
 */
export function calculatePriceWithReferralDiscount(
  planKey: PlanKey,
  referralDiscountPercent?: 10 | 15
): number {
  const basePrice = calculatePriceWithDiscount(planKey);
  if (!referralDiscountPercent) {
    return basePrice;
  }
  if (!isPlanEligibleForReferralDiscount(planKey)) {
    return basePrice;
  }
  const discountMultiplier = 1 - referralDiscountPercent / 100;
  return Math.floor(basePrice * discountMultiplier);
}

/**
 * Get plan for a specific storage size and duration
 */
export function getPlanByStorageAndDuration(
  storage: "1GB" | "3GB" | "10GB",
  duration: Duration
): PlanKey | null {
  const planKey = `${storage}-${duration}` as PlanKey;
  return PRICING_PLANS[planKey] ? planKey : null;
}

/**
 * Get all available plans grouped by storage size
 */
export function getAllPlansGroupedByStorage(): {
  storage: "1GB" | "3GB" | "10GB";
  plans: { duration: Duration; planKey: PlanKey; metadata: PlanMetadata }[];
}[] {
  const storages: ("1GB" | "3GB" | "10GB")[] = ["1GB", "3GB", "10GB"];
  const durations: Duration[] = ["1m", "3m", "12m"];

  return storages.map((storage) => ({
    storage,
    plans: durations
      .map((duration) => {
        const planKey = getPlanByStorageAndDuration(storage, duration);
        if (!planKey) {
          return null;
        }
        const metadata = getPlan(planKey);
        if (!metadata) {
          return null;
        }
        return { duration, planKey, metadata };
      })
      .filter(
        (plan): plan is { duration: Duration; planKey: PlanKey; metadata: PlanMetadata } =>
          plan !== null
      ),
  }));
}

/**
 * Extract duration from plan key (e.g., "1GB-12m" → "12m")
 */
export function extractDurationFromPlanKey(planKey: string): Duration | null {
  if (planKey.includes("-1m")) {
    return "1m";
  }
  if (planKey.includes("-3m")) {
    return "3m";
  }
  if (planKey.includes("-12m")) {
    return "12m";
  }
  return null;
}

/**
 * Extract storage size from plan key (e.g., "1GB-12m" → "1GB")
 */
export function extractStorageFromPlanKey(planKey: string): "1GB" | "3GB" | "10GB" | null {
  if (planKey.startsWith("1GB-")) {
    return "1GB";
  }
  if (planKey.startsWith("3GB-")) {
    return "3GB";
  }
  if (planKey.startsWith("10GB-")) {
    return "10GB";
  }
  return null;
}

/**
 * Calculate the best plan for a given uploaded size and duration
 * Returns the smallest plan that fits the uploaded size
 */
export function calculateBestPlan(uploadedSizeBytes: number, duration: Duration): PlanKey {
  const plansForDuration = getPlanKeysByDuration(duration);

  // Sort by storage size (ascending)
  const sortedPlans = plansForDuration.sort((a, b) => {
    const planA = getPlan(a);
    const planB = getPlan(b);
    if (!planA || !planB) return 0;
    return planA.storageLimitBytes - planB.storageLimitBytes;
  });

  // Find the smallest plan that fits the uploaded size
  for (const planKey of sortedPlans) {
    const plan = getPlan(planKey);
    if (plan && plan.storageLimitBytes >= uploadedSizeBytes) {
      return planKey;
    }
  }

  // If no plan fits, return the largest plan
  return sortedPlans[sortedPlans.length - 1];
}
