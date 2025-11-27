import { lambdaLogger } from '@photocloud/logger';

export const handler = lambdaLogger(async () => {
	return {
		statusCode: 200,
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ ok: true })
	};
});

