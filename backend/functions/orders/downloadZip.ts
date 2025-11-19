import { lambdaLogger } from '../../../packages/logger/src';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');
import { getUserIdFromEvent, requireOwnerOr403 } from '../../lib/src/auth';
import { hasAddon, ADDON_TYPES } from '../../lib/src/addons';

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

	const requester = getUserIdFromEvent(event);
	if (!requester) {
		return {
			statusCode: 401,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Unauthorized' })
		};
	}

	// Verify gallery ownership
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
	requireOwnerOr403(gallery.ownerId, requester);

	// Get order
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

	// Don't allow download of canceled orders
	if (order.deliveryStatus === 'CANCELLED') {
		return {
			statusCode: 400,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Cannot download ZIP for canceled order' })
		};
	}

	// If ZIP doesn't exist in order record, check if it exists in S3 first
	if (!order.zipKey) {
		// Check if ZIP already exists in S3 (maybe it was created but order wasn't updated)
		const expectedZipKey = `galleries/${galleryId}/zips/${orderId}.zip`;
		try {
			// Try to access the ZIP file in S3
			await s3.send(new GetObjectCommand({
				Bucket: bucket,
				Key: expectedZipKey
			}));
			// ZIP exists! Update the order record with the zipKey
			await ddb.send(new UpdateCommand({
				TableName: ordersTable,
				Key: { galleryId, orderId },
				UpdateExpression: 'SET zipKey = :z',
				ExpressionAttributeValues: { ':z': expectedZipKey }
			}));
			order.zipKey = expectedZipKey;
		} catch (s3Err: any) {
			// ZIP doesn't exist in S3, try to generate it
			if (s3Err.name !== 'NoSuchKey' && s3Err.name !== 'NotFound') {
				console.error('Error checking S3 for existing ZIP:', s3Err.message);
				return {
					statusCode: 500,
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ error: 'Failed to check for existing ZIP', message: s3Err.message })
				};
			}
			
			// ZIP doesn't exist, generate it
			const zipFnName = envProc?.env?.DOWNLOADS_ZIP_FN_NAME as string;
			if (zipFnName && order.selectedKeys && Array.isArray(order.selectedKeys) && order.selectedKeys.length > 0) {
				try {
					const lambda = new LambdaClient({});
					const payload = Buffer.from(JSON.stringify({ galleryId, keys: order.selectedKeys, orderId }));
					const invokeResponse = await lambda.send(new InvokeCommand({ 
						FunctionName: zipFnName, 
						Payload: payload, 
						InvocationType: 'RequestResponse'
					}));
					
					if (invokeResponse.Payload) {
						const payloadString = Buffer.from(invokeResponse.Payload).toString();
						let zipResult: any;
						try {
							zipResult = JSON.parse(payloadString);
						} catch (parseErr: any) {
							console.error('Failed to parse ZIP generation response:', {
								payloadString,
								error: parseErr.message
							});
							return {
								statusCode: 500,
								headers: { 'content-type': 'application/json' },
								body: JSON.stringify({ 
									error: 'ZIP generation returned invalid JSON', 
									message: parseErr.message,
									payloadPreview: payloadString.substring(0, 200)
								})
							};
						}
					
					// Check if Lambda invocation itself failed (errorMessage indicates Lambda error)
					if (zipResult.errorMessage) {
						console.error('ZIP generation Lambda invocation error:', zipResult);
						return {
							statusCode: 500,
							headers: { 'content-type': 'application/json' },
							body: JSON.stringify({ 
								error: 'ZIP generation Lambda invocation failed', 
								lambdaError: zipResult.errorMessage,
								errorType: zipResult.errorType,
								stackTrace: zipResult.stackTrace
							})
						};
					}
					
					// When Lambda is invoked directly, it returns { statusCode, body } format
					// The body is a JSON string that needs to be parsed
					if (zipResult.statusCode && zipResult.body) {
						try {
							const bodyParsed = typeof zipResult.body === 'string' ? JSON.parse(zipResult.body) : zipResult.body;
							if (zipResult.statusCode !== 200) {
								console.error('ZIP generation Lambda returned error status:', {
									statusCode: zipResult.statusCode,
									body: bodyParsed
								});
								return {
									statusCode: zipResult.statusCode,
									headers: { 'content-type': 'application/json' },
									body: JSON.stringify({ 
										error: 'ZIP generation failed', 
										lambdaError: bodyParsed.error || bodyParsed,
										message: bodyParsed.message
									})
								};
							}
							// Success - use the parsed body as the result
							zipResult = bodyParsed;
						} catch (bodyParseErr: any) {
							console.error('Failed to parse Lambda response body:', {
								body: zipResult.body,
								error: bodyParseErr.message
							});
							return {
								statusCode: 500,
								headers: { 'content-type': 'application/json' },
								body: JSON.stringify({ 
									error: 'ZIP generation returned invalid body format', 
									message: bodyParseErr.message
								})
							};
						}
					}
					
					if (zipResult.zipKey) {
						// Update order with zipKey
						await ddb.send(new UpdateCommand({
							TableName: ordersTable,
							Key: { galleryId, orderId },
							UpdateExpression: 'SET zipKey = :z',
							ExpressionAttributeValues: { ':z': zipResult.zipKey }
						}));
						order.zipKey = zipResult.zipKey;
					} else {
						console.error('ZIP generation did not return zipKey:', zipResult);
						return {
							statusCode: 500,
							headers: { 'content-type': 'application/json' },
							body: JSON.stringify({ 
								error: 'ZIP generation did not return zipKey',
								response: zipResult
							})
						};
					}
					} else {
						console.error('ZIP generation returned no payload');
						return {
							statusCode: 500,
							headers: { 'content-type': 'application/json' },
							body: JSON.stringify({ error: 'ZIP generation returned no payload' })
						};
					}
				} catch (err: any) {
					console.error('Failed to auto-generate ZIP:', {
						error: err.message,
						stack: err.stack,
						galleryId,
						orderId,
						hasZipFnName: !!zipFnName,
						hasSelectedKeys: !!order.selectedKeys,
						selectedKeysCount: order.selectedKeys?.length || 0
					});
					return {
						statusCode: 500,
						headers: { 'content-type': 'application/json' },
						body: JSON.stringify({ 
							error: 'ZIP generation failed', 
							message: err.message,
							details: {
								galleryId,
								orderId,
								hasZipFnName: !!zipFnName,
								hasSelectedKeys: !!order.selectedKeys,
								selectedKeysCount: order.selectedKeys?.length || 0
							}
						})
					};
				}
			} else {
				return {
					statusCode: 404,
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ error: 'ZIP not found for this order. Order has no selectedKeys to generate ZIP from.' })
				};
			}
		}
	}

	try {
		// Check if gallery has backup addon (gallery-level)
		const galleryHasBackup = await hasAddon(galleryId, ADDON_TYPES.BACKUP_STORAGE);
		
		// Get ZIP file from S3
		const getObjectResponse = await s3.send(new GetObjectCommand({
			Bucket: bucket,
			Key: order.zipKey
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
		const stream = getObjectResponse.Body as any;
		for await (const chunk of stream) {
			chunks.push(Buffer.from(chunk));
		}
		const zipBuffer = Buffer.concat(chunks);

		// If gallery does NOT have backup addon, delete ZIP after serving (one-time use)
		if (!galleryHasBackup && order.zipKey) {
			try {
				await s3.send(new DeleteObjectCommand({
					Bucket: bucket,
					Key: order.zipKey
				}));
				
				// Remove zipKey from order record
				await ddb.send(new UpdateCommand({
					TableName: ordersTable,
					Key: { galleryId, orderId },
					UpdateExpression: 'REMOVE zipKey'
				}));
				
				console.log('ZIP deleted after one-time download (no backup addon)', {
					galleryId,
					orderId,
					zipKey: order.zipKey
				});
			} catch (deleteErr: any) {
				// Log error but don't fail the download
				console.error('Failed to delete ZIP after download', {
					error: deleteErr.message,
					galleryId,
					orderId,
					zipKey: order.zipKey
				});
			}
		}

		// Return ZIP file directly through API as binary response
		// API Gateway will handle base64 encoding automatically when isBase64Encoded is true
		return {
			statusCode: 200,
			headers: { 
				'content-type': 'application/zip',
				'Content-Disposition': `attachment; filename="${orderId}.zip"`,
				'Content-Length': zipBuffer.length.toString(),
				'x-one-time-use': (!galleryHasBackup).toString()
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

