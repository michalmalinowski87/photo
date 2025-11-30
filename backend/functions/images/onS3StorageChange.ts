import { lambdaLogger } from '../../../packages/logger/src';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { recalculateStorageInternal } from '../galleries/recalculateBytesUsed';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const lambda = new LambdaClient({});

/**
 * Lambda function for recalculating gallery storage bytes from S3
 * 
 * Triggered by:
 * - S3 OBJECT_CREATED_PUT events (for uploads) - calculates storage from originals first, then triggers resizeFn
 * - Programmatically from deleteBatchFn (after delete batch processing)
 * - Programmatically from pay.ts (on-demand)
 * - Programmatically from validateUploadLimits.ts (on-demand)
 * 
 * Flow for uploads: S3 event → storageRecalcFn (fast, calculates from originals) → resizeFn (slow, processes images)
 * This ensures storage is calculated ASAP from originals, while resizing happens asynchronously
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
	const s3KeysForResize = new Set<string>(); // Use Set to deduplicate keys (S3 can send duplicate events)
	
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
		
		// If this is an S3 event (SQS or direct, not programmatic), collect the key for resizeFn
		// Use Set to deduplicate - S3 can send duplicate events for the same file
		if (isS3Event || isSQSEvent) {
			s3KeysForResize.add(key);
		}
	}
	
	logger?.info('Processing galleries for storage recalculation', { 
		galleryCount: processedGalleries.size,
		galleryIds: Array.from(processedGalleries),
		s3KeysForResize: s3KeysForResize.size,
		uniqueKeys: Array.from(s3KeysForResize)
	});

	// Recalculate storage for each unique gallery
	// Process sequentially to avoid overwhelming DynamoDB
	// Note: Conditional updates in recalculateStorageInternal prevent race conditions
	// when multiple Lambda invocations process the same gallery concurrently
	// No debounce/cache needed - batch processing handles deduplication
	
	const resizeFnName = envProc?.env?.RESIZE_FN_NAME as string;
	
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

	// After storage recalculation, trigger resizeFn for image processing (only for S3 CREATE events)
	// This ensures storage is calculated from originals first (fast), then images are resized (slow)
	// For programmatic calls (deleteBatchFn, pay, validateUploadLimits), no resize needed
	if ((isS3Event || isSQSEvent) && resizeFnName && s3KeysForResize.size > 0) {
		// Create resize records from the deduplicated keys
		// We need to reconstruct the S3 event record format for resizeFn
		const uniqueKeys = Array.from(s3KeysForResize);
		const resizeRecords: any[] = [];
		
		// Build records from unique keys - match the original S3 event format
		for (const decodedKey of uniqueKeys) {
			// Find the original record that matches this key (for event metadata)
			const matchingRecord = s3EventRecords.find((rec: any) => {
				const key = rec.s3?.object?.key || '';
				const decodedKeyFromRecord = key.replace(/\+/g, '%20');
				try {
					const decoded = decodeURIComponent(decodedKeyFromRecord);
					return decoded === decodedKey;
				} catch {
					return false;
				}
			});
			
			if (matchingRecord) {
				resizeRecords.push(matchingRecord);
			} else {
				// If we can't find the original record, create a synthetic one
				// This ensures resizeFn gets the key even if record matching fails
				resizeRecords.push({
					eventName: 'ObjectCreated:Put',
					s3: {
						bucket: {
							name: bucket
						},
						object: {
							key: decodedKey
						}
					}
				});
			}
		}
		
		if (resizeRecords.length > 0) {
			logger?.info('Invoking resize Lambda after storage calculation', {
				imageCount: resizeRecords.length,
				uniqueKeys: uniqueKeys.length,
				resizeFnName,
				keys: uniqueKeys
			});
			
			try {
				await lambda.send(new InvokeCommand({
					FunctionName: resizeFnName,
					InvocationType: 'Event', // Async invocation
					Payload: JSON.stringify({
						Records: resizeRecords
					})
				}));
				
				logger?.info('Successfully triggered resize Lambda after storage calculation', {
					imageCount: resizeRecords.length,
					uniqueKeys: uniqueKeys.length
				});
			} catch (err: any) {
				logger?.error('Failed to invoke resize Lambda after storage calculation', {
					error: err.message,
					stack: err.stack,
					functionName: resizeFnName,
					recordCount: resizeRecords.length
				});
			}
		} else {
			logger?.warn('No valid resize records after filtering', {
				uniqueKeysCount: uniqueKeys.length,
				s3EventRecordsCount: s3EventRecords.length,
				uniqueKeys: Array.from(uniqueKeys)
			});
		}
	} else {
		logger?.warn('Skipping resizeFn invocation - condition not met', {
			isS3Event,
			isSQSEvent,
			resizeFnName: !!resizeFnName,
			resizeFnNameValue: resizeFnName,
			s3KeysForResizeCount: s3KeysForResize.size,
			s3KeysForResize: Array.from(s3KeysForResize)
		});
	}

	logger?.info('S3 storage change processing completed', {
		totalRecords: s3EventRecords.length,
		galleriesProcessed: processedGalleries.size,
		eventSource: isSQSEvent ? 'SQS' : isS3Event ? 'S3' : 'programmatic'
	});
});

