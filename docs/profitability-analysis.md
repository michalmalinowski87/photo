# PhotoCloud Profitability & Cost Analysis

## Executive Summary

This document analyzes the profitability and cost structure of PhotoCloud galleries across different pricing plans and usage scenarios. Key findings:

- **VAT**: 23% paid by PhotoCloud (not client)
- **Stripe Fees**: 
  - Gallery payments: Client pays fees (2.9% + 1 PLN added to charge)
  - Wallet top-ups: PhotoCloud covers fees (2.9% + 1 PLN deducted from received amount)
- **Storage**: Multi-tier system (originals, previews, thumbnails, finals, ZIPs)

---

## Pricing Plans

| Plan Key | Storage | Duration | Price (PLN) | Price (cents) |
|----------|---------|----------|-------------|---------------|
| 1GB-1m   | 1 GB    | 1 month  | 5.00        | 500           |
| 1GB-3m   | 1 GB    | 3 months | 8.00        | 800           |
| 1GB-12m  | 1 GB    | 12 months| 17.00       | 1700          |
| 3GB-1m   | 3 GB    | 1 month  | 8.00        | 800           |
| 3GB-3m   | 3 GB    | 3 months | 10.00       | 1000          |
| 3GB-12m  | 3 GB    | 12 months| 23.00       | 2300          |
| 10GB-1m  | 10 GB   | 1 month  | 10.00       | 1000          |
| 10GB-3m  | 10 GB   | 3 months | 14.00       | 1400          |
| 10GB-12m | 10 GB   | 12 months| 28.00       | 2800          |

---

## Revenue Calculation

### For Gallery Payments (Client Pays Stripe Fees)

**Client Charge Amount:**
- Base price: `priceCents`
- Stripe fee: `(priceCents * 0.029) + 100` cents
- **Total client pays**: `priceCents + stripeFee`

**PhotoCloud Receives:**
- From Stripe: `priceCents` (Stripe deducts fees from client payment)
- After VAT (23%): `priceCents / 1.23`

**Net Revenue After VAT:**
```
Net Revenue = priceCents / 1.23
```

### For Wallet Top-Ups (PhotoCloud Covers Stripe Fees)

**Client Charge Amount:**
- Top-up amount: `amountCents`
- **Total client pays**: `amountCents`

**PhotoCloud Receives:**
- From Stripe: `amountCents - stripeFee` (Stripe deducts fees)
- Stripe fee: `(amountCents * 0.029) + 100`
- Net from Stripe: `amountCents - ((amountCents * 0.029) + 100)`
- After VAT (23%): `(amountCents - stripeFee) / 1.23`

**Net Revenue After VAT:**
```
Net Revenue = (amountCents - ((amountCents * 0.029) + 100)) / 1.23
```

---

## Cost Structure Per Gallery

### 1. AWS Infrastructure Costs

#### S3 Storage Costs (eu-central-1 pricing, ~$0.023/GB/month)

**Storage Components:**
- **Originals**: Full-size uploaded photos (varies by plan: 1GB, 3GB, or 10GB)
- **Previews**: 1400px WebP (~0.8-1.2MB each, ~80-120KB per photo average)
- **Thumbnails**: 600px WebP (~80-200KB each, ~100KB per photo average)
- **BigThumbs**: 600px WebP (~80-120KB each, ~100KB per photo average)
- **Finals**: Processed final photos (similar to originals)
- **ZIPs**: Kept until gallery expiration (via S3 Expires header), Intelligent-Tiering storage class

**Estimated Storage Multiplier:**
- For selection galleries: Originals + Previews + Thumbnails + BigThumbs + Finals
- Assuming average photo size: 5MB original → ~200KB preview + ~100KB thumb + ~100KB bigthumb
- **Storage multiplier**: ~1.08x (originals + optimized versions)
- For non-selection galleries: Originals + Previews + Thumbnails + BigThumbs (no separate finals)
- **Storage multiplier**: ~1.04x

**Monthly Storage Cost:**

**Important Note on Intelligent-Tiering:**
- Intelligent-Tiering is used for **originals, finals, and ZIP files**
- Originals and finals are uploaded with `StorageClass: 'INTELLIGENT_TIERING'` (configured in `presign.ts`, `presignMultipart.ts`, `presignBatch.ts`, `uploadFinal.ts`, `uploadFinalBatch.ts`)
- ZIP files also use Intelligent-Tiering (configured in `createZip.ts` and `zipMerge.ts`)
- Previews, thumbnails, and bigthumbs use **standard S3 storage class** (small files, frequently accessed)
- **Intelligent-Tiering Cost Savings:**
  - First 30 days: Same as Standard ($0.023/GB/month)
  - After 30 days: Automatic Tiering (IA) - $0.0125/GB/month (46% savings)
  - After 90 days: Archive Instant Access - $0.004/GB/month (83% savings)
  - Monitoring fee: $0.0025 per 1,000 objects/month (negligible)
- **Conservative Estimate:** Average 30% savings after first month for Intelligent-Tiering objects
- **Storage Cost Calculation:**
  - Originals + Finals: Intelligent-Tiering (30% savings after first month)
  - Previews + Thumbnails + BigThumbs: Standard storage
  - ZIPs: Intelligent-Tiering (30% savings after first month)
```
Storage Cost (PLN/month) ≈ (originalsFinalsGB * 0.70 * 0.023 * 4.0) + (previewsThumbsGB * 0.023 * 4.0) + (zipsGB * 0.70 * 0.023 * 4.0)
                         ≈ (planSizeGB * 0.70 * 0.099) + (planSizeGB * 0.08 * 0.099) + (zipsGB * 0.70 * 0.099)
                         ≈ (planSizeGB * 0.077) + (zipsGB * 0.069)
                         
Where:
- originalsFinalsGB ≈ planSizeGB (main storage)
- previewsThumbsGB ≈ planSizeGB * 0.08 (optimized versions)
- zipsGB ≈ varies (depends on order count, typically small)
```

#### DynamoDB Costs (Pay-per-request)

**Estimated Operations Per Gallery:**
- Gallery creation: 1 write
- Image uploads: 1 write per image
- Image listings: ~10-50 reads per gallery view
- Order creation: 1 write
- Payment processing: 2-3 writes

**Cost Estimate:**
- Write: $1.25 per million
- Read: $0.25 per million
- **Estimated**: ~$0.01-0.05 per gallery (negligible)

#### Lambda Costs

**Estimated Invocations Per Gallery:**
- Gallery creation: 1 invocation (~100ms)
- Image uploads: 1 invocation per image (~200ms average)
- Payment processing: 2-3 invocations (~500ms total)
- Gallery views: ~5-10 invocations per month (~100ms each)

**Cost Estimate:**
- $0.20 per 1M requests
- $0.0000166667 per GB-second (256MB, 1 second)
- **Estimated**: ~$0.01-0.03 per gallery/month

#### CloudFront Costs

**Estimated Data Transfer:**
- Free tier: 1TB/month, 10M requests/month
- Beyond free tier: $0.085/GB (first 10TB)
- **Estimated**: ~$0.10-0.50 per gallery/month (depends on views)

#### API Gateway Costs

**Estimated Requests:**
- Free tier: 1M requests/month
- Beyond free tier: $1.00 per million
- **Estimated**: ~$0.01 per gallery/month

#### EventBridge Scheduler Costs

**Per Gallery:**
- 1 schedule for expiration: $0.00000833 per schedule/month
- **Estimated**: ~$0.00001 per gallery/month (negligible)

#### SES Email Costs

**Per Gallery:**
- ~2-5 emails (invitation, notifications): $0.10 per 1000 emails
- **Estimated**: ~$0.001 per gallery (negligible)

**Total AWS Infrastructure Cost Estimate (with Intelligent-Tiering):**
```
AWS Storage Cost (PLN/month) ≈ (planSizeGB * 0.70 * 0.099) + (planSizeGB * 0.08 * 0.099)
                             ≈ (planSizeGB * 0.077) + (planSizeGB * 0.008)
                             ≈ planSizeGB * 0.085

AWS Other (Lambda, DynamoDB, CloudFront): ~0.50 PLN/month

Total AWS Cost (PLN/month) ≈ (planSizeGB * 0.085) + 0.50
```

**Note:** Intelligent-Tiering provides ~30% savings on originals/finals/ZIPs after the first month. The calculation assumes average savings over the gallery lifetime.

---

## Profitability Analysis by Plan

### Scenario 1: 1GB-1m Plan (5 PLN)

**Revenue:**
- Client pays: 5.00 PLN + Stripe fee (2.9% + 1 PLN) = 5.00 + 0.145 + 1.00 = **6.145 PLN**
- PhotoCloud receives: 5.00 PLN
- After VAT (23%): 5.00 / 1.23 = **4.065 PLN**

**Costs:**
- AWS Storage (1GB × 0.085): ~0.085 PLN/month
- AWS Other (Lambda, DynamoDB, CloudFront): ~0.50 PLN/month
- **Total AWS**: ~0.585 PLN/month

**Profit:**
- Net Revenue: 4.065 PLN
- AWS Costs: 0.585 PLN
- **Profit**: **3.480 PLN** (85.6% margin)

---

### Scenario 2: 1GB-3m Plan (8 PLN)

**Revenue:**
- Client pays: 8.00 PLN + Stripe fee = 8.00 + 0.232 + 1.00 = **9.232 PLN**
- PhotoCloud receives: 8.00 PLN
- After VAT (23%): 8.00 / 1.23 = **6.504 PLN**

**Costs:**
- AWS Storage (1GB × 0.085 × 3 months): ~0.255 PLN
- AWS Other (3 months): ~1.50 PLN
- **Total AWS**: ~1.755 PLN

**Profit:**
- Net Revenue: 6.504 PLN
- AWS Costs: 1.755 PLN
- **Profit**: **4.749 PLN** (73.0% margin)

**Monthly Equivalent:**
- Profit per month: 4.749 / 3 = **1.583 PLN/month**

---

### Scenario 3: 1GB-12m Plan (17 PLN)

**Revenue:**
- Client pays: 17.00 PLN + Stripe fee = 17.00 + 0.493 + 1.00 = **18.493 PLN**
- PhotoCloud receives: 17.00 PLN
- After VAT (23%): 17.00 / 1.23 = **13.821 PLN**

**Costs:**
- AWS Storage (1GB × 0.085 × 12 months): ~1.020 PLN
- AWS Other (12 months): ~6.00 PLN
- **Total AWS**: ~7.020 PLN

**Profit:**
- Net Revenue: 13.821 PLN
- AWS Costs: 7.020 PLN
- **Profit**: **6.801 PLN** (49.2% margin)

**Monthly Equivalent:**
- Profit per month: 6.801 / 12 = **0.567 PLN/month**

---

### Scenario 4: 3GB-1m Plan (8 PLN)

**Revenue:**
- Client pays: 8.00 PLN + Stripe fee = 8.00 + 0.232 + 1.00 = **9.232 PLN**
- PhotoCloud receives: 8.00 PLN
- After VAT (23%): 8.00 / 1.23 = **6.504 PLN**

**Costs:**
- AWS Storage (3GB × 0.085 × 1 month): ~0.255 PLN
- AWS Other (1 month): ~0.50 PLN
- **Total AWS**: ~0.755 PLN/month

**Profit:**
- Net Revenue: 6.504 PLN
- AWS Costs: 0.755 PLN
- **Profit**: **5.749 PLN** (88.4% margin)

---

### Scenario 5: 3GB-3m Plan (10 PLN)

**Revenue:**
- Client pays: 10.00 PLN + Stripe fee = 10.00 + 0.290 + 1.00 = **11.290 PLN**
- PhotoCloud receives: 10.00 PLN
- After VAT (23%): 10.00 / 1.23 = **8.130 PLN**

**Costs:**
- AWS Storage (3GB × 0.085 × 3 months): ~0.765 PLN
- AWS Other (3 months): ~1.50 PLN
- **Total AWS**: ~2.265 PLN

**Profit:**
- Net Revenue: 8.130 PLN
- AWS Costs: 2.265 PLN
- **Profit**: **5.865 PLN** (72.1% margin)

**Monthly Equivalent:**
- Profit per month: 5.865 / 3 = **1.955 PLN/month**

---

### Scenario 6: 3GB-12m Plan (23 PLN)

**Revenue:**
- Client pays: 23.00 PLN + Stripe fee = 23.00 + 0.667 + 1.00 = **24.667 PLN**
- PhotoCloud receives: 23.00 PLN
- After VAT (23%): 23.00 / 1.23 = **18.699 PLN**

**Costs:**
- AWS Storage (3GB × 0.085 × 12 months): ~3.060 PLN
- AWS Other (12 months): ~6.00 PLN
- **Total AWS**: ~9.060 PLN

**Profit:**
- Net Revenue: 18.699 PLN
- AWS Costs: 9.060 PLN
- **Profit**: **9.639 PLN** (51.5% margin)

**Monthly Equivalent:**
- Profit per month: 9.639 / 12 = **0.803 PLN/month**

---

### Scenario 7: 10GB-1m Plan (10 PLN)

**Revenue:**
- Client pays: 10.00 PLN + Stripe fee = 10.00 + 0.290 + 1.00 = **11.290 PLN**
- PhotoCloud receives: 10.00 PLN
- After VAT (23%): 10.00 / 1.23 = **8.130 PLN**

**Costs:**
- AWS Storage (10GB × 0.085 × 1 month): ~0.850 PLN
- AWS Other (1 month): ~0.50 PLN
- **Total AWS**: ~1.350 PLN/month

**Profit:**
- Net Revenue: 8.130 PLN
- AWS Costs: 1.350 PLN
- **Profit**: **6.780 PLN** (83.4% margin)

---

### Scenario 8: 10GB-3m Plan (14 PLN)

**Revenue:**
- Client pays: 14.00 PLN + Stripe fee = 14.00 + 0.406 + 1.00 = **15.406 PLN**
- PhotoCloud receives: 14.00 PLN
- After VAT (23%): 14.00 / 1.23 = **11.382 PLN**

**Costs:**
- AWS Storage (10GB × 0.085 × 3 months): ~2.550 PLN
- AWS Other (3 months): ~1.50 PLN
- **Total AWS**: ~4.050 PLN

**Profit:**
- Net Revenue: 11.382 PLN
- AWS Costs: 4.050 PLN
- **Profit**: **7.332 PLN** (64.4% margin)

**Monthly Equivalent:**
- Profit per month: 7.332 / 3 = **2.444 PLN/month**

---

### Scenario 9: 10GB-12m Plan (28 PLN)

**Revenue:**
- Client pays: 28.00 PLN + Stripe fee = 28.00 + 0.812 + 1.00 = **29.812 PLN**
- PhotoCloud receives: 28.00 PLN
- After VAT (23%): 28.00 / 1.23 = **22.764 PLN**

**Costs:**
- AWS Storage (10GB × 0.085 × 12 months): ~10.200 PLN
- AWS Other (12 months): ~6.00 PLN
- **Total AWS**: ~16.200 PLN

**Profit:**
- Net Revenue: 22.764 PLN
- AWS Costs: 16.200 PLN
- **Profit**: **6.564 PLN** (28.8% margin)

**Monthly Equivalent:**
- Profit per month: 6.564 / 12 = **0.547 PLN/month**

---

## Summary Table

| Plan | Price (PLN) | Client Pays (PLN) | Net Revenue After VAT (PLN) | AWS Costs (PLN) | Profit (PLN) | Margin | Profit/Month (PLN) |
|------|-------------|-------------------|----------------------------|-----------------|--------------|--------|---------------------|
| 1GB-1m   | 5.00  | 6.145  | 4.065  | 0.585  | 3.480  | 85.6% | 3.480 |
| 1GB-3m   | 8.00  | 9.232  | 6.504  | 1.755  | 4.749  | 73.0% | 1.583 |
| 1GB-12m  | 17.00 | 18.493 | 13.821 | 7.020  | 6.801  | 49.2% | 0.567 |
| 3GB-1m   | 8.00  | 9.232  | 6.504  | 0.755  | 5.749  | 88.4% | 5.749 |
| 3GB-3m   | 10.00 | 11.290 | 8.130  | 2.265  | 5.865  | 72.1% | 1.955 |
| 3GB-12m  | 23.00 | 24.667 | 18.699 | 9.060  | 9.639  | 51.5% | 0.803 |
| 10GB-1m  | 10.00 | 11.290 | 8.130  | 1.350  | 6.780  | 83.4% | 6.780 |
| 10GB-3m  | 14.00 | 15.406 | 11.382 | 4.050  | 7.332  | 64.4% | 2.444 |
| 10GB-12m | 28.00 | 29.812 | 22.764 | 16.200 | 6.564  | 28.8% | 0.547 |

---

## Key Insights

### 1. Profitability by Duration

**Short-term plans (1 month) are most profitable:**
- Highest profit per month: 10GB-1m (6.780 PLN/month), 3GB-1m (5.749 PLN/month)
- Best margins: 3GB-1m (88.4%), 1GB-1m (85.6%), 10GB-1m (83.4%)

**Long-term plans (12 months) have improved margins with price increases:**
- 10GB-12m: 28.8% margin (improved from 23.4% with price increase to 28 PLN)
- 3GB-12m: 51.5% margin (improved from 46.9% with price increase to 23 PLN)
- 1GB-12m: 49.2% margin (improved from 42.4% with price increase to 17 PLN)
- Lower profit per month despite higher total profit

**Recommendation:** Encourage 1-month plans for better cash flow and margins.

### 2. Profitability by Storage Size

**Smaller plans (1GB) have good margins:**
- 1GB-1m: 85.6% margin
- 3GB-1m: 88.4% margin (best margin)
- 10GB-1m: 83.4% margin

**Larger plans (10GB) have significantly improved margins with price increases:**
- 10GB-12m: 28.8% margin (improved from 23.4% with price increase to 28 PLN)
- 10GB-3m: 64.4% margin (improved from 58.5% with price increase to 14 PLN)

**Recommendation:** Price increases have successfully improved margins for longer-duration plans. All plans now have healthy margins.

### 3. VAT Impact

**VAT reduces revenue by 18.7%:**
- 23% VAT means: Revenue / 1.23 = Net revenue
- Example: 5 PLN → 4.065 PLN net (18.7% reduction)

**This is a significant cost that must be factored into pricing.**

### 4. Stripe Fee Strategy

**Gallery payments (client pays fees):**
- Client pays: Base + (2.9% + 1 PLN)
- PhotoCloud receives: Base amount
- **No direct cost to PhotoCloud** (fees passed to client)

**Wallet top-ups (PhotoCloud covers fees):**
- Client pays: Top-up amount
- PhotoCloud receives: Top-up - (2.9% + 1 PLN)
- **Cost to PhotoCloud:** ~3-4% of top-up amount

**Recommendation:** Encourage direct gallery payments over wallet top-ups to avoid fee absorption.

### 5. AWS Cost Structure

**Storage is the dominant cost:**
- Storage: ~0.085 PLN/GB/month (with Intelligent-Tiering savings)
- Other AWS services: ~0.50 PLN/month (relatively fixed)

**For larger plans, storage costs scale linearly:**
- 1GB: ~0.085 PLN/month storage
- 10GB: ~0.850 PLN/month storage (10x)

**Intelligent-Tiering Benefits:**
- Originals and finals automatically move to cheaper tiers after 30-90 days
- Average savings: ~30% after first month
- No performance impact (served via CloudFront cache)

**Recommendation:** Monitor storage usage closely. Consider tiered pricing or overage fees for galleries exceeding plan limits.

---

## Break-Even Analysis

### Minimum Viable Gallery

**Break-even point (zero profit):**
- Net Revenue = AWS Costs
- Price / 1.23 = (planSizeGB × 1.08 × 0.099 × months) + 0.50 × months
- Price = ((planSizeGB × 1.08 × 0.099 × months) + 0.50 × months) × 1.23

**Example: 1GB-1m plan:**
- Break-even price: ((1 × 1.08 × 0.099 × 1) + 0.50 × 1) × 1.23 = 0.607 × 1.23 = **0.747 PLN**
- Current price: 5.00 PLN
- **Safety margin: 569%** (very safe)

**Example: 10GB-12m plan (with Intelligent-Tiering and price increase):**
- Break-even price: ((10 × 0.085 × 12) + 0.50 × 12) × 1.23 = 16.200 × 1.23 = **19.926 PLN**
- Current price: 28.00 PLN
- **Safety margin: 40.5%** (improved from 30.5% with price increase)

**Recommendation:** 10GB-12m margin is now healthy (28.8%) with Intelligent-Tiering and price increase. All plans have acceptable margins.

---

## Risk Scenarios

### Scenario A: High Storage Usage

**If galleries use 100% of plan storage:**
- Current costs are based on plan size
- **Risk:** Low (costs already accounted for)

### Scenario B: High Traffic (CloudFront)

**If CloudFront exceeds free tier (1TB/month):**
- Additional cost: $0.085/GB = ~0.34 PLN/GB
- **Risk:** Medium (depends on gallery views)
- **Mitigation:** CloudFront caching reduces origin requests

### Scenario C: High Lambda Invocations

**If Lambda exceeds free tier:**
- Additional cost: $0.20 per 1M requests
- **Risk:** Low (very cheap per request)

### Scenario D: High DynamoDB Usage

**If DynamoDB exceeds free tier:**
- Additional cost: $1.25 per 1M writes, $0.25 per 1M reads
- **Risk:** Low (very cheap per operation)

---

## Recommendations

### 1. Pricing Strategy

**Pricing Strategy (Updated with Intelligent-Tiering and Price Increases):**
- 10GB-12m: Margin improved to 28.8% (from 23.4% with price increase to 28 PLN) - **healthy**
- 3GB-12m: Margin improved to 51.5% (from 46.9% with price increase to 23 PLN) - **excellent**
- 1GB-12m: Margin improved to 49.2% (from 42.4% with price increase to 17 PLN) - **excellent**
- 10GB-3m: Margin improved to 64.4% (from 58.5% with price increase to 14 PLN) - **excellent**
- 1GB-3m: Margin improved to 73.0% (from 69.2% with price increase to 8 PLN) - **excellent**

**Maintain competitive pricing for entry plans:**
- 1GB-1m and 3GB-1m are well-priced (high margins, good for acquisition)

### 2. Cost Optimization

**Monitor storage usage:**
- Alert when galleries approach plan limits
- Consider overage fees for exceeding limits
- Encourage cleanup of expired galleries

**Intelligent-Tiering Optimization:**
- Originals and finals now use Intelligent-Tiering (automatic cost savings)
- Monitor Intelligent-Tiering metrics in AWS Console
- Expected savings: ~30% on storage costs after first month

**Optimize CloudFront costs:**
- ✅ **Cache-Control headers**: Originals and finals now have `max-age=31536000, immutable` headers
  - CloudFront caches for 1 year, dramatically reducing origin requests
  - Expected cache hit ratio improvement: 80% → 90%+
- ✅ **Optimized cache policy**: Only includes `v` query parameter in cache key (not all query strings)
  - Reduces cache fragmentation from irrelevant query parameters
  - Improves cache hit ratio by ~5-10%
- ✅ **ETag forwarding**: Enables 304 Not Modified responses for better cache validation
- ✅ **Monitoring**: CloudWatch alarms track origin request ratio (target: <20% = >80% cache hit ratio)
- Consider CloudFront Business Plan ($200/month) if usage exceeds ~$400/month

### 3. Revenue Optimization

**Encourage 1-month plans:**
- Better margins and cash flow
- Consider discounts for annual plans only if margins improve

**Discourage wallet top-ups:**
- Wallet top-ups cost PhotoCloud ~3-4% in Stripe fees
- Encourage direct gallery payments instead

### 4. Customer Acquisition

**Welcome bonus (7 PLN):**
- Current CAC: 7 PLN per new user
- Break-even: User needs to create ~2 galleries (1GB-1m) to recover CAC
- **Recommendation:** Monitor CAC effectiveness, consider reducing to 5 PLN if conversion is high

---

## Conclusion

PhotoCloud is **highly profitable** across all plans, with margins ranging from 28.8% to 88.4%. Price increases and Intelligent-Tiering have significantly improved profitability:

**Key Improvements:**
- 10GB-12m: Margin improved to 28.8% (from 10.9% originally) - **healthy margin**
- 3GB-12m: Margin improved to 51.5% (from 42.3% originally) - **excellent**
- 1GB-12m: Margin improved to 49.2% (from 40.3% originally) - **excellent**
- 10GB-3m: Margin improved to 64.4% (from 51.8% originally) - **excellent**
- 1GB-3m: Margin improved to 73.0% (from 68.0% originally) - **excellent**

**Main Considerations:**
1. **VAT (23%)** - Significant revenue reduction, but accounted for in pricing
2. **Storage costs** - Scale linearly with plan size (mitigated by Intelligent-Tiering)
3. **All plans now have healthy margins** - Price increases have successfully improved profitability

**Overall Assessment:** Business model is **sound and highly profitable**. All plans have acceptable margins (28.8% minimum). Focus on:
- ✅ **CloudFront optimizations implemented**: Cache-Control headers, optimized cache policy, ETag forwarding
  - Expected cache hit ratio: >90% (improved from >80%)
  - Estimated CloudFront cost reduction: 10-20% (fewer origin requests)
- Monitoring Intelligent-Tiering cost savings in AWS Console
- Encouraging higher-margin plans (1-month plans for better cash flow)
- Monitoring customer acquisition costs and conversion rates

