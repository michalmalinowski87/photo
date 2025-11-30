import { lambdaLogger } from '../../../packages/logger/src';
import { ddbGet } from '../../lib/src/ddb';
import { getUserIdFromEvent, requireOwnerOr403 } from '../../lib/src/auth';

export const handler = lambdaLogger(async (event: any) => {
	const id = event?.pathParameters?.id;
	if (!id) return { statusCode: 400, body: JSON.stringify({ error: 'missing id' }) };
	const envProc = (globalThis as any).process;
	const tableName = envProc && envProc.env ? (envProc.env.GALLERIES_TABLE as string) : '';
	const gallery = await ddbGet<any>(tableName, { galleryId: id });
	if (!gallery) {
		return { statusCode: 404, body: JSON.stringify({ error: 'not found' }) };
	}
	const requesterId = getUserIdFromEvent(event);
	requireOwnerOr403(gallery.ownerId, requesterId);
	
	// Return only bytes used fields - lightweight endpoint
	return {
		statusCode: 200,
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			originalsBytesUsed: gallery.originalsBytesUsed ?? 0,
			finalsBytesUsed: gallery.finalsBytesUsed ?? 0,
		})
	};
});

