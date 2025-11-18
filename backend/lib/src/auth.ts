export function getUserIdFromEvent(event: any): string {
	const claims = event?.requestContext?.authorizer?.jwt?.claims || {};
	return claims.sub || claims.username || '';
}

export function requireOwnerOr403(resourceOwnerId: string, requesterId: string) {
	if (!requesterId || resourceOwnerId !== requesterId) {
		const err: any = new Error('forbidden');
		err.statusCode = 403;
		throw err;
	}
}

