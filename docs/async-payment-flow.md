# Async Payment Processing Flow - User Experience

## Overview

Our payment system uses **asynchronous processing** via AWS EventBridge for maximum reliability and robustness. This document explains the user-centric experience from start to finish.

## Why Async Processing?

- **Reliability**: EventBridge provides automatic retries if processing fails
- **Scalability**: Can handle high volumes without blocking user requests
- **Resilience**: If one component fails, EventBridge will retry automatically
- **Observability**: All events are logged and can be monitored in CloudWatch

## User Experience Flow

### 1. User Initiates Payment

**Where**: Dashboard (gallery page, wallet page, or galleries list)

**What happens**:
- User clicks "Publish Gallery", "Top Up Wallet", or "Pay for Gallery"
- Frontend calls `/pay` endpoint (dry run) to calculate payment method
- If Stripe is needed, frontend shows `StripeRedirectOverlay` immediately
- User is redirected to Stripe Checkout

**User sees**: Immediate feedback with redirect overlay

---

### 2. User Completes Payment in Stripe

**Where**: Stripe Checkout page (hosted by Stripe)

**What happens**:
- User enters payment details and completes payment
- Stripe processes the payment
- Stripe sends event to AWS EventBridge (asynchronously)
- Stripe redirects user back to our success endpoint

**User sees**: Standard Stripe checkout experience

---

### 3. Success Page - Processing Status

**Where**: `/payments/success?session_id=...` (our endpoint)

**What happens**:
- Success endpoint retrieves session metadata from Stripe
- Shows beautiful processing page with status messages
- **No synchronous processing** - payment processing happens async via EventBridge
- Page polls `/payments/check-status` endpoint every 2 seconds
- Once EventBridge processes the payment, status check returns `isProcessed: true`
- Page shows success and redirects to dashboard

**User sees**:
```
✓ Płatność zakończona pomyślnie
Twoja płatność została przetworzona.

[Status messages animate as they complete]
✓ Weryfikacja płatności
✓ Przetwarzanie transakcji
✓ Doładowywanie portfela (or "Aktywacja galerii")
✓ Aktualizacja salda

[Spinner]
Przekierowywanie do panelu...
```

**Status Messages by Payment Type**:
- **Wallet Top-up**: "Weryfikacja płatności", "Przetwarzanie transakcji", "Doładowywanie portfela", "Aktualizacja salda"
- **Gallery Payment**: "Weryfikacja płatności", "Przetwarzanie transakcji", "Aktywacja galerii", "Aktualizacja statusu"
- **Plan Upgrade**: "Weryfikacja płatności", "Przetwarzanie transakcji", "Aktualizacja planu", "Aktualizacja limitów"

**Polling Behavior**:
- Polls every 2 seconds
- Maximum 60 polls (2 minutes total)
- Shows "Oczekiwanie na przetworzenie płatności..." while waiting
- Once processed, shows "Płatność przetworzona pomyślnie! Przekierowywanie..."
- Redirects 2 seconds after processing completes

---

### 4. Async Processing (EventBridge)

**Where**: AWS EventBridge → Lambda Function (background)

**What happens** (user doesn't see this, but it's happening):
1. Stripe sends `checkout.session.completed` event to EventBridge
2. EventBridge routes event to `paymentsWebhookFn` Lambda
3. Lambda processes payment:
   - Credits wallet (if wallet top-up)
   - Updates transaction status to PAID
   - Activates gallery (if gallery payment)
   - Creates order (if needed)
   - Records payment in payments table
4. If processing fails, EventBridge automatically retries
5. After successful processing, status check endpoint will return `isProcessed: true`

**Timing**: Usually completes within 5-10 seconds, but can take up to 30 seconds

---

### 5. User Redirected to Dashboard

**Where**: Dashboard (gallery page, wallet page, or galleries list)

**What happens**:
- User is redirected with `?payment=success` query parameter
- Frontend detects success parameter and shows success notification
- User sees updated state:
  - Wallet balance updated (if top-up)
  - Gallery activated (if gallery payment)
  - Transaction marked as PAID

**User sees**: Success notification and updated UI state

---

## Cancel Flow

### User Cancels Payment

**Where**: Stripe Checkout page (user clicks "Back" or closes)

**What happens**:
- Stripe redirects to `/payments/cancel?session_id=...`
- Cancel endpoint marks transaction as CANCELED
- Clears any payment locks on gallery
- Shows cancellation page
- Redirects to dashboard after 2 seconds

**User sees**:
```
✕ Płatność anulowana
Płatność została anulowana. Możesz spróbować ponownie później.

[Status messages]
✓ Anulowanie transakcji
✓ Czyszczenie blokad
✓ Przygotowywanie przekierowania

Przekierowywanie do panelu...
```

---

## Error Handling

### If Status Check Fails

- Page continues polling (might be temporary network issue)
- After 60 polls (2 minutes), redirects anyway
- EventBridge will still process the payment in background
- User can refresh dashboard to see updated state

### If EventBridge Processing Fails

- EventBridge automatically retries (up to configured retry policy)
- User sees "Oczekiwanie na przetworzenie płatności..." for longer
- Eventually times out and redirects
- User can check transaction status in dashboard
- Support can manually retry if needed

---

## Key Benefits for Users

1. **Immediate Feedback**: User sees processing page right away, not a blank screen
2. **Real Status Updates**: Status messages update based on actual processing state
3. **Reliable**: Even if frontend fails, EventBridge ensures payment is processed
4. **Transparent**: User knows exactly what's happening at each step
5. **Fast**: Usually completes in 5-10 seconds, redirects as soon as ready

---

## Technical Architecture

```
User → Stripe Checkout → Success Endpoint (HTML page)
                              ↓
                    [Polls Status Endpoint]
                              ↓
                    EventBridge → Webhook Lambda
                              ↓
                    [Processes Payment]
                              ↓
                    Status Check Returns Success
                              ↓
                    User Redirected to Dashboard
```

---

## Status Check Endpoint

**Endpoint**: `GET /payments/check-status?session_id=...`

**Response**:
```json
{
  "sessionId": "cs_test_...",
  "isProcessed": true,
  "paymentStatus": "completed", // "pending", "processing", "completed", "canceled", "failed"
  "transactionStatus": "PAID",
  "paymentType": "wallet_topup"
}
```

**Checks**:
1. Payments table for processed payment record
2. Transaction status (if transactionId available)
3. Stripe session status (fallback)

---

## Summary

The async flow ensures:
- ✅ User always sees what's happening
- ✅ Payment is reliably processed even if frontend fails
- ✅ Automatic retries if processing fails
- ✅ Fast user experience (usually 5-10 seconds)
- ✅ Transparent status updates
- ✅ Graceful error handling

The system is **user-centric** because:
- Users are never left wondering what's happening
- Status updates are real, not fake
- System is resilient and reliable
- Errors are handled gracefully
- User can always check status in dashboard

