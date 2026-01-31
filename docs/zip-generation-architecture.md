# ZIP Generation Architecture

This document describes the chunked ZIP generation architecture for handling large orders (100+ files) reliably within AWS Lambda's 15-minute timeout limit.

## Overview

ZIP generation uses a **router** that dispatches to either:

- **Single Lambda path** (≤100 files): Existing `createZip` Lambda processes all files in one run.
- **Chunked path** (>100 files): Step Functions orchestrates parallel **workers** that copy raw files to temp prefix, then a **merge** Lambda streams them directly into final ZIP.

## Architecture Diagram

```mermaid
flowchart TB
    subgraph triggers [Entry Points]
        A1[onOrderDelivered]
        A2[onOrderStatusChange]
        A3[approveSelection]
    end

    subgraph router [ZipRouter Lambda]
        R{files > 100?}
    end

    subgraph single [Single Path]
        S1[createZip]
    end

    subgraph chunked [Chunked Path - Step Functions]
        SF[State Machine]
        W1[Worker 1]
        W2[Worker 2]
        WK[Worker K]
        M[Merge Lambda]
    end

    A1 --> R
    A2 --> R
    A3 --> R
    R -->|no| S1
    R -->|yes| SF
    SF --> W1
    SF --> W2
    SF --> WK
    W1 --> M
    W2 --> M
    WK --> M
```

## When Single vs Chunked Is Used

| File count | Path    | Behavior                                                                 |
|------------|---------|--------------------------------------------------------------------------|
| ≤100       | Single  | One `createZip` Lambda run. Same as before chunked was introduced.       |
| >100       | Chunked | Step Function: parallel workers (~100 files each) → merge into final ZIP.|

The threshold is configurable via `ZIP_CHUNK_THRESHOLD` (default: 100).

## Chunk Count Formula

```
workerCount = min(ceil(filesCount / 200), 10)
```

Each worker handles roughly 200 files. Maximum 10 workers for cost control. Example: 1000 files → 5 workers. Example: 350 files → 2 workers.

## Temp Storage

Workers copy raw files to a temp prefix:

```
s3://bucket/galleries/{galleryId}/tmp/{orderId}/{runId}/chunk-{index}/{key}
```

Temp files are deleted by the merge Lambda after the final ZIP is written.

**Future optimization**: S3 Express One Zone can be used for temp storage if merge latency is a bottleneck (requires VPC + same AZ, higher storage cost).

## Merge Strategy (Direct Streaming)

Workers copy raw files to temp prefix; merge streams them directly into final ZIP:

1. **Workers**: Copy raw files to `galleries/{galleryId}/tmp/{orderId}/{runId}/chunk-{index}/{key}` (no chunk ZIP).
   - Uses 20 concurrent copies per worker (increased from 10) for faster pre-processing
   - Better error handling with exponential backoff retries
   - Streams directly from source to temp prefix (no intermediate buffers)
2. **Merge**: ListObjectsV2 on temp prefix, concurrent GetObject (p-limit 50), yazl.addReadStream each file directly into final ZIP.
   - Optimized buffer management: avoids repeated `Buffer.concat()` calls (reduces GC pressure)
   - Uses PassThrough streams for better backpressure handling
   - Limits concurrent multipart uploads (max 5) to avoid memory pressure
   - Pre-allocates buffer chunks and only combines when uploading parts
3. Completes multipart upload.
4. Batch-deletes temp files.
5. Clears `finalZipGenerating` or `zipGenerating` in DynamoDB.

Merge is pure ZIP creation from raw files - workers copy files to temp prefix, merge streams them directly into final ZIP. Merge runs with 3008 MB memory (account max).

### Performance Optimizations

- **Buffer Management**: Pre-allocated buffer chunks avoid repeated `Buffer.concat()` which causes GC pauses. Buffers are only combined when uploading parts.
- **Backpressure Handling**: PassThrough streams with 64KB highWaterMark allow yazl to pull data when ready, preventing memory buildup.
- **Concurrent Uploads**: Limited to 5 concurrent multipart uploads to balance throughput with memory usage.
- **Worker Concurrency**: Increased from 10 to 20 concurrent copies per worker for faster pre-processing.

### Future Enhancement: S3 Express One Zone

For even faster temp storage (2–3× faster reads/writes), S3 Express One Zone can be used. This requires:
- VPC configuration (Lambda in VPC with subnets in same AZ)
- NAT Gateway for internet access (adds ~$32/month + data transfer)
- Increased cold start time (~1–3 seconds)
- Higher storage cost (~$0.16/GB vs ~$0.023/GB standard)

Current optimizations should handle 1000+ files within the 15-minute Lambda timeout. Express One Zone can be added later if needed for very large orders (2000+ files).

## Monitoring

- **Step Functions Console**: View execution history, duration, and state transitions for chunked ZIP generation.
- **CloudWatch Logs**: Check individual Lambda function logs for detailed execution information.
- **CloudWatch alarms**: DLQ messages, Step Function failures, ZipMerge Lambda errors.

See [zip-generation-monitoring.md](zip-generation-monitoring.md) for details.

## Cost Notes

- **Single path**: 1× createZip invocation (up to 15 min, 1024 MB).
- **Chunked path**: N workers (parallel) + 1 merge. Example: 300 files → 3 workers + 1 merge ≈ 4× single-run cost, but completes instead of timing out.
- S3: Standard storage for final ZIP; temp files are short-lived and deleted after merge.

## Troubleshooting

### DLQ has messages

Failed async Lambda invocations (createZip or chunk workers) land in `ZipGenerationDLQ`. Check CloudWatch Logs for the corresponding Lambda; use retry or admin tools to re-trigger.

### Step Function execution failed

Check the Step Functions console for the execution ID. Failed states show which step (Map iteration or Merge) failed. Common causes: worker timeout, S3 errors, merge timeout.

### Lambda 429 (TooManyRequestsException)

If many workers start at once, Lambda can throttle. The Map state uses `maxConcurrency: 4` to cap concurrent workers. For accounts with higher limits, you can increase this in `app-stack.ts`; otherwise request a concurrency limit increase from AWS.

### Merge timeout

If merge exceeds 15 minutes (very large ZIPs), consider increasing chunk count so workers produce smaller chunks, or evaluate S3 Express / different merge strategy.

### Order stuck in "generating"

- **EventBridge failure handler**: When the Step Function fails, EventBridge triggers `ZipChunkedFailureHandlerFn`, which clears the flag and sets the error state. The UI then shows "error" with a retry button.
- **Stale detection**: If generating for >25 min with no ZIP, `getZipStatus` / `getFinalZipStatus` return `status: "error"` (fallback if the failure handler didn't run).
- **Manual recovery**: Use the admin retry endpoint or manually clear `finalZipGenerating` / `zipGenerating` in DynamoDB and re-trigger generation.

## Related

- [zip-generation-monitoring.md](zip-generation-monitoring.md) – Monitoring, alarms, dev dashboard
- [cloudfront-zip-downloads-setup.md](cloudfront-zip-downloads-setup.md) – ZIP downloads via CloudFront
