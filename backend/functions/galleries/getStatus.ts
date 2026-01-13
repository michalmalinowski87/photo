import { lambdaLogger } from '../../../packages/logger/src';
import { ddbGet } from '../../lib/src/ddb';
import { getUserIdFromEvent, verifyGalleryAccess } from '../../lib/src/auth';
import { getPaidTransactionForGallery } from '../../lib/src/transactions';

export const handler = lambdaLogger(async (event: any) => {
	const id = event?.pathParameters?.id;
	if (!id) return { statusCode: 400, body: JSON.stringify({ error: 'missing id' }) };
	const envProc = (globalThis as any).process;
	const tableName = envProc && envProc.env ? (envProc.env.GALLERIES_TABLE as string) : '';
	const gallery = await ddbGet<any>(tableName, { galleryId: id });
	if (!gallery) {
		return { statusCode: 404, body: JSON.stringify({ error: 'not found' }) };
	}
	
	// Support both owner and client tokens
	const access = await verifyGalleryAccess(event, id, gallery);
	if (!access.isOwner && !access.isClient) {
		return { statusCode: 403, body: JSON.stringify({ error: 'forbidden' }) };
	}
	
	// Derive payment status from transactions
	let isPaid = false;
	let paymentStatus = 'UNPAID';
	try {
		const paidTransaction = await getPaidTransactionForGallery(id);
		isPaid = !!paidTransaction;
		paymentStatus = isPaid ? 'PAID' : 'UNPAID';
	} catch (err) {
		// If transaction check fails, fall back to gallery state
		isPaid = gallery.state === 'PAID_ACTIVE';
		paymentStatus = isPaid ? 'PAID' : 'UNPAID';
	}

	// Update state based on payment status
	let effectiveState = gallery.state;
	if (!isPaid && gallery.state !== 'EXPIRED') {
		effectiveState = 'DRAFT';
	} else if (isPaid && gallery.state !== 'EXPIRED') {
		effectiveState = 'PAID_ACTIVE';
	}

	// Return status fields and gallery name (for client access)
	return {
		statusCode: 200,
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			state: effectiveState,
			paymentStatus,
			isPaid,
			galleryName: gallery.galleryName || null,
		})
	};
});

