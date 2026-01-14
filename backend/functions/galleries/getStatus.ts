import { lambdaLogger } from '../../../packages/logger/src';
import { ddbGet } from '../../lib/src/ddb';
import { getUserIdFromEvent, verifyGalleryAccess } from '../../lib/src/auth';
import { getJWTFromEvent } from '../../lib/src/jwt';
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
	// Check client JWT first (like getSelection does) for better reliability
	let hasAccess = false;
	
	// Try client JWT token first
	const jwtPayload = await getJWTFromEvent(event);
	if (jwtPayload && jwtPayload.galleryId === id) {
		hasAccess = true;
	} else {
		// Fall back to owner access check
		const access = await verifyGalleryAccess(event, id, gallery);
		hasAccess = access.isOwner || access.isClient;
	}
	
	if (!hasAccess) {
		return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized. Please log in.' }) };
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

