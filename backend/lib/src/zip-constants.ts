/**
 * Shared constants for ZIP generation (createZip, zipChunkWorker, zipMerge)
 * Centralized for consistency across single and chunked flows
 */

// Multipart upload - 15MB parts (optimal for 1024MB Lambda memory)
export const PART_SIZE = 15 * 1024 * 1024;
// Merge uses larger parts (50MB) - fewer UploadPart calls, merge Lambda has 4096 MB
export const MERGE_PART_SIZE = 50 * 1024 * 1024;
export const MAX_PARTS = 10000; // S3 maximum

// Parallel download concurrency (per worker)
export const CONCURRENT_DOWNLOADS = 12;

// Chunk configuration
export const DEFAULT_CHUNK_THRESHOLD = 100; // Use chunked flow when files > this
// 200 files/worker: fewer workers, less merge overhead, lower Lambda burst (e.g. 1000 files → 5 workers)
export const FILES_PER_CHUNK = 200;
export const MAX_WORKERS = 10;

/**
 * Compute number of workers for chunked ZIP generation
 */
export function getWorkerCount(filesCount: number): number {
	return Math.min(Math.ceil(filesCount / FILES_PER_CHUNK), MAX_WORKERS);
}

/**
 * Split keys array into chunks for parallel workers
 */
export function splitIntoChunks<T>(items: T[], chunkCount: number): T[][] {
	const chunks: T[][] = Array.from({ length: chunkCount }, () => []);
	items.forEach((item, i) => {
		chunks[i % chunkCount].push(item);
	});
	return chunks;
}
