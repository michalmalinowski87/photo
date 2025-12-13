import { lambdaLogger } from '../../../packages/logger/src';
import { S3Client, ListObjectsV2Command, DeleteObjectsCommand } from '@aws-sdk/client-s3';

const s3 = new S3Client({});

/**
 * Cleanup function to delete ZIP files older than 2 hours
 * Runs on a schedule to prevent S3 storage bloat
 * 
 * ZIPs are stored in two locations:
 * - galleries/{galleryId}/zips/{orderId}.zip (original images)
 * - galleries/{galleryId}/orders/{orderId}/final-zip/{filename}.zip (final images)
 */
export const handler = lambdaLogger(async (event: any, _context: any) => {
	const envProc = (globalThis as any).process;
	const bucket = envProc?.env?.GALLERIES_BUCKET as string;
	
	if (!bucket) {
		console.error('Missing GALLERIES_BUCKET environment variable');
		return {
			statusCode: 500,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Missing GALLERIES_BUCKET' })
		};
	}

	const MAX_AGE_MS = 2 * 60 * 60 * 1000; // 2 hours in milliseconds
	const now = Date.now();
	let deletedCount = 0;
	let errorCount = 0;
	const errors: string[] = [];

	try {
		// List all objects with ZIP prefixes
		const zipPrefixes = [
			'galleries/', // Will filter by .zip suffix in code
		];

		for (const prefix of zipPrefixes) {
			let continuationToken: string | undefined;
			
			do {
				const listResponse = await s3.send(new ListObjectsV2Command({
					Bucket: bucket,
					Prefix: prefix,
					ContinuationToken: continuationToken
				}));

				if (!listResponse.Contents || listResponse.Contents.length === 0) {
					break;
				}

				// Filter for ZIP files older than MAX_AGE_MS
				const objectsToDelete = listResponse.Contents
					.filter(obj => {
						// Only delete .zip files
						if (!obj.Key?.endsWith('.zip')) {
							return false;
						}
						
						// Check if file is older than MAX_AGE_MS
						if (!obj.LastModified) {
							return false;
						}
						
						const ageMs = now - obj.LastModified.getTime();
						return ageMs > MAX_AGE_MS;
					})
					.map(obj => ({
						Key: obj.Key!
					}));

				// Delete in batches of 1000 (S3 limit)
				if (objectsToDelete.length > 0) {
					for (let i = 0; i < objectsToDelete.length; i += 1000) {
						const batch = objectsToDelete.slice(i, i + 1000);
						
						try {
							const deleteResponse = await s3.send(new DeleteObjectsCommand({
								Bucket: bucket,
								Delete: {
									Objects: batch,
									Quiet: true
								}
							}));

							const deleted = deleteResponse.Deleted?.length || 0;
							const failed = deleteResponse.Errors?.length || 0;
							
							deletedCount += deleted;
							errorCount += failed;

							if (deleteResponse.Errors && deleteResponse.Errors.length > 0) {
								deleteResponse.Errors.forEach(err => {
									errors.push(`${err.Key}: ${err.Code} - ${err.Message}`);
								});
							}

							console.log(`Deleted ${deleted} ZIP files (${failed} errors)`, {
								batchStart: i,
								batchSize: batch.length
							});
						} catch (deleteErr: any) {
							errorCount += batch.length;
							errors.push(`Batch delete failed: ${deleteErr.message}`);
							console.error('Failed to delete batch', {
								error: deleteErr.message,
								batchSize: batch.length
							});
						}
					}
				}

				continuationToken = listResponse.NextContinuationToken;
			} while (continuationToken);
		}

		console.log('ZIP cleanup completed', {
			deletedCount,
			errorCount,
			errors: errors.slice(0, 10) // Log first 10 errors
		});

		return {
			statusCode: 200,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				success: true,
				deletedCount,
				errorCount,
				errors: errors.slice(0, 20) // Return first 20 errors
			})
		};
	} catch (error: any) {
		console.error('ZIP cleanup failed:', error);
		return {
			statusCode: 500,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				error: 'ZIP cleanup failed',
				message: error.message,
				deletedCount,
				errorCount
			})
		};
	}
});

