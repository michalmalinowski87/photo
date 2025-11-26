# CloudFront Cost Optimization

This document outlines the CloudFront cost optimizations implemented in PhotoHub and strategies for monitoring and further reducing costs.

## Current Implementation

### 1. Price Class 100
- **Status**: ✅ Implemented
- **Configuration**: CloudFront distribution uses `PriceClass.PRICE_CLASS_100`
- **Coverage**: US, Canada, Europe, Israel (excludes expensive Asia/South America edge locations)
- **Estimated Savings**: $42-85/month (10-20% reduction on data transfer costs)

### 2. WebP Image Format
- **Status**: ✅ Implemented
- **Implementation**: 
  - Images are converted to WebP format (25-35% smaller than JPEG)
  - JPEG versions maintained as fallback for older browsers
  - Frontend automatically prefers WebP with JPEG fallback
- **Estimated Savings**: $106-148/month (25-35% size reduction)

### 3. Optimized Caching
- **Status**: ✅ Implemented
- **Configuration**: 
  - Cache-Control headers set to `max-age=31536000` (1 year) on S3 objects
  - CloudFront uses `CACHING_OPTIMIZED` policy which respects Cache-Control headers
- **Impact**: High cache hit ratio (>80% target), reducing origin fetches

### 4. Lazy Loading
- **Status**: ✅ Implemented
- **Implementation**: 
  - Intersection Observer API used to load images only when in viewport
  - Native `loading="lazy"` attribute on img tags
  - Reduces initial page load requests
- **Estimated Savings**: <$1/month (minimal cost impact, but improves UX significantly)

### 5. CloudWatch Monitoring
- **Status**: ✅ Implemented
- **Alarms**:
  - Data transfer spike alarm (>10GB/day threshold)
  - Request count spike alarm (>100k requests/day threshold)
  - Origin request ratio alarm (cache hit ratio < 80%)
- **Notifications**: SNS topic for cost alerts (production only)

## AWS Free Tier

CloudFront provides a perpetual free tier:
- **1 TB** of data transfer out per month
- **10 million** HTTP/HTTPS requests per month

This free tier is automatically applied to your account and reduces costs for the first 1 TB and 10M requests each month.

## Flat-Rate Pricing Plans

AWS introduced flat-rate pricing plans for CloudFront (as of November 2025):
- **Free Plan**: $0/month
- **Pro Plan**: $15/month
- **Business Plan**: $200/month
- **Premium Plan**: $1,000/month

Each plan includes specific usage allowances and features. Evaluate if a flat-rate plan would be more cost-effective than pay-as-you-go based on your usage patterns.

**Current Usage**: ~5,000 GB/month, ~50,000 requests/month
**Current Cost**: ~$425/month (pay-as-you-go)
**Business Plan**: $200/month (could save $225/month if usage stays consistent)

## Cost Monitoring

### CloudWatch Metrics
Monitor the following CloudFront metrics in AWS Console:
- `BytesDownloaded`: Total data transfer
- `Requests`: Total HTTP/HTTPS requests
- `OriginRequests`: Requests to origin (indicates cache miss rate)
- `CacheHitRate`: Calculated as `(1 - OriginRequests/Requests) * 100`

### Cost Explorer
Use AWS Cost Explorer to:
- Track CloudFront costs over time
- Identify cost trends and anomalies
- Set up cost budgets and alerts

### Alarms
CloudWatch alarms are configured to alert on:
- Data transfer spikes (>333MB/hour)
- Request count spikes (>4167 requests/hour)
- Low cache hit ratio (origin requests > 20% of total)

## Optimization Strategies

### Already Implemented
1. ✅ Price Class 100 (restricts to cheaper edge locations)
2. ✅ WebP format conversion (25-35% size reduction)
3. ✅ Long cache TTLs (1 year for thumbnails/previews)
4. ✅ Lazy loading (reduces initial requests)
5. ✅ CloudWatch monitoring (cost anomaly detection)

### Future Considerations
1. **Geographic Restrictions**: Block content delivery to regions with no audience
2. **Request Logging Optimization**: Reduce logging costs by sampling or filtering
3. **Flat-Rate Plan Evaluation**: Assess if Business Plan ($200/month) is more cost-effective
4. **Image Optimization**: Further optimize image quality settings to balance size vs quality

## Expected Cost Reduction

**Current Cost**: ~$425/month

**Savings Breakdown**:
- Price Class 100: $42-85/month
- WebP Conversion: $106-148/month
- Lazy Loading: <$1/month
- **Total Technical Savings**: $148-233/month

**Final Cost Range**: $192-277/month (with technical optimizations)

**Alternative**: Business Plan ($200/month) could save $225/month if usage stays consistent

## Monitoring Cache Hit Ratio

CloudFront doesn't provide a direct cache hit ratio metric. Calculate it using:

```
Cache Hit Ratio = (1 - (OriginRequests / Requests)) * 100
```

Target: >80% cache hit ratio

Monitor in CloudWatch:
- `AWS/CloudFront` namespace
- `OriginRequests` metric (indicates cache misses)
- `Requests` metric (total requests)

## Additional Resources

- [AWS CloudFront Pricing](https://aws.amazon.com/cloudfront/pricing/)
- [CloudFront Cost Optimization Guide](https://aws.amazon.com/blogs/networking-and-content-delivery/cost-optimizing-your-aws-architectures-by-utilizing-amazon-cloudfront-features/)
- [CloudFront Flat-Rate Pricing Plans](https://aws.amazon.com/about-aws/whats-new/2025/11/aws-flat-rate-pricing-plans/)

