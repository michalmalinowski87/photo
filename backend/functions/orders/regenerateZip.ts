import { lambdaLogger } from '../../../packages/logger/src';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');
import { getUserIdFromEvent, requireOwnerOr403 } from '../../lib/src/auth';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const lambda = new LambdaClient({});

export const handler = lambdaLogger(async (event: any) => {
	const envProc = (globalThis as any).process;
	const galleriesTable = envProc?.env?.GALLERIES_TABLE as string;
	const ordersTable = envProc?.env?.ORDERS_TABLE as string;
	const zipFnName = envProc?.env?.DOWNLOADS_ZIP_FN_NAME as string;
	if (!galleriesTable || !ordersTable || !zipFnName) return { statusCode: 500, body: 'Missing env' };
	const galleryId = event?.pathParameters?.id;
	const orderId = event?.pathParameters?.orderId;
	if (!galleryId || !orderId) return { statusCode: 400, body: 'missing params' };
	const requester = getUserIdFromEvent(event);
	const g = await ddb.send(new GetCommand({ TableName: galleriesTable, Key: { galleryId } }));
	const gallery = g.Item as any;
	if (!gallery) return { statusCode: 404, body: 'not found' };
	requireOwnerOr403(gallery.ownerId, requester);

	const o = await ddb.send(new GetCommand({ TableName: ordersTable, Key: { galleryId, orderId } }));
	const order = o.Item as any;
	if (!order) return { statusCode: 404, body: 'order not found' };

	try {
		const payload = Buffer.from(JSON.stringify({ galleryId, keys: order.selectedKeys, orderId }));
		const invokeResponse = await lambda.send(new InvokeCommand({ 
			FunctionName: zipFnName, 
			Payload: payload, 
			InvocationType: 'RequestResponse'
		}));
		
		let zipKey: string | undefined;
		if (invokeResponse.Payload) {
			const payloadString = Buffer.from(invokeResponse.Payload).toString();
			let zipResult: any;
			try {
				zipResult = JSON.parse(payloadString);
			} catch (parseErr: any) {
				console.error('Failed to parse ZIP generation response:', parseErr.message);
				return { 
					statusCode: 500, 
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ error: 'ZIP generation returned invalid JSON', message: parseErr.message }) 
				};
			}
			
			// Check if Lambda invocation itself failed
			if (zipResult.errorMessage) {
				console.error('ZIP generation Lambda invocation error:', zipResult);
				return { 
					statusCode: 500, 
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ error: 'ZIP generation Lambda invocation failed', lambdaError: zipResult.errorMessage }) 
				};
			}
			
			// When Lambda is invoked directly, it returns { statusCode, body } format
			// The body is a JSON string that needs to be parsed
			if (zipResult.statusCode && zipResult.body) {
				try {
					const bodyParsed = typeof zipResult.body === 'string' ? JSON.parse(zipResult.body) : zipResult.body;
					if (zipResult.statusCode !== 200) {
						console.error('ZIP generation Lambda returned error status:', { statusCode: zipResult.statusCode, body: bodyParsed });
						return { 
							statusCode: zipResult.statusCode, 
							headers: { 'content-type': 'application/json' },
							body: JSON.stringify({ error: 'ZIP generation failed', lambdaError: bodyParsed.error || bodyParsed, message: bodyParsed.message }) 
						};
					}
					// Success - use the parsed body as the result
					zipResult = bodyParsed;
				} catch (bodyParseErr: any) {
					console.error('Failed to parse Lambda response body:', bodyParseErr.message);
					return { 
						statusCode: 500, 
						headers: { 'content-type': 'application/json' },
						body: JSON.stringify({ error: 'ZIP generation returned invalid body format', message: bodyParseErr.message }) 
					};
				}
			}
			
			if (zipResult.zipKey) {
				zipKey = zipResult.zipKey;
				await ddb.send(new UpdateCommand({
					TableName: ordersTable,
					Key: { galleryId, orderId },
					UpdateExpression: 'SET zipKey = :z',
					ExpressionAttributeValues: { ':z': zipKey }
				}));
			} else {
				console.error('ZIP generation did not return zipKey:', zipResult);
				return { 
					statusCode: 500, 
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ error: 'ZIP generation did not return zipKey', response: zipResult }) 
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
		
		if (!zipKey) {
			return { 
				statusCode: 500, 
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ error: 'ZIP generation did not return zipKey' }) 
			};
		}

		return { 
			statusCode: 200, 
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ galleryId, orderId, zipKey }) 
		};
	} catch (e: any) {
		console.error('ZIP regeneration failed:', e);
		return { 
			statusCode: 500, 
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'zip regeneration failed', message: e.message }) 
		};
	}
});


