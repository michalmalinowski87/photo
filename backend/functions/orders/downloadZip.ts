import { lambdaLogger } from '../../../packages/logger/src';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createHash } from 'crypto';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');
import { getUserIdFromEvent, requireOwnerOr403, verifyGalleryAccess } from '../../lib/src/auth';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const s3 = new S3Client({});

export const handler = lambdaLogger(async (event: any) => {
	const envProc = (globalThis as any).process;
	const ordersTable = envProc?.env?.ORDERS_TABLE as string;
	const galleriesTable = envProc?.env?.GALLERIES_TABLE as string;
	const bucket = envProc?.env?.GALLERIES_BUCKET as string;
	
	if (!ordersTable || !galleriesTable || !bucket) {
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

	// Supports both owner (Cognito) and client (JWT) tokens
	const access = verifyGalleryAccess(event, galleryId, gallery);
	if (!access.isOwner && !access.isClient) {
		return {
			statusCode: 401,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Unauthorized. Please log in.' })
		};
	}

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

	if (order.deliveryStatus === 'CANCELLED') {
		return {
			statusCode: 400,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Cannot download ZIP for canceled order' })
		};
	}

	// Always generate ZIP on-demand - check if generation is in progress or start new generation
	const expectedZipKey = `galleries/${galleryId}/zips/${orderId}.zip`;
	const zipFnName = envProc?.env?.DOWNLOADS_ZIP_FN_NAME as string;
	
	if (!zipFnName || !order.selectedKeys || !Array.isArray(order.selectedKeys) || order.selectedKeys.length === 0) {
		return {
			statusCode: 400,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ 
				error: 'ZIP generation service not configured or order has no selectedKeys',
				hasZipFnName: !!zipFnName,
				hasSelectedKeys: !!order.selectedKeys,
				selectedKeysCount: order.selectedKeys?.length || 0
			})
		};
	}

	// Generate hash of selectedKeys with file metadata to validate ZIP freshness
	// Includes filename + ETag + size + lastModified to detect content changes
	// If photographer reuploads file with same name but different content, ETag changes
	const selectedKeys = order.selectedKeys || [];
	
	// Fetch metadata for all selected files in parallel (with concurrency limit)
	const pLimit = require('p-limit');
	const limit = pLimit(10); // Limit concurrent HeadObject calls
	
	const filesWithMetadata = await Promise.all(
		selectedKeys.map(key => 
			limit(async () => {
				const s3Key = `galleries/${galleryId}/originals/${key}`;
				try {
					const headResponse = await s3.send(new HeadObjectCommand({
						Bucket: bucket,
						Key: s3Key
					}));
					return {
						filename: key,
						etag: headResponse.ETag || '',
						size: headResponse.ContentLength || 0,
						lastModified: headResponse.LastModified?.getTime() || 0
					};
				} catch (headErr: any) {
					if (headErr.name === 'NotFound' || headErr.name === 'NoSuchKey') {
						// File doesn't exist - include in hash with null values to detect missing files
						return {
							filename: key,
							etag: '',
							size: 0,
							lastModified: 0,
							missing: true
						};
					}
					throw headErr;
				}
			})
		)
	);
	
	// Sort by filename for consistent hashing
	filesWithMetadata.sort((a, b) => a.filename.localeCompare(b.filename));
	
	const selectedKeysHash = createHash('sha256')
		.update(JSON.stringify(filesWithMetadata))
		.digest('hex')
		.substring(0, 16); // Use first 16 chars for shorter hash

	try {
		// Always check S3 first - ZIP might exist even if flag is still set (race condition)
		// or flag might be cleared but ZIP not yet visible (S3 eventual consistency)
		let zipSize: number | undefined;
		let zipExists = false;
		let zipHashMatches = false;
		
		try {
			const headResponse = await s3.send(new HeadObjectCommand({
				Bucket: bucket,
				Key: expectedZipKey
			}));
			zipSize = headResponse.ContentLength;
			zipExists = true;
			
			// Check if ZIP hash matches current selectedKeys hash
			// Hash is stored in S3 metadata or order record
			const zipHashFromMetadata = headResponse.Metadata?.['selectedkeys-hash'];
			const zipHashFromOrder = order.zipSelectedKeysHash;
			const storedHash = zipHashFromMetadata || zipHashFromOrder;
			
			if (storedHash === selectedKeysHash) {
				zipHashMatches = true;
				console.log('ZIP found in S3 with matching hash', { 
					galleryId, 
					orderId, 
					zipKey: expectedZipKey, 
					zipSize,
					hash: selectedKeysHash
				});
			} else {
				console.log('ZIP exists but hash mismatch - will regenerate', {
					galleryId,
					orderId,
					storedHash,
					currentHash: selectedKeysHash,
					reason: storedHash ? 'selectedKeys changed' : 'no hash stored'
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
			if (order.zipGenerating) {
				try {
					await ddb.send(new UpdateCommand({
						TableName: ordersTable,
						Key: { galleryId, orderId },
						UpdateExpression: 'REMOVE zipGenerating, zipGeneratingSince'
					}));
					console.log('Cleared zipGenerating flag', { galleryId, orderId });
				} catch (clearErr: any) {
					// Log but don't fail - ZIP exists, we can still return URL
					console.error('Failed to clear zipGenerating flag', {
						error: clearErr.message,
						galleryId,
						orderId
					});
				}
			}
			
			// Generate presigned URL and return
			const getObjectCmd = new GetObjectCommand({
				Bucket: bucket,
				Key: expectedZipKey,
				ResponseContentDisposition: `attachment; filename="${orderId}.zip"`
			});
			const presignedUrl = await getSignedUrl(s3, getObjectCmd, { expiresIn: 3600 });
			
			return {
				statusCode: 200,
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					url: presignedUrl,
					filename: `${orderId}.zip`,
					size: zipSize,
					expiresIn: 3600
				})
			};
		}
		
		// ZIP doesn't exist yet - check if it's generating
		if (order.zipGenerating) {
			const zipGeneratingSince = order.zipGeneratingSince as number | undefined;
			
			// Check if generation has exceeded Lambda timeout
			const LAMBDA_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes
			const TIMEOUT_BUFFER_MS = 1 * 60 * 1000; // 1 minute buffer
			const MAX_GENERATION_TIME_MS = LAMBDA_TIMEOUT_MS + TIMEOUT_BUFFER_MS; // 16 minutes total
			
			if (zipGeneratingSince) {
				const timeoutThreshold = Date.now() - MAX_GENERATION_TIME_MS;
				if (zipGeneratingSince < timeoutThreshold) {
					// Generation has timed out - clear flag and fall through to start new generation
					console.log('ZIP generation timeout detected - clearing flag', {
						galleryId,
						orderId,
						zipGeneratingSince: new Date(zipGeneratingSince).toISOString(),
						elapsedSeconds: Math.round((Date.now() - zipGeneratingSince) / 1000),
						reason: 'Exceeded Lambda timeout threshold'
					});
					try {
						await ddb.send(new UpdateCommand({
							TableName: ordersTable,
							Key: { galleryId, orderId },
							UpdateExpression: 'REMOVE zipGenerating, zipGeneratingSince'
						}));
					} catch (clearErr: any) {
						console.error('Failed to clear zipGenerating flag', clearErr.message);
					}
					// Fall through to start new generation
				} else {
					// Still generating (within timeout), return 202
					const elapsedSeconds = Math.round((Date.now() - zipGeneratingSince) / 1000);
					console.log('ZIP still generating', { galleryId, orderId, elapsedSeconds });
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
			} else {
				// Generating but no timestamp - clear flag and fall through
				console.log('ZIP generating flag set but no timestamp - clearing flag', { galleryId, orderId });
				try {
					await ddb.send(new UpdateCommand({
						TableName: ordersTable,
						Key: { galleryId, orderId },
						UpdateExpression: 'REMOVE zipGenerating, zipGeneratingSince'
					}));
				} catch (clearErr: any) {
					console.error('Failed to clear zipGenerating flag', clearErr.message);
				}
				// Fall through to start new generation
			}
		}
		
		// ZIP doesn't exist and not generating - start generation
		const isGenerating = order.zipGenerating === true;
		const zipGeneratingSince = order.zipGeneratingSince as number | undefined;
		
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
				console.log('ZIP generation timeout - clearing flag and retrying', {
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
						UpdateExpression: 'REMOVE zipGenerating, zipGeneratingSince'
					}));
				} catch (clearErr: any) {
					console.error('Failed to clear zipGenerating flag', clearErr.message);
				}
				// Fall through to start new generation
			} else {
				// Still generating (within timeout), return 202 with elapsed time
				const elapsedSeconds = Math.round((Date.now() - zipGeneratingSince) / 1000);
				return {
					statusCode: 202,
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ 
						status: 'generating',
						message: 'ZIP is being generated. Please check again in a moment.',
						orderId,
						galleryId,
						elapsedSeconds
					})
				};
			}
		}
		
		// Not generating - start generation
		try {
			// Pre-check: Verify at least some files exist before starting generation
			// This prevents getting stuck in generating state if all files are missing
			const selectedKeys = order.selectedKeys || [];
			let existingFilesCount = 0;
			const missingFiles: string[] = [];
			
			// Check first few files to see if any exist (sample check for performance)
			const filesToCheck = selectedKeys.slice(0, Math.min(5, selectedKeys.length));
			for (const key of filesToCheck) {
				const originalKey = `galleries/${galleryId}/originals/${key}`;
				try {
					await s3.send(new HeadObjectCommand({
						Bucket: bucket,
						Key: originalKey
					}));
					existingFilesCount++;
				} catch (headErr: any) {
					if (headErr.name === 'NotFound' || headErr.name === 'NoSuchKey') {
						missingFiles.push(key);
					}
				}
			}
			
			// If we checked files and none exist, fail fast
			if (filesToCheck.length > 0 && existingFilesCount === 0) {
				console.error('All checked files are missing - failing ZIP generation', {
					galleryId,
					orderId,
					checkedFiles: filesToCheck.length,
					missingFiles: missingFiles.slice(0, 5)
				});
				return {
					statusCode: 404,
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ 
						error: 'Files not found',
						message: `Cannot generate ZIP: Selected files are missing from storage. ${missingFiles.length > 0 ? `Missing files: ${missingFiles.slice(0, 3).join(', ')}${missingFiles.length > 3 ? '...' : ''}` : 'Please check your selection.'}`,
						missingFilesCount: missingFiles.length,
						totalSelectedCount: selectedKeys.length
					})
				};
			}
			
			console.log('Starting ZIP generation', { galleryId, orderId, selectedKeysHash });
			const lambda = new LambdaClient({});
			const payload = Buffer.from(JSON.stringify({ 
				galleryId, 
				keys: order.selectedKeys, 
				orderId,
				selectedKeysHash // Pass hash to ZIP generation function
			}));
			
			// Start async generation (fire and forget)
			await lambda.send(new InvokeCommand({ 
				FunctionName: zipFnName, 
				Payload: payload, 
				InvocationType: 'Event' // Async invocation
			}));
			
			console.log('Lambda invoked for ZIP generation', { galleryId, orderId, zipFnName });
			
			// Mark order as generating with timestamp and store hash
			await ddb.send(new UpdateCommand({
				TableName: ordersTable,
				Key: { galleryId, orderId },
				UpdateExpression: 'SET zipGenerating = :g, zipGeneratingSince = :ts, zipSelectedKeysHash = :h',
				ExpressionAttributeValues: { 
					':g': true,
					':ts': Date.now(),
					':h': selectedKeysHash
				}
			}));
			
			console.log('Order marked as generating ZIP', { galleryId, orderId });
		} catch (err: any) {
			console.error('Failed to start ZIP generation', {
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
		console.error('Failed to generate download URL:', error);
		return {
			statusCode: 500,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Failed to generate download URL', message: error.message })
		};
	}
});

