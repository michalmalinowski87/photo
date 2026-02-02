/**
 * Single Source of Truth for Pricing Plans
 * 
 * This module contains all pricing plan definitions and helper functions.
 * Update plans here to change pricing across the entire application.
 */

export interface PlanMetadata {
	priceCents: number;
	storageLimitBytes: number;
	expiryDays: number;
	label: string; // e.g., "1GB - 1 miesiąc"
	storage: string; // e.g., "1 GB"
	duration: string; // e.g., "1 miesiąc"
}

export type PlanKey = '1GB-1m' | '1GB-3m' | '1GB-12m' | '3GB-1m' | '3GB-3m' | '3GB-12m' | '10GB-1m' | '10GB-3m' | '10GB-12m';

/**
 * Complete pricing plans configuration
 * 
 * Plans are organized by storage size (1GB, 3GB, 10GB) and duration (1m, 3m, 12m).
 * Prices are in PLN cents (e.g., 500 = 5.00 PLN).
 */
export const PRICING_PLANS: Record<PlanKey, PlanMetadata> = {
	'1GB-1m': {
		priceCents: 500,      // 5 PLN
		storageLimitBytes: 1 * 1024 * 1024 * 1024,  // 1 GB
		expiryDays: 30,        // 1 month
		label: '1GB - 1 miesiąc',
		storage: '1 GB',
		duration: '1 miesiąc'
	},
	'1GB-3m': {
		priceCents: 700,      // 7 PLN
		storageLimitBytes: 1 * 1024 * 1024 * 1024,  // 1 GB
		expiryDays: 90,        // 3 months
		label: '1GB - 3 miesiące',
		storage: '1 GB',
		duration: '3 miesiące'
	},
	'1GB-12m': {
		priceCents: 1500,     // 15 PLN
		storageLimitBytes: 1 * 1024 * 1024 * 1024,  // 1 GB
		expiryDays: 365,       // 12 months
		label: '1GB - 12 miesięcy',
		storage: '1 GB',
		duration: '12 miesięcy'
	},
	'3GB-1m': {
		priceCents: 800,      // 8 PLN
		storageLimitBytes: 3 * 1024 * 1024 * 1024,  // 3 GB
		expiryDays: 30,        // 1 month
		label: '3GB - 1 miesiąc',
		storage: '3 GB',
		duration: '1 miesiąc'
	},
	'3GB-3m': {
		priceCents: 1000,     // 10 PLN
		storageLimitBytes: 3 * 1024 * 1024 * 1024,  // 3 GB
		expiryDays: 90,        // 3 months
		label: '3GB - 3 miesiące',
		storage: '3 GB',
		duration: '3 miesiące'
	},
	'3GB-12m': {
		priceCents: 2100,     // 21 PLN
		storageLimitBytes: 3 * 1024 * 1024 * 1024,  // 3 GB
		expiryDays: 365,       // 12 months
		label: '3GB - 12 miesięcy',
		storage: '3 GB',
		duration: '12 miesięcy'
	},
	'10GB-1m': {
		priceCents: 1000,     // 10 PLN
		storageLimitBytes: 10 * 1024 * 1024 * 1024, // 10 GB
		expiryDays: 30,        // 1 month
		label: '10GB - 1 miesiąc',
		storage: '10 GB',
		duration: '1 miesiąc'
	},
	'10GB-3m': {
		priceCents: 1200,     // 12 PLN
		storageLimitBytes: 10 * 1024 * 1024 * 1024, // 10 GB
		expiryDays: 90,        // 3 months
		label: '10GB - 3 miesiące',
		storage: '10 GB',
		duration: '3 miesiące'
	},
	'10GB-12m': {
		priceCents: 2600,     // 26 PLN
		storageLimitBytes: 10 * 1024 * 1024 * 1024, // 10 GB
		expiryDays: 365,       // 12 months
		label: '10GB - 12 miesięcy',
		storage: '10 GB',
		duration: '12 miesięcy'
	}
};

/**
 * Get plan metadata by plan key
 */
export function getPlan(planKey: PlanKey | string): PlanMetadata | null {
	return PRICING_PLANS[planKey as PlanKey] || null;
}

/**
 * Get all plan keys sorted by storage size (ascending)
 */
export function getAllPlanKeys(): PlanKey[] {
	return Object.keys(PRICING_PLANS) as PlanKey[];
}

/**
 * Get plan keys filtered by duration
 */
export function getPlanKeysByDuration(duration: '1m' | '3m' | '12m'): PlanKey[] {
	return getAllPlanKeys().filter(key => key.includes(`-${duration}`));
}

/**
 * Get plan keys sorted by storage size (ascending)
 */
export function getPlanKeysSortedByStorage(): PlanKey[] {
	return getAllPlanKeys().sort((a, b) => 
		PRICING_PLANS[a].storageLimitBytes - PRICING_PLANS[b].storageLimitBytes
	);
}

/**
 * Calculate the best matching plan for a given uploaded size and duration
 * Returns the smallest plan that fits, or the largest plan if none fit
 */
export function calculateBestPlan(uploadedSizeBytes: number, duration: '1m' | '3m' | '12m' = '1m'): PlanKey {
	const plansForDuration = getPlanKeysByDuration(duration);
	const sortedPlans = plansForDuration.sort((a, b) => {
		return PRICING_PLANS[a].storageLimitBytes - PRICING_PLANS[b].storageLimitBytes;
	});
	
	// Find smallest plan that fits
	for (const plan of sortedPlans) {
		if (PRICING_PLANS[plan].storageLimitBytes >= uploadedSizeBytes) {
			return plan;
		}
	}
	
	// If no plan fits, return the largest plan for this duration
	return sortedPlans[sortedPlans.length - 1];
}

/**
 * Get the next tier plan (larger storage) for a given plan
 */
export function getNextTierPlan(currentPlanKey: PlanKey | string): PlanKey | null {
	const currentPlan = getPlan(currentPlanKey);
	if (!currentPlan) {
		return null;
	}
	
	const allPlans = getPlanKeysSortedByStorage();
	const currentIndex = allPlans.indexOf(currentPlanKey as PlanKey);
	
	// Find next plan with larger storage
	for (let i = currentIndex + 1; i < allPlans.length; i++) {
		if (PRICING_PLANS[allPlans[i]].storageLimitBytes > currentPlan.storageLimitBytes) {
			return allPlans[i];
		}
	}
	
	return null;
}

/**
 * Calculate price with discount for non-selection galleries (20% discount)
 */
export function calculatePriceWithDiscount(planKey: PlanKey | string, isSelectionGallery: boolean): number {
	const plan = getPlan(planKey);
	if (!plan) {
		return 0;
	}
	
	if (isSelectionGallery) {
		return plan.priceCents;
	}
	
	// Non-selection galleries get 20% discount
	return Math.round(plan.priceCents * 0.8);
}

/**
 * Get the largest plan size in bytes
 */
export function getLargestPlanSize(): number {
	const allPlans = getPlanKeysSortedByStorage();
	const largestPlan = allPlans[allPlans.length - 1];
	return PRICING_PLANS[largestPlan].storageLimitBytes;
}

/**
 * Format plan for frontend display
 */
export function formatPlanForDisplay(planKey: PlanKey | string, isSelectionGallery: boolean = true) {
	const plan = getPlan(planKey);
	if (!plan) {
		return null;
	}
	
	return {
		planKey: planKey as PlanKey,
		name: plan.label,
		priceCents: calculatePriceWithDiscount(planKey, isSelectionGallery),
		storage: plan.storage,
		duration: plan.duration,
		storageLimitBytes: plan.storageLimitBytes,
		expiryDays: plan.expiryDays
	};
}

