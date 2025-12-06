import { lambdaLogger } from '../../../packages/logger/src';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Readable } from 'stream';
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

	// Check if ZIP exists in S3 (might have been generated recently)
	let zipExists = false;
	try {
		await s3.send(new GetObjectCommand({
			Bucket: bucket,
			Key: expectedZipKey
		}));
		zipExists = true;
	} catch (s3Err: any) {
		// ZIP doesn't exist, need to generate
		if (s3Err.name !== 'NoSuchKey' && s3Err.name !== 'NotFound') {
			console.error('Error checking S3 for ZIP:', s3Err.message);
			return {
				statusCode: 500,
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ error: 'Failed to check for ZIP', message: s3Err.message })
			};
		}
	}

	// If ZIP doesn't exist, start generation
	if (!zipExists) {
		const isGenerating = order.zipGenerating === true;
		const zipGeneratingSince = order.zipGeneratingSince as number | undefined;
		
		// If ZIP has been generating for more than 60 seconds, clear the flag and retry
		// Reduced from 5 minutes to catch quick failures (like missing files)
		if (isGenerating && zipGeneratingSince) {
			const oneMinuteAgo = Date.now() - (60 * 1000);
			if (zipGeneratingSince < oneMinuteAgo) {
				console.log('ZIP generation timeout - clearing flag and retrying', {
					galleryId,
					orderId,
					zipGeneratingSince: new Date(zipGeneratingSince).toISOString(),
					elapsedSeconds: Math.round((Date.now() - zipGeneratingSince) / 1000)
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
				// Still generating, return 202
				return {
					statusCode: 202, // Accepted - processing
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ 
						status: 'generating',
						message: 'ZIP is being generated. Please check again in a moment.',
						orderId,
						galleryId
					})
				};
			}
		}
		
		if (!isGenerating || !zipGeneratingSince) {
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
				
				const lambda = new LambdaClient({});
				const payload = Buffer.from(JSON.stringify({ galleryId, keys: order.selectedKeys, orderId }));
				
				// Start async generation (fire and forget)
				const invokeResult = await lambda.send(new InvokeCommand({ 
					FunctionName: zipFnName, 
					Payload: payload, 
					InvocationType: 'Event' // Async invocation
				}));
				
				// Mark order as generating with timestamp
				await ddb.send(new UpdateCommand({
					TableName: ordersTable,
					Key: { galleryId, orderId },
					UpdateExpression: 'SET zipGenerating = :g, zipGeneratingSince = :ts',
					ExpressionAttributeValues: { 
						':g': true,
						':ts': Date.now()
					}
				}));
			} catch (err: any) {
				return {
					statusCode: 500,
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ 
						error: 'Failed to start ZIP generation', 
						message: err.message
					})
				};
			}
		}
		
		// Return generating status
		return {
			statusCode: 202, // Accepted - processing
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ 
				status: 'generating',
				message: 'ZIP is being generated. Please check again in a moment.',
				orderId,
				galleryId
			})
		};
	}

	try {
		// Check if ZIP is still generating (clear the flag if ZIP exists)
		if (order.zipGenerating) {
			// Check if ZIP now exists in S3
			try {
				await s3.send(new GetObjectCommand({
					Bucket: bucket,
					Key: expectedZipKey
				}));
				// ZIP exists, clear generating flag
				await ddb.send(new UpdateCommand({
					TableName: ordersTable,
					Key: { galleryId, orderId },
					UpdateExpression: 'REMOVE zipGenerating, zipGeneratingSince'
				}));
			} catch (s3Err: any) {
				// ZIP still doesn't exist, return generating status
				if (s3Err.name === 'NoSuchKey' || s3Err.name === 'NotFound') {
					const zipGeneratingSince = order.zipGeneratingSince as number | undefined;
					const elapsedSeconds = zipGeneratingSince ? Math.round((Date.now() - zipGeneratingSince) / 1000) : 'unknown';
					return {
						statusCode: 202,
						headers: { 'content-type': 'application/json' },
						body: JSON.stringify({ 
							status: 'generating',
							message: 'ZIP is still being generated. Please check again in a moment.',
							orderId,
							galleryId
						})
					};
				}
				throw s3Err;
			}
		}
		
		// Get ZIP file from S3
		const getObjectResponse = await s3.send(new GetObjectCommand({
			Bucket: bucket,
			Key: expectedZipKey
		}));

		if (!getObjectResponse.Body) {
			return {
				statusCode: 404,
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ error: 'ZIP file not found' })
			};
		}

		// Read the ZIP file into a buffer
		const chunks: Buffer[] = [];
		const stream = getObjectResponse.Body;
		
		if (!stream) {
			return {
				statusCode: 404,
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ error: 'ZIP file body is empty' })
			};
		}
		
		// Read stream into buffer chunks
		
		for await (const chunk of stream as Readable) {
			chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
		}
		
		const zipBuffer = Buffer.concat(chunks);
		
		// Verify we got the expected amount of data
		const contentLength = getObjectResponse.ContentLength;
		
		// Validate ZIP buffer - check for ZIP magic bytes (PK header)
		if (zipBuffer.length === 0) {
			console.error('ZIP file is empty', { galleryId, orderId, zipKey: expectedZipKey });
			return {
				statusCode: 500,
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ error: 'ZIP file is empty' })
			};
		}

		// Check for ZIP file signature (PK\x03\x04 or PK\x05\x06 for empty ZIP)
		const zipSignature = zipBuffer.slice(0, 2).toString('ascii');
		if (zipSignature !== 'PK') {
			console.error('Invalid ZIP file signature', {
				signature: zipSignature,
				firstBytes: Array.from(zipBuffer.slice(0, 10)),
				bufferLength: zipBuffer.length,
				galleryId,
				orderId,
				zipKey: expectedZipKey
			});
			return {
				statusCode: 500,
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ error: 'ZIP file appears to be corrupted' })
			};
		}

		console.log('Serving ZIP file', {
			galleryId,
			orderId,
			zipKey: expectedZipKey,
			zipSize: zipBuffer.length,
			zipSignature
		});

		// Delete ZIP after serving (one-time use)
		try {
			await s3.send(new DeleteObjectCommand({
				Bucket: bucket,
				Key: expectedZipKey
			}));
			
			console.log('ZIP deleted after one-time download', {
				galleryId,
				orderId,
				zipKey: expectedZipKey
			});
		} catch (deleteErr: any) {
			// Log error but don't fail the download
			console.error('Failed to delete ZIP after download', {
				error: deleteErr.message,
				galleryId,
				orderId,
				zipKey: expectedZipKey
			});
		}

		// Return ZIP file directly through API as binary response
		// API Gateway will handle base64 encoding automatically when isBase64Encoded is true
		return {
			statusCode: 200,
			headers: { 
				'content-type': 'application/zip',
				'Content-Disposition': `attachment; filename="${orderId}.zip"`,
				'Content-Length': zipBuffer.length.toString(),
				'x-one-time-use': 'true'
			},
			body: zipBuffer.toString('base64'),
			isBase64Encoded: true
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

