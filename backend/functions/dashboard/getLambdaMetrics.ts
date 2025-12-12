import { lambdaLogger } from '../../../packages/logger/src';
import { CloudWatchClient, GetMetricStatisticsCommand } from '@aws-sdk/client-cloudwatch';
import { LambdaClient, ListFunctionsCommand } from '@aws-sdk/client-lambda';
import { getUserIdFromEvent } from '../../lib/src/auth';

// CloudWatch and Lambda clients will be initialized with region from environment
// Initialize them inside the handler to use the correct region
let cloudwatch: CloudWatchClient;
let lambda: LambdaClient;

interface LambdaMemoryMetric {
	functionName: string;
	allocatedMemoryMB: number;
	maxMemoryUsedMB: number;
	averageMemoryUsedMB: number;
	memoryUtilizationPercent: number;
	averageDurationMs: number;
	maxDurationMs: number;
	invocations: number;
	errors: number;
	recommendation: string;
}

export const handler = lambdaLogger(async (event: any) => {
	const ownerId = getUserIdFromEvent(event);
	if (!ownerId) {
		return {
			statusCode: 401,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Unauthorized' })
		};
	}

	const envProc = (globalThis as any).process;
	const stage = envProc?.env?.STAGE || 'dev';
	
	// Initialize Lambda client first to discover the region from function ARNs
	// AWS Lambda automatically sets AWS_REGION, but we'll also extract from function ARNs as fallback
	lambda = new LambdaClient({});
	
	try {
		// List all Lambda functions for this stack
		const listFunctionsResponse = await lambda.send(new ListFunctionsCommand({}));
		const functionPrefix = `PhotoHub-${stage}-`;
		const functions = listFunctionsResponse.Functions?.filter(fn => 
			fn.FunctionName?.startsWith(functionPrefix)
		) || [];
		
		// Extract region from first function's ARN (all functions should be in same region)
		// ARN format: arn:aws:lambda:REGION:ACCOUNT:function:NAME
		let region = process.env.AWS_REGION || 'us-east-1';
		if (functions.length > 0 && functions[0].FunctionArn) {
			const arnParts = functions[0].FunctionArn.split(':');
			if (arnParts.length >= 4) {
				region = arnParts[3]; // Region is the 4th part of the ARN
			}
		}
		
		// Re-initialize clients with the correct region
		cloudwatch = new CloudWatchClient({ region });
		lambda = new LambdaClient({ region });

		if (functions.length === 0) {
			return {
				statusCode: 200,
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ 
					metrics: [],
					message: 'No Lambda functions found for this stage'
				})
			};
		}

		// Get metrics for each function
		const endTime = new Date();
		const startTime = new Date(endTime.getTime() - 7 * 24 * 60 * 60 * 1000); // Last 7 days
		const period = 3600; // 1 hour periods

		const metricsPromises = functions.map(async (fn) => {
			const functionName = fn.FunctionName!;
			const allocatedMemoryMB = fn.MemorySize || 256;

			// Get MaxMemoryUsed metric
			const maxMemoryCmd = new GetMetricStatisticsCommand({
				Namespace: 'AWS/Lambda',
				MetricName: 'MaxMemoryUsed',
				Dimensions: [{ Name: 'FunctionName', Value: functionName }],
				StartTime: startTime,
				EndTime: endTime,
				Period: period,
				Statistics: ['Maximum', 'Average']
			});

			// Get Duration metric
			const durationCmd = new GetMetricStatisticsCommand({
				Namespace: 'AWS/Lambda',
				MetricName: 'Duration',
				Dimensions: [{ Name: 'FunctionName', Value: functionName }],
				StartTime: startTime,
				EndTime: endTime,
				Period: period,
				Statistics: ['Maximum', 'Average']
			});

			// Get Invocations metric
			const invocationsCmd = new GetMetricStatisticsCommand({
				Namespace: 'AWS/Lambda',
				MetricName: 'Invocations',
				Dimensions: [{ Name: 'FunctionName', Value: functionName }],
				StartTime: startTime,
				EndTime: endTime,
				Period: period,
				Statistics: ['Sum']
			});

			// Get Errors metric
			const errorsCmd = new GetMetricStatisticsCommand({
				Namespace: 'AWS/Lambda',
				MetricName: 'Errors',
				Dimensions: [{ Name: 'FunctionName', Value: functionName }],
				StartTime: startTime,
				EndTime: endTime,
				Period: period,
				Statistics: ['Sum']
			});

			const [maxMemoryData, durationData, invocationsData, errorsData] = await Promise.all([
				cloudwatch.send(maxMemoryCmd),
				cloudwatch.send(durationCmd),
				cloudwatch.send(invocationsCmd),
				cloudwatch.send(errorsCmd)
			]);

			// Extract maximum values
			const maxMemoryUsedMB = maxMemoryData.Datapoints?.length > 0
				? Math.max(...maxMemoryData.Datapoints.map(d => d.Maximum || 0)) / (1024 * 1024)
				: 0;

			const avgMemoryUsedMB = maxMemoryData.Datapoints?.length > 0
				? maxMemoryData.Datapoints.reduce((sum, d) => sum + (d.Average || 0), 0) / maxMemoryData.Datapoints.length / (1024 * 1024)
				: 0;

			const avgDurationMs = durationData.Datapoints?.length > 0
				? durationData.Datapoints.reduce((sum, d) => sum + (d.Average || 0), 0) / durationData.Datapoints.length
				: 0;

			const maxDurationMs = durationData.Datapoints?.length > 0
				? Math.max(...durationData.Datapoints.map(d => d.Maximum || 0))
				: 0;

			const invocations = invocationsData.Datapoints?.reduce((sum, d) => sum + (d.Sum || 0), 0) || 0;
			const errors = errorsData.Datapoints?.reduce((sum, d) => sum + (d.Sum || 0), 0) || 0;

			const memoryUtilizationPercent = allocatedMemoryMB > 0
				? (maxMemoryUsedMB / allocatedMemoryMB) * 100
				: 0;

			// Generate recommendation
			let recommendation = 'Optimal';
			// Check if function has been invoked - if invocations > 0 but memory is 0, there might be a metrics delay
			if (maxMemoryUsedMB === 0 && invocations === 0) {
				recommendation = 'No data - function may not have been invoked recently';
			} else if (maxMemoryUsedMB === 0 && invocations > 0) {
				// Function has been invoked but memory metrics are not available yet (CloudWatch delay)
				recommendation = `Active (${invocations} invocations) - Memory metrics may be delayed in CloudWatch`;
			} else if (memoryUtilizationPercent < 50) {
				const suggestedMB = Math.max(128, Math.ceil(maxMemoryUsedMB * 1.5 / 64) * 64); // Round to nearest 64MB
				recommendation = `Over-allocated - Consider reducing to ${suggestedMB}MB (saves ~${Math.round((allocatedMemoryMB - suggestedMB) / allocatedMemoryMB * 100)}% cost)`;
			} else if (memoryUtilizationPercent > 90) {
				const suggestedMB = Math.ceil(allocatedMemoryMB * 1.5 / 64) * 64; // Round to nearest 64MB
				recommendation = `Near limit - Consider increasing to ${suggestedMB}MB to avoid OOM errors`;
			} else if (memoryUtilizationPercent >= 50 && memoryUtilizationPercent <= 70) {
				recommendation = 'Optimal allocation';
			} else {
				recommendation = 'Good allocation (70-90% utilization)';
			}

			return {
				functionName,
				allocatedMemoryMB,
				maxMemoryUsedMB: Math.round(maxMemoryUsedMB * 10) / 10,
				averageMemoryUsedMB: Math.round(avgMemoryUsedMB * 10) / 10,
				memoryUtilizationPercent: Math.round(memoryUtilizationPercent * 10) / 10,
				averageDurationMs: Math.round(avgDurationMs),
				maxDurationMs: Math.round(maxDurationMs),
				invocations: Math.round(invocations),
				errors: Math.round(errors),
				recommendation
			} as LambdaMemoryMetric;
		});

		const metrics = await Promise.all(metricsPromises);

		// Sort by function name
		metrics.sort((a, b) => a.functionName.localeCompare(b.functionName));

		return {
			statusCode: 200,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ 
				metrics,
				period: '7 days',
				region
			})
		};
	} catch (error: any) {
		console.error('Error fetching Lambda metrics:', error);
		return {
			statusCode: 500,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ 
				error: 'Failed to fetch Lambda metrics',
				message: error.message 
			})
		};
	}
});

