# PhotoHub Testing Cheatsheet

## Overview
This document provides a comprehensive testing guide for all flows in the PhotoHub application.

---

## 1. Gallery Creation Flows

### 1.1 Gallery Creation - Basic Plan (No Addon) - Wallet Payment
**Steps:**
1. Ensure wallet has sufficient balance (e.g., 10 PLN)
2. Create gallery with:
   ```json
   {
     "plan": "Basic",
     "selectionEnabled": true,
     "pricingPackage": {
       "packageName": "Basic",
       "includedCount": 1,
       "extraPriceCents": 500,
       "packagePriceCents": 0
     },
     "galleryName": "Test Gallery",
     "clientEmail": "client@example.com",
     "clientPassword": "password123"
   }
   ```
3. **Expected:**
   - Wallet debited: 7 PLN (Basic plan)
   - Gallery created with `state: "PAID_ACTIVE"`
   - No addon record created
   - Gallery appears in list with `hasBackupStorage: false`

### 1.2 Gallery Creation - Basic Plan (With Addon) - Wallet Payment
**Steps:**
1. Ensure wallet has sufficient balance (e.g., 10 PLN)
2. Create gallery with `hasBackupStorage: true`
3. **Expected:**
   - Wallet debited: 7 PLN (plan) + 2.10 PLN (addon) = **9.10 PLN**
   - Gallery created with `state: "PAID_ACTIVE"`
   - Addon record created in `GalleryAddonsTable`
   - Gallery appears in list with `hasBackupStorage: true`

### 1.3 Gallery Creation - Insufficient Wallet Balance - Stripe Redirect
**Steps:**
1. Ensure wallet has insufficient balance (e.g., 0 PLN)
2. Create gallery (with or without addon)
3. **Expected:**
   - Transaction created immediately with status `UNPAID` and type `GALLERY_PLAN`
   - Transaction stored with `paymentMethod: STRIPE`
   - Redirected to Stripe checkout
   - Stripe checkout shows correct line items:
     - Gallery plan (e.g., 7 PLN)
     - Addon (if requested, e.g., 2.10 PLN)
   - Transaction ID included in Stripe metadata
   - After payment, webhook updates transaction status to `PAID`
   - Gallery payment status derived from transaction (becomes `PAID_ACTIVE`)

### 1.3a Gallery Creation - Fractional Wallet Payment
**Steps:**
1. Ensure wallet has partial balance (e.g., 2 PLN, gallery costs 10 PLN)
2. Create gallery
3. **Expected:**
   - Transaction created with `paymentMethod: MIXED`
   - 2 PLN deducted from wallet immediately
   - Stripe checkout created for remaining 8 PLN
   - Transaction shows `walletAmountCents: 200` and `stripeAmountCents: 800`
   - Stripe checkout description shows wallet deduction
   - After Stripe payment, transaction status becomes `PAID`

### 1.4 Gallery Creation - Stripe Payment Success
**Steps:**
1. Create gallery with insufficient wallet balance
2. Complete Stripe payment
3. **Expected:**
   - Webhook processes payment
   - Gallery marked as `PAID_ACTIVE`
   - Addon created (if `hasBackupStorage: true` in metadata)
   - ZIP generation Lambda triggered (if addon created)

### 1.5 Gallery Creation - Payment Retry
**Steps:**
1. Create gallery with insufficient wallet balance
2. Don't complete Stripe payment (or click back)
3. Transaction status should be `UNPAID` or `CANCELED`
4. Click "Pay" button on gallery list
5. **Expected:**
   - System finds existing transaction (if UNPAID) or creates new one
   - Stripe checkout created with transaction ID
   - After payment, existing transaction updated to `PAID`

### 1.6 Gallery Creation - Payment Cancel
**Steps:**
1. Create gallery with insufficient wallet balance
2. Click "Cancel" button on gallery list
3. **Expected:**
   - Transaction status updated to `CANCELED`
   - Gallery deleted
   - Transaction remains in transaction history with CANCELED status

### 1.7 Gallery Creation - Auto-Expiry
**Steps:**
1. Create gallery with insufficient wallet balance
2. Wait 3+ days (or manually adjust transaction createdAt)
3. Run transaction expiry Lambda
4. **Expected:**
   - Transaction status updated to `CANCELED`
   - Gallery deleted
   - Transaction remains in history

---

## 2. Addon Purchase Flows

### 2.1 Purchase Addon - Wallet Payment (Sufficient Balance)
**Steps:**
1. Create gallery without addon
2. Ensure wallet has sufficient balance (e.g., 5 PLN)
3. Click "Buy Backup" button
4. **Expected:**
   - Transaction created immediately with type `ADDON_PURCHASE` and status `UNPAID`
   - Wallet debited: 30% of plan price (e.g., 2.10 PLN for Basic)
   - Transaction status updated to `PAID` (paymentMethod: WALLET)
   - Addon record created
   - ZIP generation Lambda triggered for existing orders
   - "Buy Backup" button disappears
   - Gallery shows `hasBackupStorage: true` in orders list
   - Transaction appears in wallet with type `WALLET_DEBIT`

### 2.2 Purchase Addon - Wallet Payment (Insufficient Balance) - Stripe Redirect
**Steps:**
1. Create gallery without addon
2. Ensure wallet has insufficient balance
3. Click "Buy Backup" button
4. **Expected:**
   - Transaction created with type `ADDON_PURCHASE` and status `UNPAID`
   - Transaction stored with `paymentMethod: STRIPE`
   - Redirected to Stripe checkout
   - Stripe checkout shows addon price only
   - Transaction ID included in Stripe metadata
   - After payment, webhook updates transaction to `PAID` and creates addon
   - ZIP generation Lambda triggered

### 2.2a Purchase Addon - Fractional Wallet Payment
**Steps:**
1. Create gallery without addon
2. Ensure wallet has partial balance (e.g., 1 PLN, addon costs 2.10 PLN)
3. Click "Buy Backup" button
4. **Expected:**
   - Transaction created with `paymentMethod: MIXED`
   - 1 PLN deducted from wallet
   - Stripe checkout for remaining 1.10 PLN
   - After Stripe payment, transaction becomes `PAID`

### 2.3 Purchase Addon - Already Purchased
**Steps:**
1. Create gallery with addon (or purchase addon)
2. Try to purchase addon again
3. **Expected:**
   - Error: "Backup storage addon already purchased for this gallery"
   - No duplicate charge

---

## 3. ZIP Generation & Download Flows

### 3.1 ZIP Generation - With Backup Addon (Automatic)
**Steps:**
1. Create gallery with `hasBackupStorage: true`
2. Client approves selection
3. **Expected:**
   - Order created with `zipKey` populated
   - ZIP automatically generated
   - "Download ZIP" button visible (persistent, not one-time)

### 3.2 ZIP Generation - Without Backup Addon (Manual)
**Steps:**
1. Create gallery without addon
2. Client approves selection
3. Click "Download ZIP" button (which triggers generate)
4. **Expected:**
   - ZIP generated via `/generate-zip` endpoint
   - Then automatically downloaded via `/zip` endpoint
   - ZIP deleted after first download
   - `zipKey` removed from order

### 3.3 ZIP Download - With Backup Addon (Persistent)
**Steps:**
1. Gallery has backup addon
2. Order has `zipKey`
3. Click "Download ZIP" multiple times
4. **Expected:**
   - ZIP available for all downloads
   - ZIP NOT deleted
   - Works even after order is DELIVERED

### 3.4 ZIP Download - Without Backup Addon (One-Time)
**Steps:**
1. Gallery has no backup addon
2. Order has `zipKey`
3. Click "Download ZIP"
4. **Expected:**
   - ZIP downloaded successfully
   - ZIP deleted from S3 after download
   - `zipKey` removed from order
   - Subsequent download attempts fail (no zipKey)

### 3.5 ZIP Generation After Addon Purchase
**Steps:**
1. Create gallery without addon
2. Client approves selection (no ZIP generated)
3. Purchase addon
4. **Expected:**
   - ZIP generation Lambda triggered
   - Existing orders get `zipKey` populated
   - ZIPs available for download

---

## 4. Order & Selection Flows

### 4.1 Client Selection - First Time
**Steps:**
1. Create gallery with `selectionEnabled: true`
2. Client logs in and selects photos
3. Client approves selection
4. **Expected:**
   - Order created with `deliveryStatus: "CLIENT_APPROVED"`
   - Overage calculated: `(selectedCount - includedCount) * extraPriceCents`
   - ZIP generated automatically (if addon exists)
   - Order shows in photographer dashboard

### 4.2 Client Selection - Purchase More (After Delivery)
**Steps:**
1. Gallery has delivered order
2. Client selects additional photos
3. Client approves selection
4. **Expected:**
   - New order created
   - All photos cost extra (no included count)
   - Overage = `selectedCount * extraPriceCents`

### 4.3 Selection Change Request
**Steps:**
1. Order with `CLIENT_APPROVED` status
2. Client requests changes
3. **Expected:**
   - Order status changes to `CHANGES_REQUESTED`
   - Client can modify selection
   - Photographer can approve changes

---

## 5. Final Photo Upload & Delivery Flows

### 5.1 Upload Final Photos - Without Backup Addon
**Steps:**
1. Order with `CLIENT_APPROVED` status
2. No backup addon
3. Upload first final photo
4. **Expected:**
   - Status changes to `PREPARING_DELIVERY`
   - **Originals/thumbs/previews DELETED immediately**
   - Warning shown before upload (if no addon)
   - Final photos stored in `/final/{orderId}/` prefix

### 5.2 Upload Final Photos - With Backup Addon
**Steps:**
1. Order with `CLIENT_APPROVED` status
2. Backup addon exists
3. Upload first final photo
4. **Expected:**
   - Status changes to `PREPARING_DELIVERY`
   - **Originals/thumbs/previews KEPT** (addon exists)
   - No warning shown
   - Final photos stored

### 5.3 Send Final Link - Without Backup Addon
**Steps:**
1. Order with `PREPARING_DELIVERY` status
2. No backup addon
3. Click "Send Final Link"
4. **Expected:**
   - Email sent to client
   - Status changes to `DELIVERED`
   - **Originals already deleted** (removed at PREPARING_DELIVERY)
   - No deletion attempt (already gone)

### 5.4 Send Final Link - With Backup Addon
**Steps:**
1. Order with `PREPARING_DELIVERY` status
2. Backup addon exists
3. Click "Send Final Link"
4. **Expected:**
   - Email sent to client
   - Status changes to `DELIVERED`
   - **Originals KEPT** (addon exists)
   - ZIP still available for download

---

## 6. Wallet & Payment Flows

### 6.1 Wallet Top-Up
**Steps:**
1. Navigate to wallet page
2. Enter amount (e.g., 100 PLN)
3. Complete Stripe payment
4. **Expected:**
   - Wallet credited with amount
   - Ledger entry created
   - Balance updated

### 6.2 Wallet Balance Check
**Steps:**
1. Navigate to wallet page
2. **Expected:**
   - Current balance displayed
   - Transaction history shown
   - Wallet created automatically if doesn't exist

### 6.3 Payment via Wallet (Insufficient Balance)
**Steps:**
1. Attempt gallery creation with insufficient wallet balance
2. **Expected:**
   - Wallet debit fails
   - Redirected to Stripe checkout
   - No partial charge

---

## 7. Gallery Management Flows

### 7.1 Gallery Deletion
**Steps:**
1. Create gallery with orders and addon
2. Delete gallery
3. **Expected:**
   - All S3 objects deleted (originals, previews, thumbs, final, zips, archive)
   - All orders deleted
   - **All addons deleted**
   - Gallery record deleted
   - Confirmation emails sent

### 7.2 Gallery List - Addon Status
**Steps:**
1. Create galleries with/without addons
2. View gallery list
3. **Expected:**
   - Each gallery shows correct `hasBackupStorage` status
   - "Buy Backup" button only shows when no addon

---

## 8. Edge Cases & Error Scenarios

### 8.1 Duplicate Addon Purchase
**Steps:**
1. Purchase addon
2. Try to purchase again
3. **Expected:**
   - Error: "Backup storage addon already purchased"
   - No duplicate charge

### 8.2 ZIP Generation Failure
**Steps:**
1. Purchase addon
2. Simulate ZIP generation failure
3. **Expected:**
   - Addon still created
   - Error logged
   - ZIP can be generated manually later

### 8.3 Wallet Debit Race Condition
**Steps:**
1. Two simultaneous gallery creations
2. Wallet balance exactly matches one creation
3. **Expected:**
   - One succeeds, one fails
   - Failed one redirects to Stripe
   - No double charge

### 8.4 Stripe Webhook Retry
**Steps:**
1. Complete Stripe payment
2. Webhook processes payment
3. **Expected:**
   - Idempotency check prevents duplicate processing
   - Payment recorded once
   - Addon created once (if applicable)

---

## 9. Testing Checklist

### Gallery Creation
- [ ] Basic plan, no addon, wallet payment
- [ ] Basic plan, with addon, wallet payment
- [ ] Standard plan, with addon, wallet payment
- [ ] Pro plan, with addon, wallet payment
- [ ] Insufficient wallet → Stripe redirect
- [ ] Stripe payment success → webhook creates addon
- [ ] Stripe payment success → ZIP generation triggered

### Addon Purchase
- [ ] Purchase addon with sufficient wallet balance
- [ ] Purchase addon with insufficient balance → Stripe
- [ ] Purchase addon when already purchased → error
- [ ] Addon purchase triggers ZIP generation for existing orders

### ZIP Operations
- [ ] ZIP auto-generated when addon exists + selection approved
- [ ] ZIP manually generated when no addon
- [ ] ZIP download with addon (persistent)
- [ ] ZIP download without addon (one-time, deleted)
- [ ] ZIP available after DELIVERED status (with addon)
- [ ] ZIP not available after DELIVERED status (without addon)

### Final Photo Upload
- [ ] Upload final photos without addon → originals deleted
- [ ] Upload final photos with addon → originals kept
- [ ] Warning shown before upload (no addon)
- [ ] No warning shown (with addon)

### Order Status Transitions
- [ ] CLIENT_SELECTING → CLIENT_APPROVED
- [ ] CLIENT_APPROVED → PREPARING_DELIVERY (first final upload)
- [ ] PREPARING_DELIVERY → DELIVERED (send final link)
- [ ] CLIENT_APPROVED → CHANGES_REQUESTED

### Gallery Deletion
- [ ] Gallery with orders deleted
- [ ] Gallery with addon deleted → addon removed
- [ ] Gallery with S3 objects deleted → all objects removed
- [ ] Confirmation emails sent

---

## 10. Key Test Data

### Wallet Balances
- **Sufficient**: 20 PLN (covers Basic + addon)
- **Insufficient**: 5 PLN (covers Basic only)
- **Empty**: 0 PLN (triggers Stripe)

### Pricing Packages
- **Basic**: includedCount: 1, extraPriceCents: 500 (5 PLN)
- **Standard**: includedCount: 5, extraPriceCents: 300 (3 PLN)
- **Pro**: includedCount: 10, extraPriceCents: 200 (2 PLN)

### Addon Prices (30% of plan)
- **Basic (7 PLN)**: 2.10 PLN
- **Standard (10 PLN)**: 3.00 PLN
- **Pro (15 PLN)**: 4.50 PLN

---

## 11. API Endpoints to Test

### Gallery Endpoints
- `POST /galleries` - Create gallery (with/without addon)
- `GET /galleries` - List galleries (check hasBackupStorage)
- `GET /galleries/{id}` - Get gallery details
- `DELETE /galleries/{id}` - Delete gallery (check addon deletion)

### Order Endpoints
- `GET /galleries/{id}/orders` - List orders (check gallery.hasBackupStorage)
- `GET /galleries/{id}/orders/{orderId}` - Get order (check hasBackupStorage)
- `POST /galleries/{id}/orders/{orderId}/generate-zip` - Generate ZIP
- `GET /galleries/{id}/orders/{orderId}/zip` - Download ZIP
- `POST /galleries/{id}/purchase-addon` - Purchase addon

### Payment Endpoints
- `POST /payments/webhook` - Stripe webhook (check addon creation)
- `GET /wallet/balance` - Check wallet balance

---

## 12. Verification Points

### After Gallery Creation
- [ ] Wallet balance decreased by correct amount
- [ ] Gallery record created with correct state
- [ ] Addon record created (if requested)
- [ ] Environment variables set correctly

### After Addon Purchase
- [ ] Wallet debited (or Stripe checkout shown)
- [ ] Addon record created in `GalleryAddonsTable`
- [ ] ZIP generation Lambda invoked
- [ ] Existing orders have `zipKey` populated

### After ZIP Generation
- [ ] ZIP file exists in S3 (`galleries/{galleryId}/zips/{orderId}.zip`)
- [ ] Order record has `zipKey` populated
- [ ] ZIP contains correct photos

### After Final Photo Upload
- [ ] Order status = `PREPARING_DELIVERY`
- [ ] Originals deleted (if no addon) OR kept (if addon)
- [ ] Final photos stored in S3

### After Send Final Link
- [ ] Order status = `DELIVERED`
- [ ] Email sent to client
- [ ] Originals status unchanged (already handled at PREPARING_DELIVERY)

---

## 13. Common Issues to Watch For

1. **Addon not created**: Check wallet balance, check logs for errors
2. **ZIP not generated**: Check `GENERATE_ZIPS_FOR_ADDON_FN_NAME` env var, check Lambda logs
3. **Originals not deleted**: Check addon status, check `uploadFinal.ts` logs
4. **Wallet not debited**: Check wallet table permissions, check balance
5. **Stripe redirect not working**: Check `checkoutUrl` in response, check Stripe config
6. **hasBackupStorage wrong**: Check `galleryAddons` table permissions, check `hasAddon` function

---

## 14. Quick Test Scenarios

### Scenario A: Happy Path with Addon
1. Create gallery with `hasBackupStorage: true`, wallet payment
2. Client approves selection → ZIP auto-generated
3. Upload final photos → originals kept
4. Send final link → ZIP still available

### Scenario B: Happy Path without Addon
1. Create gallery without addon, wallet payment
2. Client approves selection → no ZIP
3. Upload final photos → originals deleted, warning shown
4. Generate ZIP manually → one-time download
5. Send final link → ZIP already deleted

### Scenario C: Addon Purchase After Creation
1. Create gallery without addon
2. Client approves selection → no ZIP
3. Purchase addon → ZIPs generated for existing orders
4. Upload final photos → originals kept (addon now exists)

### Scenario D: Stripe Payment Flow
1. Create gallery with insufficient wallet → Stripe redirect
2. Complete payment → webhook processes
3. Addon created (if requested)
4. ZIPs generated (if addon)

---

## Notes

- All prices are in PLN (Polish Zloty)
- Wallet amounts are stored in cents (e.g., 700 = 7.00 PLN)
- Addon prices are calculated as 30% of photographer's plan price
- ZIP generation is asynchronous (check Lambda logs if issues)
- Originals deletion happens at `PREPARING_DELIVERY`, not `DELIVERED`

