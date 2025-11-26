# User Flow Simulation - Identified Issues

## Flow 1: Gallery Creation → Upload → Pay

### Scenario: Normal Happy Path
1. User creates gallery (DRAFT, no plan)
2. User uploads 2GB of photos
3. User clicks "Opłać galerię"
4. System calculates plan → suggests 3GB plan
5. User selects plan and pays
6. Gallery becomes PAID_ACTIVE

**Status**: ✅ Works correctly

---

### Scenario: Upload Exceeds 10GB Before Payment
1. User creates gallery (DRAFT, no plan)
2. User uploads 5GB → OK
3. User uploads another 5GB → OK (total 10GB)
4. User tries to upload 1GB more → **BLOCKED** (exceeds 10GB limit)
5. User clicks "Opłać galerię"
6. System calculates plan → suggests 10GB plan (largest)
7. User pays for 10GB plan
8. User tries to upload more → **STILL BLOCKED** (already at 10GB limit)

**Issue #1**: ⚠️ **Business Logic Issue**
- User uploaded exactly 10GB to draft gallery
- After payment, they're at 100% capacity
- Cannot upload any more photos even after paying
- **Impact**: Poor user experience - user paid but can't use the gallery

**Recommendation**: 
- Either: Allow slight overage (e.g., 5%) for paid galleries
- Or: Warn user before payment if they're at/near 10GB limit
- Or: Suggest next tier plan if uploaded size is close to limit

---

### Scenario: Race Condition - Concurrent Uploads
1. User creates gallery (DRAFT)
2. User opens two browser tabs
3. Tab 1: Uploads 5GB → presign checks: currentSize=0, fileSize=5GB → OK
4. Tab 2: Uploads 5GB → presign checks: currentSize=0, fileSize=5GB → OK (race condition!)
5. Both uploads complete → total = 10GB
6. User tries to upload 1GB more → **BLOCKED**

**Issue #2**: ⚠️ **Technical Issue - Race Condition**
- `presign.ts` calculates `currentSize` from S3 at request time
- If two uploads happen simultaneously, both see same `currentSize`
- Both pass validation, but total exceeds limit
- **Impact**: User can exceed 10GB limit through concurrent uploads

**Current Mitigation**: Post-upload validation catches this, but files already uploaded
**Recommendation**: 
- Add optimistic locking or atomic counter
- Or: Accept that post-upload validation will catch it (current approach)
- Show clear error message in LimitExceededModal

---

### Scenario: Upload Size Calculation Mismatch
1. User creates gallery (DRAFT)
2. User uploads photos → `onUploadResize` updates `originalsBytesUsed`
3. User clicks "Opłać galerię"
4. System calculates plan using S3 size (`calculateOriginalsSize`)
5. **Mismatch**: S3 size ≠ `originalsBytesUsed` (if processing failed or in progress)

**Issue #3**: ⚠️ **Technical Issue - Data Consistency**
- `originalsBytesUsed` updated by `onUploadResize` Lambda (async)
- `calculatePlan` reads from S3 directly
- If Lambda hasn't processed all images yet, sizes won't match
- **Impact**: Plan calculated on wrong size, user pays wrong amount

**Current Mitigation**: `calculatePlan` uses S3 as source of truth (correct)
**Recommendation**: 
- ✅ Current approach is correct (S3 is source of truth)
- Consider: Show warning if `originalsBytesUsed` differs significantly from S3 size
- Or: Wait for processing to complete before allowing payment

---

## Flow 2: Plan Calculation & Payment

### Scenario: User Uploads 50GB to Draft Gallery
1. User creates gallery (DRAFT)
2. User somehow uploads 50GB (bypassing 10GB limit - see Issue #2)
3. User clicks "Opłać galerię"
4. System calculates plan → suggests 10GB plan (largest available)
5. User pays for 10GB plan
6. **Problem**: User has 50GB uploaded but only paid for 10GB

**Issue #4**: ⚠️ **Business Logic Issue**
- `calculateBestPlan` returns largest plan if nothing fits
- User can pay for plan that doesn't fit their uploads
- **Impact**: User pays but immediately exceeds limit

**Current Mitigation**: `validateUploadLimits` catches this after payment
**Recommendation**: 
- Check before payment: If uploaded size > largest plan, show warning
- Require user to delete excess files before payment
- Or: Offer custom plan for oversized galleries

---

### Scenario: User Calculates Plan, Then Uploads More Before Payment
1. User creates gallery (DRAFT)
2. User uploads 2GB
3. User clicks "Opłać galerię" → calculates 3GB plan
4. Pricing modal shows 3GB plan
5. **User uploads 3GB more** (total 5GB) before selecting plan
6. User selects 3GB plan and pays
7. **Problem**: User paid for 3GB but has 5GB uploaded

**Issue #5**: ⚠️ **Business Logic Issue - Stale Plan Calculation**
- Plan calculated at one point in time
- User can upload more before payment
- Payment uses stale plan calculation
- **Impact**: User pays for plan that doesn't fit

**Recommendation**: 
- Recalculate plan on payment if time elapsed > threshold (e.g., 5 minutes)
- Or: Lock uploads after plan calculation until payment completes
- Or: Show warning if uploaded size changed since calculation

---

### Scenario: User Selects Plan, Payment Fails, Then Uploads More
1. User creates gallery (DRAFT)
2. User uploads 2GB
3. User calculates plan → 3GB plan suggested
4. User selects 3GB plan → gallery updated with plan
5. User clicks pay → Stripe checkout fails (card declined)
6. **Gallery still has plan set but is unpaid**
7. User uploads 3GB more (total 5GB)
8. User retries payment → pays for 3GB plan
9. **Problem**: User paid for 3GB but has 5GB

**Issue #6**: ⚠️ **Business Logic Issue - Partial State**
- Gallery has plan set but payment failed
- User can continue uploading
- Payment succeeds later with stale plan
- **Impact**: User pays for plan that doesn't fit

**Recommendation**: 
- Clear plan if payment fails (revert to draft state)
- Or: Lock uploads once plan is set until payment succeeds
- Or: Recalculate plan before payment if gallery state changed

---

## Flow 3: Plan Upgrade

### Scenario: Upgrade to Same Duration, Larger Size
1. User has paid gallery with 3GB-3m plan
2. User uploads 5GB (exceeds 3GB limit)
3. System suggests 10GB-3m upgrade
4. User upgrades → pays difference (10GB-3m price - 3GB-3m price)
5. ✅ Works correctly

---

### Scenario: Upgrade Across Duration (Edge Case)
1. User has paid gallery with 3GB-1m plan (1200 cents)
2. User uploads 5GB (exceeds limit)
3. System suggests 10GB-3m plan (1600 cents)
4. User upgrades → pays difference: 1600 - 1200 = 400 cents
5. **Problem**: User paid for 1 month originally, now has 3 months
6. **Business Question**: Should upgrade extend duration or keep original expiry?

**Issue #7**: ⚠️ **Business Logic Issue - Duration Handling**
- Current implementation: Upgrade changes both size AND duration
- User might not want longer duration
- **Impact**: User pays for duration they didn't request

**Recommendation**: 
- Clarify business rules: Does upgrade extend duration or keep original?
- If extend: Calculate prorated cost for remaining time
- If keep: Only upgrade size, keep original expiry date
- Update `upgradePlan.ts` to handle duration correctly

---

### Scenario: Upgrade Price Difference Calculation
1. User has 3GB-3m plan (1400 cents, selection gallery)
2. User upgrades to 10GB-3m plan (1600 cents, selection gallery)
3. Difference: 1600 - 1400 = 200 cents ✅ Correct

**But if gallery type changed:**
1. User creates selection gallery, pays for 3GB-3m (1400 cents)
2. User changes gallery type to non-selection (20% discount)
3. User uploads more, needs upgrade
4. System calculates: 10GB-3m non-selection = 1280 cents (1600 * 0.8)
5. Current price (with discount): 1120 cents (1400 * 0.8)
6. Difference: 1280 - 1120 = 160 cents
7. **Problem**: User originally paid 1400, but upgrade uses discounted price

**Issue #8**: ⚠️ **Business Logic Issue - Discount Application**
- Upgrade uses current gallery type to calculate prices
- If gallery type changed, upgrade price doesn't match original payment
- **Impact**: Price inconsistency, potential refund issues

**Recommendation**: 
- Store original plan price in transaction metadata
- Use original price for upgrade calculation
- Or: Don't allow gallery type change after payment
- Or: Recalculate upgrade based on original purchase price

---

## Flow 4: Draft Expiry & Cleanup

### Scenario: User Uploads 8GB, Doesn't Pay, Gallery Expires
1. User creates gallery (DRAFT)
2. User uploads 8GB of photos
3. User doesn't pay within 3 days
4. DynamoDB TTL deletes gallery
5. S3 objects remain (8GB of storage)
6. **Problem**: Orphaned S3 objects consume storage

**Issue #9**: ⚠️ **Technical Issue - Orphaned Storage**
- DynamoDB TTL deletes gallery record
- `onGalleryExpired` Lambda should clean up S3
- If Lambda fails, S3 objects remain
- **Impact**: Storage costs accumulate

**Current Mitigation**: `onGalleryExpired` Lambda invokes delete function
**Recommendation**: 
- ✅ Current approach should work
- Add monitoring for failed cleanup jobs
- Consider: S3 lifecycle policy to delete objects older than 3 days in draft galleries

---

### Scenario: User Pays Right Before Expiry
1. User creates gallery (DRAFT) at Day 0
2. User uploads photos
3. At Day 2.9, user clicks "Opłać galerię"
4. User goes through Stripe checkout (takes 2 minutes)
5. Stripe webhook processes payment
6. **Race Condition**: TTL might expire before webhook processes
7. Gallery deleted even though payment succeeded

**Issue #10**: ⚠️ **Technical Issue - Race Condition**
- TTL is set at creation time (3 days)
- Payment webhook might arrive after TTL expires
- DynamoDB TTL deletion is eventually consistent (can take up to 48 hours)
- **Impact**: Low risk, but possible edge case

**Current Mitigation**: TTL deletion is eventually consistent (gives buffer)
**Recommendation**: 
- ✅ Current approach should be safe (TTL deletion is delayed)
- Consider: Extend TTL when payment is initiated (before Stripe redirect)
- Or: Check TTL before processing webhook payment

---

## Flow 5: Concurrent Operations

### Scenario: User Calculates Plan in Two Tabs
1. User opens gallery in two browser tabs
2. Tab 1: Clicks "Opłać galerię" → calculates plan → shows pricing modal
3. Tab 2: Clicks "Opłać galerię" → calculates plan → shows pricing modal
4. Tab 1: User selects 3GB-3m plan → updates gallery
5. Tab 2: User selects 10GB-3m plan → updates gallery (overwrites Tab 1)
6. Tab 1: User pays → pays for 3GB plan
7. **Problem**: Gallery has 10GB plan but user paid for 3GB

**Issue #11**: ⚠️ **Technical Issue - Race Condition**
- Multiple plan selections can overwrite each other
- Payment uses gallery's current plan (might be different from what user selected)
- **Impact**: User pays wrong amount

**Recommendation**: 
- Add optimistic locking (version number) to gallery updates
- Or: Store selected plan in transaction, not gallery (until payment succeeds)
- Or: Disable plan selection once payment initiated

---

### Scenario: User Uploads While Payment Processing
1. User uploads photos to draft gallery
2. User clicks "Opłać galerię" → calculates plan → selects plan
3. User redirected to Stripe checkout
4. **While on Stripe page**: User opens new tab, uploads more photos
5. User completes Stripe payment
6. Webhook processes payment → gallery becomes PAID_ACTIVE
7. **Problem**: Gallery paid but has more photos than plan allows

**Issue #12**: ⚠️ **Business Logic Issue - Concurrent Operations**
- User can upload while payment is processing
- Payment succeeds with stale gallery state
- **Impact**: User pays for plan that doesn't fit

**Recommendation**: 
- Lock uploads once plan is set (before payment)
- Or: Recalculate plan before webhook processes payment
- Or: Show warning if gallery state changed during payment

---

## Flow 6: Edge Cases

### Scenario: User Deletes Photos After Plan Calculation
1. User uploads 5GB
2. User calculates plan → suggests 10GB plan
3. User deletes 3GB of photos (now 2GB)
4. User selects 10GB plan and pays
5. **Problem**: User overpaid (could have used 3GB plan)

**Issue #13**: ⚠️ **Business Logic Issue - Photo Deletion**
- Plan calculated based on uploads
- User can delete photos before payment
- User pays for larger plan than needed
- **Impact**: User overpays

**Recommendation**: 
- Recalculate plan before payment if photos deleted
- Or: Show warning if uploaded size decreased since calculation
- Or: Allow plan recalculation in pricing modal

---

### Scenario: User Changes Gallery Type After Upload
1. User creates selection gallery
2. User uploads 5GB
3. User calculates plan → suggests 10GB plan (standard price)
4. User changes gallery type to non-selection (20% discount)
5. User selects plan → pays discounted price
6. **Problem**: Plan calculated with standard price, but paid with discount

**Issue #14**: ⚠️ **Business Logic Issue - Gallery Type Change**
- Plan calculation uses current gallery type
- User can change type between calculation and payment
- Price mismatch between calculation and payment
- **Impact**: Inconsistent pricing

**Recommendation**: 
- Lock gallery type once photos uploaded
- Or: Recalculate plan if gallery type changed
- Or: Show warning if gallery type changed

---

## Summary of Critical Issues

### High Priority (Business Impact)
1. **Issue #1**: User at 100% capacity after payment - cannot use gallery
2. **Issue #4**: User can pay for plan that doesn't fit uploads
3. **Issue #5**: Stale plan calculation - user uploads more before payment
4. **Issue #6**: Partial state - plan set but payment failed, user continues uploading
5. **Issue #7**: Duration handling in upgrades unclear

### Medium Priority (Data Consistency)
6. **Issue #2**: Race condition in concurrent uploads
7. **Issue #11**: Race condition in concurrent plan selections
8. **Issue #12**: User uploads while payment processing

### Low Priority (Edge Cases)
9. **Issue #3**: Size calculation mismatch (mitigated by using S3 as source of truth)
10. **Issue #8**: Discount application in upgrades
11. **Issue #9**: Orphaned storage (mitigated by cleanup Lambda)
12. **Issue #10**: TTL race condition (low risk due to eventual consistency)
13. **Issue #13**: Photo deletion before payment
14. **Issue #14**: Gallery type change before payment

---

## Recommended Fixes

### ✅ IMPLEMENTED FIXES (User-Centric Approach)

#### Fix #1: Capacity Warning Before Payment ✅
- **Implementation**: Added capacity warnings in `GalleryPricingModal.tsx`
- **Behavior**: Shows warning if usage ≥95% (critical) or ≥80% (info)
- **User Benefit**: Users are informed before payment if they're near capacity
- **Location**: `frontend/dashboard/components/galleries/GalleryPricingModal.tsx`

#### Fix #2: Prevent Payment if Uploaded Size Exceeds Plan ✅
- **Implementation**: Added validation in `pay.ts` before payment processing
- **Behavior**: Recalculates uploaded size from S3 and blocks payment if exceeds plan limit
- **User Benefit**: Prevents users from paying for plans that don't fit their uploads
- **Location**: `backend/functions/galleries/pay.ts` (lines 427-475)

#### Fix #3: Recalculate Plan Before Payment ✅
- **Implementation**: Always recalculates uploaded size from S3 before payment
- **Behavior**: Uses S3 as source of truth, compares against selected plan
- **User Benefit**: Ensures payment uses current gallery state, not stale calculations
- **Location**: `backend/functions/galleries/pay.ts` (lines 427-475)

#### Fix #4: Lock Uploads During Payment ✅
- **Implementation**: Added `paymentLocked` flag to galleries
- **Behavior**: 
  - Set when payment is initiated (`pay.ts`)
  - Blocks uploads in `presign.ts` if `paymentLocked === true`
  - Removed when payment succeeds (webhook or wallet payment)
- **User Benefit**: Prevents concurrent uploads during payment, ensuring payment uses correct state
- **Location**: 
  - `backend/functions/galleries/pay.ts` (line 595)
  - `backend/functions/uploads/presign.ts` (lines 70-80)
  - `backend/functions/payments/webhook.ts` (line 217)

#### Fix #5: Duration Handling in Upgrades ✅
- **Implementation**: Upgrades keep original expiry date, only upgrade storage size
- **Behavior**: `upgradePlan.ts` only updates plan, price, and storage limits - keeps `expiresAt` unchanged
- **User Benefit**: Users don't pay for duration they didn't request
- **Location**: `backend/functions/galleries/upgradePlan.ts` (lines 281-293)

#### Fix #6: Store Plan in Transaction Metadata ✅
- **Implementation**: Enhanced transaction metadata to store plan details
- **Behavior**: Stores plan, price, limits, and calculation timestamp in transaction
- **User Benefit**: Prevents race conditions where plan is overwritten before payment
- **Location**: `backend/functions/galleries/pay.ts` (lines 560-580)

#### Fix #7: Enhanced Plan Calculation with Warnings ✅
- **Implementation**: `calculatePlan.ts` now returns capacity warnings and next tier suggestions
- **Behavior**: Returns `usagePercentage`, `isNearCapacity`, `isAtCapacity`, `exceedsLargestPlan`, `nextTierPlan`
- **User Benefit**: Frontend can show proactive warnings and suggest upgrades
- **Location**: `backend/functions/galleries/calculatePlan.ts` (lines 184-230)

### Monitoring Needed:
1. Track cases where uploaded size > plan limit after payment
2. Track plan calculation → payment time gaps
3. Track concurrent operations on same gallery
4. Monitor orphaned S3 objects
5. Monitor `paymentLocked` flags that remain set (should be cleared on payment success)

### Business Rules Clarified:
1. ✅ **Upgrade duration**: Upgrades keep original expiry date, only upgrade storage size
2. ⚠️ **Gallery type change**: Still allowed after upload - consider locking if needed
3. ⚠️ **Photo deletion before payment**: Still allowed - consider warning if size decreases significantly
4. ✅ **Exceed limit after payment**: Handled by `validateUploadLimits` and `LimitExceededModal`

### ✅ ADDITIONAL FIXES IMPLEMENTED

#### Fix #8: Gallery Type Change Restriction ✅
- **Implementation**: Modified `setSelectionMode.ts` to only allow upgrades (non-selection → selection)
- **Behavior**: Blocks downgrades (selection → non-selection) with clear error message
- **User Benefit**: Maintains pricing consistency - users can't switch to cheaper type after upload
- **Location**: `backend/functions/galleries/setSelectionMode.ts`

#### Fix #9: Optimistic Locking with Version Numbers ✅
- **Implementation**: Added `version` field to galleries, incremented on every update
- **Behavior**: 
  - Gallery creation sets `version: 1`
  - Updates can include `version` in request body for optimistic locking
  - If version mismatch, returns `409 Conflict` with clear message
  - Version always incremented on successful update
- **User Benefit**: Prevents concurrent updates from overwriting each other, clear error message guides user to refresh
- **Location**: 
  - `backend/functions/galleries/create.ts` (sets initial version)
  - `backend/functions/galleries/update.ts` (implements version checking)

#### Fix #10: Payment Failure Recovery ✅
- **Implementation**: Clear `paymentLocked` flag when payment fails/cancels
- **Behavior**: 
  - Cleared on payment cancellation (`payments/cancel.ts`)
  - Cleared on payment failure (`payments/webhook.ts` - `payment_intent.payment_failed`)
  - Cleared on payment cancellation (`payments/webhook.ts` - `payment_intent.canceled`)
  - Cleared on session expiry (`payments/webhook.ts` - `checkout.session.expired`)
- **User Benefit**: Users can retry payment or continue uploading after payment failure
- **Location**: 
  - `backend/functions/payments/cancel.ts`
  - `backend/functions/payments/webhook.ts`

### Remaining Considerations:
1. ✅ **Gallery Type Change**: Only upgrades allowed (non-selection → selection) - IMPLEMENTED
2. ✅ **Photo Deletion Before Payment**: Allowed as-is - No warning needed (user decision)
3. ✅ **Optimistic Locking**: Implemented with version numbers - IMPLEMENTED
4. ✅ **Payment Failure Recovery**: `paymentLocked` cleared on failure/cancellation - IMPLEMENTED

