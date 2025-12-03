import { lambdaLogger } from '../../../packages/logger/src';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { recalculateStorageInternal } from '../galleries/recalculateBytesUsed';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

/**
 * Lambda function for recalculating gallery storage bytes from S3
 * 
 * Triggered by:
 * - S3 OBJECT_CREATED_PUT events (for uploads) - calculates storage from originals
 * - Programmatically from deleteBatchFn (after delete batch processing)
 * - Programmatically from pay.ts (on-demand)
 * - Programmatically from validateUploadLimits.ts (on-demand)
 * 
 * Image resizing is now handled client-side via Uppy thumbnail generation
 */
export const handler = lambdaLogger(async (event: any, context: any) => {
	const logger = (context as any).logger;
	const envProc = (globalThis as any).process;
	const galleriesTable = envProc?.env?.GALLERIES_TABLE as string;
	const bucket = envProc?.env?.GALLERIES_BUCKET as string;

	if (!galleriesTable || !bucket) {
		logger?.error('Missing required environment variables', { galleriesTable: !!galleriesTable, bucket: !!bucket });
		return;
	}

	// Determine event source: SQS (batched), direct S3, or programmatic
	// SQS events have Records[].body containing S3 event JSON
	// Direct S3 events have Records[].s3
	// Programmatic calls have isProgrammaticCall = true
	const isSQSEvent = event.Records?.[0]?.eventSource === 'aws:sqs' || event.Records?.[0]?.body;
	const isS3Event = !event.isProgrammaticCall && !isSQSEvent;
	
	logger?.info('Storage recalculation invoked', { 
		recordCount: event.Records?.length || 0,
		isSQSEvent,
		isS3Event,
		isProgrammaticCall: event.isProgrammaticCall === true,
		eventSource: event.Records?.[0]?.eventSource
	});

	// Extract S3 event records from SQS messages or use direct records
	let s3EventRecords: any[] = [];
	
	if (isSQSEvent) {
		// SQS event: each record.body contains an S3 event JSON string
		// S3 → SQS format: body contains JSON with Records array or single event
		for (const sqsRecord of event.Records || []) {
			try {
				const body = sqsRecord.body;
				if (!body) {
					continue;
				}
				
				// Parse the SQS message body
				const parsed = JSON.parse(body);
				
				// Handle different S3 event formats:
				// 1. Direct S3 event format: { Records: [...] }
				// 2. SNS-wrapped format: { Type: 'Notification', Message: '{"Records":[...]}' }
				// 3. Single event: { eventName: '...', s3: {...} }
				
				if (parsed.Type === 'Notification' && parsed.Message) {
					// SNS-wrapped: parse the Message field
					const s3Message = JSON.parse(parsed.Message);
					if (s3Message.Records && Array.isArray(s3Message.Records)) {
						s3EventRecords.push(...s3Message.Records);
					} else if (s3Message.s3) {
						s3EventRecords.push(s3Message);
					}
				} else if (parsed.Records && Array.isArray(parsed.Records)) {
					// Direct S3 event format with Records array
					s3EventRecords.push(...parsed.Records);
				} else if (parsed.s3) {
					// Single S3 event record
					s3EventRecords.push(parsed);
				} else {
					logger?.warn('Unknown SQS message format', {
						bodyKeys: Object.keys(parsed),
						bodyPreview: JSON.stringify(parsed).substring(0, 200)
					});
				}
			} catch (err: any) {
				logger?.warn('Failed to parse SQS message body', {
					error: err.message,
					bodyPreview: sqsRecord.body?.substring(0, 200)
				});
			}
		}
		logger?.info('Extracted S3 events from SQS messages', {
			sqsRecordCount: event.Records?.length || 0,
			s3EventRecordCount: s3EventRecords.length
		});
	} else {
		// Direct S3 event or programmatic call
		s3EventRecords = event.Records ?? [];
	}

	const processedGalleries = new Set<string>();
	
	// Process records - handle both S3 events and programmatic calls
	for (const record of s3EventRecords) {
		if (!record.s3?.object?.key) {
			continue;
		}
		
		const rawKey = record.s3.object.key;
		
		// Decode S3 key (URL-encoded for S3 events)
		let key: string;
		try {
			const keyToDecode = rawKey.replace(/\+/g, '%20');
			key = decodeURIComponent(keyToDecode);
		} catch (e) {
			key = rawKey;
		}
		
		// CRITICAL: Only process originals/ and final/ directories
		// Skip previews/ and thumbs/ to avoid loops
		// Also skip if key ends with / (directory markers)
		if (key.includes('/previews/') || key.includes('/thumbs/') || key.endsWith('/')) {
			logger?.info('Skipping non-original/final file (preview/thumb/directory)', { key });
			continue;
		}
		
		const isOriginal = key.includes('/originals/');
		const isFinal = key.includes('/final/');
		
		if (!isOriginal && !isFinal) {
			logger?.info('Skipping non-original/final file', { key });
			continue;
		}
		
		// Extract galleryId from key
		// Format: galleries/{galleryId}/originals/{filename} or galleries/{galleryId}/final/{orderId}/{filename}
		const parts = key.split('/');
		if (parts.length < 3 || parts[0] !== 'galleries') {
			logger?.warn('Invalid key format, skipping', { key, parts });
			continue;
		}
		
		const galleryId = parts[1];
		if (!galleryId) {
			logger?.warn('No galleryId found in key', { key });
			continue;
		}
		
		processedGalleries.add(galleryId);
	}
	
	logger?.info('Processing galleries for storage recalculation', { 
		galleryCount: processedGalleries.size,
		galleryIds: Array.from(processedGalleries)
	});

	// Recalculate storage for each unique gallery
	// Process sequentially to avoid overwhelming DynamoDB
	// Note: Conditional updates in recalculateStorageInternal prevent race conditions
	// when multiple Lambda invocations process the same gallery concurrently
	// No debounce/cache needed - batch processing handles deduplication
	
	for (const galleryId of processedGalleries) {
		try {
			// Get gallery
			const galleryGet = await ddb.send(new GetCommand({
				TableName: galleriesTable,
				Key: { galleryId }
			}));

			if (!galleryGet.Item) {
				logger?.warn('Gallery not found during recalculation', { galleryId });
				continue;
			}
			const gallery = galleryGet.Item;

			// Call recalculation - conditional updates will handle concurrent invocations
			// If another Lambda already recalculated with a newer timestamp, this will be skipped
			const result = await recalculateStorageInternal(
				galleryId,
				galleriesTable,
				bucket,
				gallery,
				logger
			);

			// Check if recalculation was skipped due to concurrent update
			if (result?.body) {
				try {
					const body = JSON.parse(result.body);
					if (body.skipped) {
						logger?.info('Storage recalculation skipped (concurrent recalculation won)', { galleryId });
						continue;
					}
				} catch {
					// Not JSON or no skipped field, continue normally
				}
			}

			logger?.info('Storage recalculation completed for gallery', { galleryId });
		} catch (err: any) {
			logger?.error('Failed to recalculate storage for gallery', {
				error: err.message,
				galleryId,
				stack: err.stack
			});
			// Continue processing other galleries even if one fails
		}
	}

	logger?.info('S3 storage change processing completed', {
		totalRecords: s3EventRecords.length,
		galleriesProcessed: processedGalleries.size,
		eventSource: isSQSEvent ? 'SQS' : isS3Event ? 'S3' : 'programmatic'
	});
});

