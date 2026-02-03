/**
 * Referral program "Invite & Capture" – eligibility, discount math, code generation.
 * Eligible plans: 1 GB and 3 GB, 1m or 3m only (no 12m, no 10 GB).
 */

import { GetCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import type { PlanKey } from './pricing';
import { getDocClient } from './ddb';
import { getPlan } from './pricing';
import { listTransactionsByUser } from './transactions';

/** Plan keys eligible for referral/earned discount (1 GB and 3 GB, 1m or 3m only). */
export const REFERRAL_ELIGIBLE_PLAN_KEYS: PlanKey[] = ['1GB-1m', '1GB-3m', '3GB-1m', '3GB-3m'];

/** Earned code types. */
export type EarnedDiscountType = '10_percent' | 'free_small' | '15_percent';

/** Expiry for earned codes: 6 months. */
export const EARNED_CODE_EXPIRY_MONTHS = 6;

/** Wallet credit in cents for 10+ referrals reward (20 PLN). */
export const REFERRAL_10_PLUS_WALLET_CENTS = 2000;

/** Single earned discount code entry (stored in user.earnedDiscountCodes). */
export interface EarnedDiscountCode {
	codeId: string;
	userId: string;
	type: EarnedDiscountType;
	expiresAt: string;
	used: boolean;
	usedOnGalleryId?: string;
}

/** Entry for referral history (sidebar table; no PII). */
export interface ReferralHistoryEntry {
	date: string;
	rewardType: EarnedDiscountType | 'free_small' | 'wallet_20pln';
}

/**
 * Whether a plan key is eligible for referral/earned discount.
 * Only 1 GB and 3 GB, 1m or 3m (no 12m, no 10 GB).
 */
export function isPlanEligibleForReferralDiscount(planKey: string): boolean {
	return REFERRAL_ELIGIBLE_PLAN_KEYS.includes(planKey as PlanKey);
}

/**
 * Discount for the referred user on their first paid gallery (rewards table).
 * - 1 or 3 paid invitations by referrer → 10% off for referred.
 * - 10+ paid invitations (Top Inviter) → 15% off for referred.
 * @param planKey – selected plan
 * @param isTopInviter – true if referrer has 10+ successful referrals (15% off)
 * @returns discount amount in cents (rounded down)
 */
export function getReferralDiscountForReferred(
	planKey: string,
	isTopInviter: boolean
): number {
	if (!isPlanEligibleForReferralDiscount(planKey)) {
		return 0;
	}
	const plan = getPlan(planKey);
	if (!plan) return 0;
	const priceCents = plan.priceCents;
	const pct = isTopInviter ? 0.15 : 0.1;
	return Math.floor(priceCents * pct);
}

/**
 * Discount amount when applying an earned code (referrer's own code).
 * - 10_percent: 10% of plan price
 * - 15_percent: 15% of plan price
 * - free_small: full price for 1 GB plans only (1GB-1m, 1GB-3m); 0 for 3 GB
 */
export function getEarnedDiscountAmountCents(
	type: EarnedDiscountType,
	planKey: string,
	planPriceCents: number
): number {
	if (!isPlanEligibleForReferralDiscount(planKey)) {
		return 0;
	}
	switch (type) {
		case '10_percent':
			return Math.floor(planPriceCents * 0.1);
		case '15_percent':
			return Math.floor(planPriceCents * 0.15);
		case 'free_small': {
			const isSmall = planKey === '1GB-1m' || planKey === '1GB-3m';
			return isSmall ? planPriceCents : 0;
		}
		default:
			return 0;
	}
}

const ALPHANUM = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

/**
 * Generate a random referral code (e.g. PHOTO + 8 chars).
 * Uniqueness must be enforced by the caller (e.g. GSI on referralCode or retry on conflict).
 */
export function generateReferralCode(): string {
	const prefix = 'PHOTO';
	let suffix = '';
	for (let i = 0; i < 8; i++) {
		suffix += ALPHANUM[Math.floor(Math.random() * ALPHANUM.length)];
	}
	return prefix + suffix;
}

/**
 * Create a new earned code entry to append to user.earnedDiscountCodes.
 * Expires in EARNED_CODE_EXPIRY_MONTHS from now.
 */
export function createEarnedCodeEntry(
	userId: string,
	type: EarnedDiscountType
): EarnedDiscountCode {
	const now = new Date();
	const expiresAt = new Date(now);
	expiresAt.setMonth(expiresAt.getMonth() + EARNED_CODE_EXPIRY_MONTHS);

	const codeId =
		type === '10_percent'
			? `DISC-10P-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`
			: type === 'free_small'
				? `DISC-FREE-SMALL-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`
				: `DISC-15P-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

	return {
		codeId,
		userId,
		type,
		expiresAt: expiresAt.toISOString(),
		used: false
	};
}

/**
 * Reward type granted for 1st, 3rd, or 10+ successful referral.
 */
export function getRewardTypeForReferralCount(referralCount: number): EarnedDiscountType {
	if (referralCount >= 10) return '15_percent';
	if (referralCount >= 3) return 'free_small';
	return '10_percent';
}

/**
 * Ensure user has a referral code (return existing or generate and set).
 * Call only when user is eligible (e.g. after first paid gallery).
 * Uses ConditionExpression attribute_not_exists(referralCode) to avoid overwriting.
 * @returns { code, wasNew } – wasNew true if a new code was just created.
 */
export async function ensureUserReferralCode(userId: string): Promise<{ code: string; wasNew: boolean }> {
	const envProc = (globalThis as any).process || process;
	const usersTable = envProc?.env?.USERS_TABLE as string;
	if (!usersTable) {
		throw new Error('USERS_TABLE is not set');
	}
	const ddb = getDocClient();

	const getRes = await ddb.send(new GetCommand({
		TableName: usersTable,
		Key: { userId },
		ProjectionExpression: 'referralCode'
	}));
	const existing = (getRes.Item as { referralCode?: string } | undefined)?.referralCode;
	if (existing) {
		return { code: existing, wasNew: false };
	}

	const code = generateReferralCode();
	const now = new Date().toISOString();
	try {
		await ddb.send(new UpdateCommand({
			TableName: usersTable,
			Key: { userId },
			UpdateExpression: 'SET referralCode = :code, updatedAt = :u',
			ConditionExpression: 'attribute_not_exists(referralCode)',
			ExpressionAttributeValues: { ':code': code, ':u': now }
		}));
		return { code, wasNew: true };
	} catch (err: any) {
		if (err.name === 'ConditionalCheckFailedException') {
			const retryGet = await ddb.send(new GetCommand({
				TableName: usersTable,
				Key: { userId },
				ProjectionExpression: 'referralCode'
			}));
			const set = (retryGet.Item as { referralCode?: string } | undefined)?.referralCode;
			if (set) return { code: set, wasNew: false };
		}
		throw err;
	}
}

/**
 * Get user email by userId (for sending referral/eligibility emails).
 */
export async function getEmailForUser(userId: string): Promise<string | null> {
	const envProc = (globalThis as any).process || process;
	const usersTable = envProc?.env?.USERS_TABLE as string;
	if (!usersTable) return null;
	const ddb = getDocClient();
	const res = await ddb.send(new GetCommand({
		TableName: usersTable,
		Key: { userId },
		ProjectionExpression: 'email'
	}));
	const email = (res.Item as { email?: string } | undefined)?.email;
	return typeof email === 'string' && email.trim() ? email.trim() : null;
}

const REFERRAL_CODE_INDEX = 'referralCode-index';

/**
 * Find userId by referral code. Uses GSI referralCode-index only (Query, Limit 1).
 * No Scan: table is keyed by userId; lookup by referralCode requires the GSI. Scale-safe.
 */
export async function findUserIdByReferralCode(referralCode: string): Promise<string | null> {
	const envProc = (globalThis as any).process || process;
	const usersTable = envProc?.env?.USERS_TABLE as string;
	if (!usersTable || !referralCode) return null;
	const ddb = getDocClient();
	const code = referralCode.trim().toUpperCase();
	const result = await ddb.send(new QueryCommand({
		TableName: usersTable,
		IndexName: REFERRAL_CODE_INDEX,
		KeyConditionExpression: '#rc = :code',
		ExpressionAttributeNames: { '#rc': 'referralCode' },
		ExpressionAttributeValues: { ':code': code },
		ProjectionExpression: 'userId',
		Limit: 1
	}));
	const item = (result.Items?.[0] as { userId?: string } | undefined);
	return item?.userId ?? null;
}

/** Result of validating an earned discount code at checkout. */
export interface ValidateEarnedCodeResult {
	valid: boolean;
	discountCents?: number;
	type?: EarnedDiscountType;
	errorMessage?: string;
}

/** Result of validating a referral code at checkout. */
export interface ValidateReferralCodeResult {
	valid: boolean;
	referrerUserId?: string;
	discountCents?: number;
	isTopInviter?: boolean;
	errorMessage?: string;
}

/** Polish error messages for checkout (plan). */
const ERR_EARNED_PLAN = 'Ten kod obowiązuje tylko dla planów 1 GB i 3 GB (1 lub 3 miesiące).';
const ERR_EARNED_OTHER_ACCOUNT = 'Ten kod należy do innego konta.';
const ERR_EARNED_EXPIRED = 'Ten kod wygasł.';
const ERR_EARNED_USED = 'Ten kod został już wykorzystany.';
const ERR_REFERRAL_INVALID = 'Nieprawidłowy kod zaproszenia.';
const ERR_REFERRAL_SELF = 'Nie możesz użyć własnego kodu.';
const ERR_REFERRAL_PLAN = 'Kod zaproszenia obowiązuje tylko dla planów 1 GB i 3 GB (1 lub 3 miesiące).';
const ERR_REFERRAL_NOT_FIRST = 'Kod zaproszenia obowiązuje tylko przy pierwszej płatnej galerii.';

/**
 * Get user's referredByUserId (set when they signed up via invite link). Returns null if not set.
 */
export async function getReferredByUserId(userId: string): Promise<string | null> {
	const envProc = (globalThis as any).process || process;
	const usersTable = envProc?.env?.USERS_TABLE as string;
	if (!usersTable) return null;
	const ddb = getDocClient();
	const res = await ddb.send(new GetCommand({
		TableName: usersTable,
		Key: { userId },
		ProjectionExpression: 'referredByUserId'
	}));
	const referredByUserId = (res.Item as { referredByUserId?: string } | undefined)?.referredByUserId;
	return referredByUserId && typeof referredByUserId === 'string' ? referredByUserId : null;
}

/**
 * Get user's referral-related fields from USERS_TABLE.
 */
export async function getUserReferralFields(userId: string): Promise<{
	earnedDiscountCodes?: EarnedDiscountCode[];
	referralSuccessCount?: number;
	topInviterBadge?: boolean;
	referralDiscountUsedAt?: string;
}> {
	const envProc = (globalThis as any).process || process;
	const usersTable = envProc?.env?.USERS_TABLE as string;
	if (!usersTable) return {};
	const ddb = getDocClient();
	const res = await ddb.send(new GetCommand({
		TableName: usersTable,
		Key: { userId },
		ProjectionExpression: 'earnedDiscountCodes, referralSuccessCount, topInviterBadge, referralDiscountUsedAt'
	}));
	const item = (res.Item as {
		earnedDiscountCodes?: EarnedDiscountCode[];
		referralSuccessCount?: number;
		topInviterBadge?: boolean;
		referralDiscountUsedAt?: string;
	} | undefined);
	return {
		earnedDiscountCodes: item?.earnedDiscountCodes,
		referralSuccessCount: item?.referralSuccessCount,
		topInviterBadge: item?.topInviterBadge,
		referralDiscountUsedAt: item?.referralDiscountUsedAt
	};
}

/**
 * Mark that the user has used a referral discount (referred or earned code).
 * Call this once when a PAID transaction with referral metadata is finalized.
 * Ensures referral discount can only be used once per user, without relying on transaction list limits.
 */
export async function markUserReferralDiscountUsed(userId: string): Promise<void> {
	const envProc = (globalThis as any).process || process;
	const usersTable = envProc?.env?.USERS_TABLE as string;
	if (!usersTable) throw new Error('USERS_TABLE is not set');
	const ddb = getDocClient();
	const now = new Date().toISOString();
	await ddb.send(new UpdateCommand({
		TableName: usersTable,
		Key: { userId },
		UpdateExpression: 'SET referralDiscountUsedAt = :t, updatedAt = :u',
		ExpressionAttributeValues: { ':t': now, ':u': now }
	}));
}

/** PAID transaction is Stripe-backed if it has stripeSessionId or paymentMethod STRIPE/MIXED. */
function isStripePaidTransaction(t: { stripeSessionId?: string; paymentMethod?: string }): boolean {
	return !!(t.stripeSessionId || t.paymentMethod === 'STRIPE' || t.paymentMethod === 'MIXED');
}

/**
 * Count user's PAID transactions that were paid via Stripe (any type: GALLERY_PLAN, GALLERY_PLAN_UPGRADE, WALLET_TOPUP).
 * Used to detect "first successful Stripe payment" for referral eligibility.
 */
export async function countStripePaidTransactions(userId: string): Promise<number> {
	const { transactions } = await listTransactionsByUser(userId, {
		status: 'PAID',
		limit: 100
	});
	return transactions.filter(isStripePaidTransaction).length;
}

/**
 * Referrer is eligible if they have completed at least one successful Stripe payment (gallery, upgrade, or wallet top-up).
 * Excludes free welcome-credit-only gallery payments; includes any wallet top-up.
 */
export async function isReferrerEligible(userId: string): Promise<boolean> {
	return (await countStripePaidTransactions(userId)) >= 1;
}

/**
 * Buyer's first gallery purchase = user has not yet used a referral discount.
 * Uses user.referralDiscountUsedAt (set when a PAID transaction with referral metadata is finalized).
 * No transaction list limit – reliable regardless of transaction count.
 */
export async function isBuyerFirstGalleryPurchase(buyerUserId: string): Promise<boolean> {
	const { referralDiscountUsedAt } = await getUserReferralFields(buyerUserId);
	return !referralDiscountUsedAt;
}

/**
 * Validate earned discount code for checkout. Returns valid + discountCents/type or errorMessage (Polish).
 */
export async function validateEarnedCodeForCheckout(
	userId: string,
	codeId: string,
	planKey: string,
	planPriceCents: number
): Promise<ValidateEarnedCodeResult> {
	if (!isPlanEligibleForReferralDiscount(planKey)) {
		return { valid: false, errorMessage: ERR_EARNED_PLAN };
	}
	const { earnedDiscountCodes } = await getUserReferralFields(userId);
	const codes = earnedDiscountCodes || [];
	const entry = codes.find((c) => c.codeId === codeId);
	if (!entry) {
		return { valid: false, errorMessage: ERR_EARNED_OTHER_ACCOUNT };
	}
	if (entry.used) {
		return { valid: false, errorMessage: ERR_EARNED_USED };
	}
	if (new Date(entry.expiresAt) <= new Date()) {
		return { valid: false, errorMessage: ERR_EARNED_EXPIRED };
	}
	const discountCents = getEarnedDiscountAmountCents(entry.type, planKey, planPriceCents);
	return { valid: true, discountCents, type: entry.type };
}

/**
 * Validate referral code for checkout (referred user's first purchase). Returns valid + referrerUserId + discountCents or errorMessage (Polish).
 */
export async function validateReferralCodeForCheckout(
	buyerUserId: string,
	referralCode: string,
	planKey: string,
	_planPriceCents: number
): Promise<ValidateReferralCodeResult> {
	const code = referralCode?.trim?.();
	if (!code) {
		return { valid: false, errorMessage: ERR_REFERRAL_INVALID };
	}
	const referrerUserId = await findUserIdByReferralCode(code);
	if (!referrerUserId) {
		return { valid: false, errorMessage: ERR_REFERRAL_INVALID };
	}
	if (referrerUserId === buyerUserId) {
		return { valid: false, errorMessage: ERR_REFERRAL_SELF };
	}
	if (!isPlanEligibleForReferralDiscount(planKey)) {
		return { valid: false, errorMessage: ERR_REFERRAL_PLAN };
	}
	const [referrerEligible, firstPurchase] = await Promise.all([
		isReferrerEligible(referrerUserId),
		isBuyerFirstGalleryPurchase(buyerUserId)
	]);
	if (!referrerEligible) {
		return { valid: false, errorMessage: ERR_REFERRAL_INVALID };
	}
	if (!firstPurchase) {
		return { valid: false, errorMessage: ERR_REFERRAL_NOT_FIRST };
	}
	const { topInviterBadge, referralSuccessCount } = await getUserReferralFields(referrerUserId);
	const isTopInviter = !!topInviterBadge || (referralSuccessCount ?? 0) >= 10;
	const discountCents = getReferralDiscountForReferred(planKey, isTopInviter);
	return { valid: true, referrerUserId, discountCents, isTopInviter };
}

/**
 * Validate linked referrer (user.referredByUserId) for checkout. Same rules as code path; used when buyer signed up via invite link.
 * Uses stored referredDiscountPercent from buyer's user record (set at signup time) to ensure correct discount even if referrer account is deleted.
 */
export async function validateReferrerUserIdForCheckout(
	buyerUserId: string,
	referrerUserId: string,
	planKey: string
): Promise<ValidateReferralCodeResult> {
	if (!referrerUserId || referrerUserId === buyerUserId) {
		return { valid: false, errorMessage: ERR_REFERRAL_INVALID };
	}
	if (!isPlanEligibleForReferralDiscount(planKey)) {
		return { valid: false, errorMessage: ERR_REFERRAL_PLAN };
	}
	const [referrerEligible, firstPurchase, buyerUser] = await Promise.all([
		isReferrerEligible(referrerUserId),
		isBuyerFirstGalleryPurchase(buyerUserId),
		// Get buyer's user record to check stored referredDiscountPercent
		(async () => {
			const envProc = (globalThis as any).process || process;
			const usersTable = envProc?.env?.USERS_TABLE as string;
			if (!usersTable) return null;
			const ddb = getDocClient();
			const res = await ddb.send(new GetCommand({
				TableName: usersTable,
				Key: { userId: buyerUserId },
				ProjectionExpression: 'referredDiscountPercent'
			}));
			return res.Item as { referredDiscountPercent?: number } | null;
		})()
	]);
	if (!referrerEligible) {
		return { valid: false, errorMessage: ERR_REFERRAL_INVALID };
	}
	if (!firstPurchase) {
		return { valid: false, errorMessage: ERR_REFERRAL_NOT_FIRST };
	}
	
	// Use stored discount percent if available (set at signup time), otherwise check referrer's current status (for legacy users)
	let isTopInviter = false;
	const storedDiscountPercent = buyerUser?.referredDiscountPercent;
	if (storedDiscountPercent !== undefined) {
		// Use stored discount percent (determined at signup time)
		isTopInviter = storedDiscountPercent === 15;
	} else {
		// Legacy user: check referrer's current status
		const { topInviterBadge, referralSuccessCount } = await getUserReferralFields(referrerUserId);
		isTopInviter = !!topInviterBadge || (referralSuccessCount ?? 0) >= 10;
	}
	
	const discountCents = getReferralDiscountForReferred(planKey, isTopInviter);
	return { valid: true, referrerUserId, discountCents, isTopInviter };
}

/**
 * Append a new earned code to user's earnedDiscountCodes.
 */
export async function addEarnedCodeToUser(userId: string, type: EarnedDiscountType): Promise<EarnedDiscountCode> {
	const envProc = (globalThis as any).process || process;
	const usersTable = envProc?.env?.USERS_TABLE as string;
	if (!usersTable) throw new Error('USERS_TABLE is not set');
	const ddb = getDocClient();
	const entry = createEarnedCodeEntry(userId, type);
	const now = new Date().toISOString();
	await ddb.send(new UpdateCommand({
		TableName: usersTable,
		Key: { userId },
		UpdateExpression: 'SET earnedDiscountCodes = list_append(if_not_exists(earnedDiscountCodes, :empty), :code), updatedAt = :u',
		ExpressionAttributeValues: { ':empty': [], ':code': [entry], ':u': now }
	}));
	return entry;
}

/**
 * Mark an earned code as used for a gallery. Finds by codeId and sets used + usedOnGalleryId.
 */
export async function markEarnedCodeUsed(userId: string, codeId: string, galleryId: string): Promise<boolean> {
	const envProc = (globalThis as any).process || process;
	const usersTable = envProc?.env?.USERS_TABLE as string;
	if (!usersTable) return false;
	const { earnedDiscountCodes } = await getUserReferralFields(userId);
	const codes = earnedDiscountCodes || [];
	const idx = codes.findIndex((c) => c.codeId === codeId);
	if (idx < 0) return false;
	const ddb = getDocClient();
	const now = new Date().toISOString();
	await ddb.send(new UpdateCommand({
		TableName: usersTable,
		Key: { userId },
		UpdateExpression: `SET earnedDiscountCodes[${idx}].used = :used, earnedDiscountCodes[${idx}].usedOnGalleryId = :gid, updatedAt = :u`,
		ExpressionAttributeValues: { ':used': true, ':gid': galleryId, ':u': now }
	}));
	return true;
}

/**
 * Grant referrer reward for a successful referred purchase.
 * referralSuccessCount increases only once per referred user (after their first successful Stripe/wallet payment).
 * Idempotent by galleryId; idempotent by referredUserId (same referred user paying again does not increment count).
 * 1st/3rd: earned code (10% / free small). 10+: 20 PLN wallet credit + Top Inviter badge (no code).
 * @param referredUserId – the buyer (referred user) who made the purchase; used to count at most one success per referred user.
 */
export async function grantReferrerRewardForPurchase(
	referrerUserId: string,
	galleryId: string,
	referredUserId: string
): Promise<{ granted: boolean; rewardType?: EarnedDiscountType | 'wallet_20pln'; walletCreditCents?: number }> {
	const envProc = (globalThis as any).process || process;
	const usersTable = envProc?.env?.USERS_TABLE as string;
	if (!usersTable) return { granted: false };
	const ddb = getDocClient();
	const res = await ddb.send(new GetCommand({
		TableName: usersTable,
		Key: { userId: referrerUserId },
		ProjectionExpression: 'referralSuccessCount, #ids, #refIds, referralHistory, topInviterBadge',
		ExpressionAttributeNames: { '#ids': 'referralGalleryIds', '#refIds': 'referralReferredUserIds' }
	}));
	const item = res.Item as {
		referralSuccessCount?: number;
		referralGalleryIds?: string[];
		referralReferredUserIds?: string[];
		referralHistory?: ReferralHistoryEntry[];
		topInviterBadge?: boolean;
	} | undefined;
	const referralGalleryIds = item?.referralGalleryIds || [];
	const referralReferredUserIds = item?.referralReferredUserIds || [];

	// Idempotency: already processed this gallery (e.g. webhook retry)
	if (referralGalleryIds.includes(galleryId)) {
		return { granted: false };
	}

	// Already counted this referred user (their first purchase was earlier); only append galleryId for idempotency
	if (referralReferredUserIds.includes(referredUserId)) {
		const newIds = [...referralGalleryIds, galleryId];
		await ddb.send(new UpdateCommand({
			TableName: usersTable,
			Key: { userId: referrerUserId },
			UpdateExpression: 'SET referralGalleryIds = :ids, updatedAt = :u',
			ExpressionAttributeValues: { ':ids': newIds, ':u': new Date().toISOString() }
		}));
		return { granted: false };
	}

	const count = (item?.referralSuccessCount ?? 0) + 1;
	const now = new Date().toISOString();
	const newIds = [...referralGalleryIds, galleryId];
	const newRefIds = [...referralReferredUserIds, referredUserId];
	
	// Rewards are only granted at milestones: 1st, 3rd, and 10th referrals (one-time only)
	const isMilestone = count === 1 || count === 3 || count === 10;
	
	if (!isMilestone) {
		// Not a milestone - just update the count and tracking arrays, no reward
		await ddb.send(new UpdateCommand({
			TableName: usersTable,
			Key: { userId: referrerUserId },
			UpdateExpression: 'SET referralSuccessCount = :c, referralGalleryIds = :ids, referralReferredUserIds = :refIds, updatedAt = :u',
			ExpressionAttributeValues: {
				':c': count,
				':ids': newIds,
				':refIds': newRefIds,
				':u': now
			}
		}));
		return { granted: false };
	}
	
	// This is a milestone - grant the appropriate reward
	const is10th = count === 10;
	const rewardType = is10th ? 'wallet_20pln' : getRewardTypeForReferralCount(count);
	const newEntry: ReferralHistoryEntry = { date: now, rewardType };
	const newHistory = [...(item?.referralHistory || []), newEntry];
	const setBadge = is10th;

	if (is10th) {
		await ddb.send(new UpdateCommand({
			TableName: usersTable,
			Key: { userId: referrerUserId },
			UpdateExpression: 'SET referralSuccessCount = :c, referralGalleryIds = :ids, referralReferredUserIds = :refIds, referralHistory = :hist, updatedAt = :u' + (setBadge ? ', topInviterBadge = :badge' : ''),
			ExpressionAttributeValues: {
				':c': count,
				':ids': newIds,
				':refIds': newRefIds,
				':hist': newHistory,
				':u': now,
				...(setBadge ? { ':badge': true } : {})
			}
		}));
		return { granted: true, rewardType: 'wallet_20pln', walletCreditCents: REFERRAL_10_PLUS_WALLET_CENTS };
	}

	const earnedEntry = createEarnedCodeEntry(referrerUserId, rewardType as EarnedDiscountType);
	await ddb.send(new UpdateCommand({
		TableName: usersTable,
		Key: { userId: referrerUserId },
		UpdateExpression: 'SET referralSuccessCount = :c, referralGalleryIds = :ids, referralReferredUserIds = :refIds, referralHistory = :hist, earnedDiscountCodes = list_append(if_not_exists(earnedDiscountCodes, :empty), :code), updatedAt = :u',
		ExpressionAttributeValues: {
			':c': count,
			':ids': newIds,
			':refIds': newRefIds,
			':hist': newHistory,
			':empty': [],
			':code': [earnedEntry],
			':u': now
		}
	}));
	return { granted: true, rewardType: rewardType as EarnedDiscountType };
}
