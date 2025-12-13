import { lambdaLogger } from '../../../packages/logger/src';
import { S3Client, ListObjectsV2Command, GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { verifyGalleryAccess } from '../../lib/src/auth';
import { getPaidTransactionForGallery } from '../../lib/src/transactions';
import { createHash } from 'crypto';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');

const s3 = new S3Client({});
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export const handler = lambdaLogger(async (event: any) => {
	const envProc = (globalThis as any).process;
	const bucket = envProc?.env?.GALLERIES_BUCKET as string;
	const galleriesTable = envProc?.env?.GALLERIES_TABLE as string;
	const ordersTable = envProc?.env?.ORDERS_TABLE as string;

	if (!bucket || !galleriesTable || !ordersTable) {
		return {
			statusCode: 500,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Missing required environment variables' })
		};
	}

	const galleryId = event?.pathParameters?.id;
	const orderId = event?.pathParameters?.orderId;
	if (!galleryId || !orderId) {
		return {
			statusCode: 400,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Missing galleryId or orderId' })
		};
	}

	try {
		// Verify gallery exists
		const galleryGet = await ddb.send(new GetCommand({
			TableName: galleriesTable,
			Key: { galleryId }
		}));
		const gallery = galleryGet.Item as any;
		if (!gallery) {
			return {
				statusCode: 404,
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ error: 'Gallery not found' })
			};
		}

		// Verify access - supports both owner (Cognito) and client (JWT) tokens
		const access = verifyGalleryAccess(event, galleryId, gallery);
		if (!access.isOwner && !access.isClient) {
			return {
				statusCode: 401,
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ error: 'Unauthorized. Please log in.' })
			};
		}

		// For client access, check if gallery is paid before allowing access to finals
		// Owners can always access finals (even for unpublished galleries)
		if (access.isClient) {
			let isPaid = false;
			try {
				const paidTransaction = await getPaidTransactionForGallery(galleryId);
				isPaid = !!paidTransaction;
			} catch (err) {
				// If transaction check fails, fall back to gallery state
				isPaid = gallery.state === 'PAID_ACTIVE';
			}

			if (!isPaid) {
				return {
					statusCode: 403,
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ 
						error: 'Gallery not published',
						message: 'Final photos are not available until the gallery is published. Please contact the photographer.'
					})
				};
			}
		}

		// Verify order exists and is DELIVERED or PREPARING_DELIVERY
		const orderGet = await ddb.send(new GetCommand({
			TableName: ordersTable,
			Key: { galleryId, orderId }
		}));
		const order = orderGet.Item as any;
		if (!order) {
			return {
				statusCode: 404,
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ error: 'Order not found' })
			};
		}
		if (order.deliveryStatus !== 'DELIVERED' && order.deliveryStatus !== 'PREPARING_DELIVERY') {
			return {
				statusCode: 400,
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ error: 'Order is not delivered or preparing delivery' })
			};
		}

		// Check if final images exist and get list for hash generation
		const prefix = `galleries/${galleryId}/final/${orderId}/`;
		const listResponse = await s3.send(new ListObjectsV2Command({
			Bucket: bucket,
			Prefix: prefix
		}));

		if (!listResponse.Contents || listResponse.Contents.length === 0) {
			return {
				statusCode: 404,
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ error: 'No final images found for this order' })
			};
		}

		// Generate hash of final files with metadata to validate ZIP freshness
		// Includes filename + ETag + size + lastModified to detect content changes
		// If photographer reuploads file with same name but different content, ETag changes
		const finalFilesWithMetadata = listResponse.Contents
			.map(obj => {
				const filename = (obj.Key || '').replace(prefix, '');
				return {
					filename,
					etag: obj.ETag || '',
					size: obj.Size || 0,
					lastModified: obj.LastModified?.getTime() || 0
				};
			})
			.filter(item => {
				// Only include files directly in final/{orderId}/, not in subdirectories
				return item.filename && 
					!item.filename.includes('/previews/') && 
					!item.filename.includes('/thumbs/') && 
					!item.filename.includes('/bigthumbs/') &&
					!item.filename.includes('/'); // No subdirectories
			})
			.sort((a, b) => a.filename.localeCompare(b.filename)); // Sort by filename for consistency
		
		// Hash includes filename + metadata to detect content changes
		const finalFilesHash = createHash('sha256')
			.update(JSON.stringify(finalFilesWithMetadata))
			.digest('hex')
			.substring(0, 16); // Use first 16 chars for shorter hash

		// Prepare ZIP filename and S3 key
		const filename = `gallery-${galleryId}-order-${orderId}-final.zip`;
		const zipKey = `galleries/${galleryId}/orders/${orderId}/final-zip/${filename}`;
		const zipFnName = envProc?.env?.DOWNLOADS_ZIP_FN_NAME as string;
		
		if (!zipFnName) {
			return {
				statusCode: 500,
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ error: 'ZIP generation service not configured' })
			};
		}

		// Always check S3 first - ZIP might exist even if flag is still set (race condition)
		// This handles the case where ZIP was created but flag wasn't cleared yet
		// or flag might be cleared but ZIP not yet visible (S3 eventual consistency)
		let zipSize: number | undefined;
		let zipExists = false;
		let zipHashMatches = false;
		
		try {
			const headResponse = await s3.send(new HeadObjectCommand({
				Bucket: bucket,
				Key: zipKey
			}));
			zipSize = headResponse.ContentLength;
			zipExists = true;
			
			// Check if ZIP hash matches current final files hash
			const zipHashFromMetadata = headResponse.Metadata?.['finalfiles-hash'];
			const zipHashFromOrder = order.finalZipFilesHash;
			const storedHash = zipHashFromMetadata || zipHashFromOrder;
			
			if (storedHash === finalFilesHash) {
				zipHashMatches = true;
				console.log('Final ZIP found in S3 with matching hash', { 
					galleryId, 
					orderId, 
					zipKey, 
					zipSize,
					hash: finalFilesHash
				});
			} else {
				console.log('Final ZIP exists but hash mismatch - will regenerate', {
					galleryId,
					orderId,
					storedHash,
					currentHash: finalFilesHash,
					reason: storedHash ? 'final files changed' : 'no hash stored'
				});
			}
		} catch (headErr: any) {
			if (headErr.name === 'NoSuchKey' || headErr.name === 'NotFound') {
				zipExists = false;
			} else {
				throw headErr;
			}
		}
		
		// If ZIP exists AND hash matches, clear generating flag (if still set) and return URL
		if (zipExists && zipHashMatches) {
			// Clear flag if it's still set (idempotent operation)
			if (order.finalZipGenerating) {
				try {
					await ddb.send(new UpdateCommand({
						TableName: ordersTable,
						Key: { galleryId, orderId },
						UpdateExpression: 'REMOVE finalZipGenerating, finalZipGeneratingSince'
					}));
					console.log('Cleared finalZipGenerating flag', { galleryId, orderId });
				} catch (clearErr: any) {
					// Log but don't fail - ZIP exists, we can still return URL
					console.error('Failed to clear finalZipGenerating flag', {
						error: clearErr.message,
						galleryId,
						orderId
					});
				}
			}
			
			// Generate presigned URL and return
			const getObjectCmd = new GetObjectCommand({
				Bucket: bucket,
				Key: zipKey,
				ResponseContentDisposition: `attachment; filename="${filename}"`
			});
			const presignedUrl = await getSignedUrl(s3, getObjectCmd, { expiresIn: 3600 });
			
			return {
				statusCode: 200,
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					url: presignedUrl,
					filename,
					size: zipSize,
					expiresIn: 3600
				})
			};
		}
		
		// ZIP doesn't exist yet - check if it's generating
		const isGenerating = order.finalZipGenerating === true;
		const zipGeneratingSince = order.finalZipGeneratingSince as number | undefined;
		
		// Timeout protection: Clear flag only if generation has exceeded Lambda timeout
		// Lambda timeout is 15 minutes - we use 16 minutes (960 seconds) to account for any delays
		// This ensures:
		// 1. If Lambda completes successfully → it clears the flag itself
		// 2. If Lambda times out/crashes → we clear the flag after Lambda would have timed out
		// 3. If Lambda is still running → we don't interfere with legitimate long-running operations
		const LAMBDA_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes
		const TIMEOUT_BUFFER_MS = 1 * 60 * 1000; // 1 minute buffer
		const MAX_GENERATION_TIME_MS = LAMBDA_TIMEOUT_MS + TIMEOUT_BUFFER_MS; // 16 minutes total
		
		if (isGenerating && zipGeneratingSince) {
			const timeoutThreshold = Date.now() - MAX_GENERATION_TIME_MS;
			if (zipGeneratingSince < timeoutThreshold) {
				console.log('Final ZIP generation timeout - clearing flag and retrying', {
					galleryId,
					orderId,
					zipGeneratingSince: new Date(zipGeneratingSince).toISOString(),
					elapsedSeconds: Math.round((Date.now() - zipGeneratingSince) / 1000),
					lambdaTimeoutSeconds: LAMBDA_TIMEOUT_MS / 1000,
					reason: 'Exceeded Lambda timeout threshold - Lambda would have timed out or crashed'
				});
				// Clear the flag to allow retry
				try {
					await ddb.send(new UpdateCommand({
						TableName: ordersTable,
						Key: { galleryId, orderId },
						UpdateExpression: 'REMOVE finalZipGenerating, finalZipGeneratingSince'
					}));
				} catch (clearErr: any) {
					console.error('Failed to clear finalZipGenerating flag', clearErr.message);
				}
				// Fall through to start new generation
			} else {
				// Still generating (within timeout), return 202 with elapsed time
				const elapsedSeconds = Math.round((Date.now() - zipGeneratingSince) / 1000);
				console.log('Final ZIP still generating', { galleryId, orderId, elapsedSeconds });
				return {
					statusCode: 202,
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ 
						status: 'generating',
						message: 'ZIP is still being generated. Please check again in a moment.',
						orderId,
						galleryId,
						elapsedSeconds
					})
				};
			}
		} else if (isGenerating) {
			// Generating but no timestamp - clear flag and retry
			console.log('Final ZIP generating flag set but no timestamp - clearing and retrying', { galleryId, orderId });
			try {
				await ddb.send(new UpdateCommand({
					TableName: ordersTable,
					Key: { galleryId, orderId },
					UpdateExpression: 'REMOVE finalZipGenerating, finalZipGeneratingSince'
				}));
			} catch (clearErr: any) {
				console.error('Failed to clear finalZipGenerating flag', clearErr.message);
			}
			// Fall through to start new generation
		}
		
		// Not generating - start generation
		try {
			console.log('Starting final ZIP generation', { galleryId, orderId, finalFilesHash });
			const lambda = new LambdaClient({});
			const payload = Buffer.from(JSON.stringify({ 
				galleryId, 
				orderId, 
				type: 'final',
				finalFilesHash // Pass hash to ZIP generation function
			}));
			
			// Start async generation (fire and forget)
			const invokeResponse = await lambda.send(new InvokeCommand({ 
				FunctionName: zipFnName, 
				Payload: payload, 
				InvocationType: 'Event' // Async invocation
			}));
			
			// Check for invocation errors (FunctionError indicates the invocation itself failed)
			if (invokeResponse.FunctionError) {
				const errorPayload = invokeResponse.Payload ? JSON.parse(new TextDecoder().decode(invokeResponse.Payload)) : null;
				throw new Error(`Lambda invocation failed: ${invokeResponse.FunctionError}. ${errorPayload?.errorMessage || ''}`);
			}
			
			console.log('Lambda invoked for final ZIP generation', { 
				galleryId, 
				orderId, 
				zipFnName,
				statusCode: invokeResponse.StatusCode,
				functionError: invokeResponse.FunctionError
			});
			
			// Mark order as generating with timestamp and store hash
			await ddb.send(new UpdateCommand({
				TableName: ordersTable,
				Key: { galleryId, orderId },
				UpdateExpression: 'SET finalZipGenerating = :g, finalZipGeneratingSince = :ts, finalZipFilesHash = :h',
				ExpressionAttributeValues: { 
					':g': true,
					':ts': Date.now(),
					':h': finalFilesHash
				}
			}));
			
			console.log('Order marked as generating final ZIP', { galleryId, orderId });
		} catch (err: any) {
			console.error('Failed to start final ZIP generation', {
				error: err.message,
				galleryId,
				orderId,
				zipFnName
			});
			return {
				statusCode: 500,
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ 
					error: 'Failed to start ZIP generation', 
					message: err.message
				})
			};
		}
		
		// Return generating status
		return {
			statusCode: 202,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ 
				status: 'generating',
				message: 'ZIP is being generated. Please check again in a moment.',
				orderId,
				galleryId
			})
		};
	} catch (error: any) {
		console.error('Final ZIP download failed:', error);
		
		return {
			statusCode: 500,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ 
				error: 'Failed to generate download URL', 
				message: error.message,
				galleryId,
				orderId
			})
		};
	}
});

