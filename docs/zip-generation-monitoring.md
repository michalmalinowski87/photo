# ZIP Generation Monitoring

This document describes monitoring, alarms, and the dev dashboard for ZIP generation.

## CloudWatch Alarms

### 1. ZipGenerationDLQ-Messages

- **Trigger**: Any message in the ZIP generation Dead Letter Queue (async Lambda failures).
- **Meaning**: A createZip or chunk worker invocation failed and was sent to the DLQ.
- **Action**: Inspect CloudWatch Logs for the failed Lambda, fix the cause, then retry or re-trigger generation.

### 2. ZipStepFunction-Failed

- **Trigger**: Step Function execution ends in a failed state.
- **Meaning**: The chunked ZIP flow failed (e.g. worker or merge error).
- **Action**: Open Step Functions console, find the failed execution, check which state failed and the error details. Check ZipMerge and ZipChunkWorker CloudWatch Logs.

### 3. ZipMerge-Errors

- **Trigger**: ZipMerge Lambda reports one or more errors.
- **Meaning**: The merge phase failed (e.g. S3, stream, or DynamoDB error).
- **Action**: Check ZipMerge Lambda CloudWatch Logs. Common causes: timeout, S3 permissions, unzipper/stream errors.

## DLQ Handling

Messages in `ZipGenerationDLQ` represent failed async Lambda invocations. To inspect:

1. AWS Console → SQS → ZipGenerationDLQ.
2. Receive messages; the body contains the original invocation payload (galleryId, orderId, type, keys, etc.).
3. Use the payload to manually retry via the admin/retry endpoint or by re-invoking the router.

Messages remain for 14 days (configurable). Consider a Lambda or script to process the DLQ and log to ZipMetrics with `success: false` for visibility.

## Dev Dashboard: /dev/zip-metrics

Available at `/dev/zip-metrics` in the dashboard (dev tools).

### Features

- **Date range**: Filter metrics by from/to timestamps.
- **Type filter**: All, Final, or Original.
- **Summary cards**: Total runs, average duration, P95 duration, success rate, single vs chunked breakdown, error count.
- **Bottleneck distribution**: Counts per `worker`, `merge`, `s3_read`, `s3_write`, `none`.
- **Table**: runId, phase, galleryId, orderId, type, files count, ZIP size, worker count, duration, bottleneck, success.
- **Export CSV**: Download raw metrics for offline analysis.

### Interpreting Bottlenecks

- **worker**: Chunk workers dominate; consider more workers or smaller chunks.
- **merge**: Merge phase is slow; consider S3 Express or merge optimization.
- **s3_read** / **s3_write**: S3 I/O bound; check region, VPC, or connection limits.
- **none**: Single-path or no clear bottleneck.

### Fine-Tuning

Use the summary and by-worker/by-files breakdown to tune:

- **ZIP_CHUNK_THRESHOLD**: Lower (e.g. 80) for more chunked runs; higher (e.g. 150) for fewer.
- **FILES_PER_CHUNK**: In `zip-constants.ts`; 200 = fewer workers (e.g. 1000 files → 5 workers), reducing merge time and Lambda burst. Smaller = more workers, more merge overhead.
- **MAX_WORKERS**: Cap parallel workers (default 10).
- **Lambda memory**: Merge uses 3008 MB (account max) for ~3× CPU. Workers use 1024 MB.

## API Endpoints

- `GET /dashboard/zip-metrics?from=&to=&galleryId=&orderId=&type=&limit=` – Raw metrics.
- `GET /dashboard/zip-metrics/summary?from=&to=` – Aggregated statistics.

Both require authentication (Cognito).

## Metrics Schema (DynamoDB)

| Attribute      | Type   | Description                                      |
|----------------|--------|--------------------------------------------------|
| runId          | string | Unique run identifier (nanoid or requestId)      |
| phase          | string | `single`, `chunk#0`, `chunk#1`, …, `merge`       |
| galleryId      | string | Gallery ID                                       |
| orderId        | string | Order ID                                         |
| type           | string | `final` or `original`                            |
| filesCount     | number | Number of files                                  |
| zipSizeBytes   | number | Final or chunk ZIP size (bytes)                  |
| workerCount    | number | Number of workers (chunked only)                 |
| chunkIndex     | number | Chunk index (workers only)                       |
| durationMs     | number | Phase duration in milliseconds                   |
| bottleneck     | string | `worker`, `merge`, `s3_read`, `s3_write`, `none` |
| config         | map    | memoryMB, timeoutSec, concurrentDownloads, etc.  |
| success        | bool   | Whether the phase succeeded                      |
| error          | string | Error message if failed                          |
| timestamp      | number | Unix ms                                          |
| ttl            | number | DynamoDB TTL (90 days)                           |

## Related

- [zip-generation-architecture.md](zip-generation-architecture.md) – Architecture and flow
- [cloudfront-zip-downloads-setup.md](cloudfront-zip-downloads-setup.md) – ZIP download setup
