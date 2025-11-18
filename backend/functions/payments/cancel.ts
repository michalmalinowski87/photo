import { lambdaLogger } from '../../../packages/logger/src';

export const handler = lambdaLogger(async (event: any) => {
	const envProc = (globalThis as any).process;
	// Get dashboard URL from environment - prioritize dashboard-specific env var
	// PUBLIC_GALLERY_URL is for the client gallery frontend, not the dashboard
	const dashboardUrl = envProc?.env?.PUBLIC_DASHBOARD_URL || envProc?.env?.NEXT_PUBLIC_DASHBOARD_URL || 'http://localhost:3000';
	
	// Redirect to dashboard galleries page with cancel message
	const redirectUrl = `${dashboardUrl}/galleries?payment=cancelled`;

	return {
		statusCode: 302,
		headers: {
			Location: redirectUrl
		},
		body: ''
	};
});

