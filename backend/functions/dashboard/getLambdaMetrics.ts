import { lambdaLogger } from '../../../packages/logger/src';
import { CloudWatchClient, GetMetricDataCommand } from '@aws-sdk/client-cloudwatch';
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
		const period = 300; // 5 minute periods (CloudWatch standard granularity)

		const metricsPromises = functions.map(async (fn) => {
			const functionName = fn.FunctionName!;
			const allocatedMemoryMB = fn.MemorySize || 256;

			try {
				// Use GetMetricData for better reliability (recommended by AWS)
				// This API is more reliable and handles larger time ranges better
				const metricDataCmd = new GetMetricDataCommand({
					MetricDataQueries: [
						{
							Id: 'maxMemory',
							MetricStat: {
								Metric: {
									Namespace: 'AWS/Lambda',
									MetricName: 'MaxMemoryUsed',
									Dimensions: [{ Name: 'FunctionName', Value: functionName }]
								},
								Period: period,
								Stat: 'Maximum'
							},
							ReturnData: true
						},
						{
							Id: 'avgMemory',
							MetricStat: {
								Metric: {
									Namespace: 'AWS/Lambda',
									MetricName: 'MaxMemoryUsed',
									Dimensions: [{ Name: 'FunctionName', Value: functionName }]
								},
								Period: period,
								Stat: 'Average'
							},
							ReturnData: true
						},
						{
							Id: 'duration',
							MetricStat: {
								Metric: {
									Namespace: 'AWS/Lambda',
									MetricName: 'Duration',
									Dimensions: [{ Name: 'FunctionName', Value: functionName }]
								},
								Period: period,
								Stat: 'Average'
							},
							ReturnData: true
						},
						{
							Id: 'maxDuration',
							MetricStat: {
								Metric: {
									Namespace: 'AWS/Lambda',
									MetricName: 'Duration',
									Dimensions: [{ Name: 'FunctionName', Value: functionName }]
								},
								Period: period,
								Stat: 'Maximum'
							},
							ReturnData: true
						},
						{
							Id: 'invocations',
							MetricStat: {
								Metric: {
									Namespace: 'AWS/Lambda',
									MetricName: 'Invocations',
									Dimensions: [{ Name: 'FunctionName', Value: functionName }]
								},
								Period: period,
								Stat: 'Sum'
							},
							ReturnData: true
						},
						{
							Id: 'errors',
							MetricStat: {
								Metric: {
									Namespace: 'AWS/Lambda',
									MetricName: 'Errors',
									Dimensions: [{ Name: 'FunctionName', Value: functionName }]
								},
								Period: period,
								Stat: 'Sum'
							},
							ReturnData: true
						}
					],
					StartTime: startTime,
					EndTime: endTime
				});

				const metricData = await cloudwatch.send(metricDataCmd);

				// Extract metric results
				const maxMemoryResult = metricData.MetricDataResults?.find(r => r.Id === 'maxMemory');
				const avgMemoryResult = metricData.MetricDataResults?.find(r => r.Id === 'avgMemory');
				const durationResult = metricData.MetricDataResults?.find(r => r.Id === 'duration');
				const maxDurationResult = metricData.MetricDataResults?.find(r => r.Id === 'maxDuration');
				const invocationsResult = metricData.MetricDataResults?.find(r => r.Id === 'invocations');
				const errorsResult = metricData.MetricDataResults?.find(r => r.Id === 'errors');

				// Extract values from GetMetricData format
				// Values are in bytes for MaxMemoryUsed, milliseconds for Duration
				const maxMemoryValues = maxMemoryResult?.Values || [];
				const avgMemoryValues = avgMemoryResult?.Values || [];
				const durationValues = durationResult?.Values || [];
				const maxDurationValues = maxDurationResult?.Values || [];
				const invocationsValues = invocationsResult?.Values || [];
				const errorsValues = errorsResult?.Values || [];

				// Calculate metrics
				const maxMemoryUsedMB = maxMemoryValues.length > 0
					? Math.max(...maxMemoryValues.map(v => Number(v) || 0)) / (1024 * 1024)
					: 0;

				const avgMemoryUsedMB = avgMemoryValues.length > 0
					? avgMemoryValues.reduce((sum, v) => sum + (Number(v) || 0), 0) / avgMemoryValues.length / (1024 * 1024)
					: 0;

				const avgDurationMs = durationValues.length > 0
					? durationValues.reduce((sum, v) => sum + (Number(v) || 0), 0) / durationValues.length
					: 0;

				const maxDurationMs = maxDurationValues.length > 0
					? Math.max(...maxDurationValues.map(v => Number(v) || 0))
					: 0;

				const invocations = invocationsValues.reduce((sum, v) => sum + (Number(v) || 0), 0);
				const errors = errorsValues.reduce((sum, v) => sum + (Number(v) || 0), 0);

				// Log for debugging if we have invocations but no memory data
				if (invocations > 0 && maxMemoryUsedMB === 0) {
					console.log(`Function ${functionName}: ${invocations} invocations but no memory data. Status: ${maxMemoryResult?.StatusCode || 'Unknown'}`);
				}

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
			} catch (error: any) {
				console.error(`Error fetching metrics for ${functionName}:`, error);
				// Return zero values but still include the function in results
				return {
					functionName,
					allocatedMemoryMB,
					maxMemoryUsedMB: 0,
					averageMemoryUsedMB: 0,
					memoryUtilizationPercent: 0,
					averageDurationMs: 0,
					maxDurationMs: 0,
					invocations: 0,
					errors: 0,
					recommendation: `Error fetching metrics: ${error.message}`
				} as LambdaMemoryMetric;
			}
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

