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
- **Action**: Check ZipMerge Lambda CloudWatch Logs. Common causes: timeout, S3 permissions, stream errors.

## DLQ Handling

Messages in `ZipGenerationDLQ` represent failed async Lambda invocations. To inspect:

1. AWS Console → SQS → ZipGenerationDLQ.
2. Receive messages; the body contains the original invocation payload (galleryId, orderId, type, keys, etc.).
3. Use the payload to manually retry via the admin/retry endpoint or by re-invoking the router.

Messages remain for 14 days (configurable).

## Monitoring via Step Functions Console

ZIP generation performance can be monitored via the AWS Step Functions console:

1. **Step Functions Console**: View execution history, duration, and state transitions for chunked ZIP generation.
2. **CloudWatch Logs**: Check individual Lambda function logs (createZip, ZipChunkWorker, ZipMerge) for detailed execution logs.
3. **CloudWatch Metrics**: Monitor Lambda invocations, errors, duration, and throttles.

### Fine-Tuning

Use Step Functions execution history and CloudWatch Logs to tune:

- **ZIP_CHUNK_THRESHOLD**: Lower (e.g. 80) for more chunked runs; higher (e.g. 150) for fewer.
- **FILES_PER_CHUNK**: In `zip-constants.ts`; 200 = fewer workers (e.g. 1000 files → 5 workers), reducing merge time and Lambda burst. Smaller = more workers, more merge overhead.
- **MAX_WORKERS**: Cap parallel workers (default 10).
- **Lambda memory**: Merge uses 3008 MB (account max) for ~3× CPU. Workers use 1024 MB.
- **Merge stack**: Workers copy raw files to temp prefix; merge streams raw files directly into yazl. MERGE_CONCURRENT_GETS=50 for GetObject overlap.

## Related

- [zip-generation-architecture.md](zip-generation-architecture.md) – Architecture and flow
- [cloudfront-zip-downloads-setup.md](cloudfront-zip-downloads-setup.md) – ZIP download setup
