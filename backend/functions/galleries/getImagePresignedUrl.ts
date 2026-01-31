import { lambdaLogger } from '../../../packages/logger/src';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { verifyGalleryAccess } from '../../lib/src/auth';
import { createLambdaErrorResponse } from '../../lib/src/error-utils';

const s3 = new S3Client({});
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const getWebpFilename = (fname: string): string => {
	const lastDot = fname.lastIndexOf('.');
	if (lastDot === -1) return `${fname}.webp`;
	return `${fname.substring(0, lastDot)}.webp`;
};

export const handler = lambdaLogger(async (event: any, context: any) => {
	const logger = (context as any).logger;
	const envProc = (globalThis as any).process;
	const galleriesTable = envProc?.env?.GALLERIES_TABLE as string;
	const imagesTable = envProc?.env?.IMAGES_TABLE as string;
	const bucket = envProc?.env?.GALLERIES_BUCKET as string;

	if (!galleriesTable || !imagesTable || !bucket) {
		return createLambdaErrorResponse(
			new Error('Missing required environment variables'),
			'Missing required environment variables',
			500
		);
	}

	const galleryId = event?.pathParameters?.id;
	const filenameParam = event?.pathParameters?.imageKey;
	if (!galleryId || !filenameParam) {
		return {
			statusCode: 400,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Missing galleryId or imageKey' })
		};
	}

	const filename = decodeURIComponent(filenameParam);
	if (filename.toLowerCase().endsWith('.webp')) {
		return {
			statusCode: 400,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Invalid imageKey' })
		};
	}

	const sizeParam = event?.queryStringParameters?.size as string | undefined;
	const sizes = sizeParam
		? new Set(sizeParam.split(',').map((s: string) => s.trim().toLowerCase()))
		: new Set(['thumb', 'preview', 'bigthumb', 'original']);

	try {
		const galleryGet = await ddb.send(new GetCommand({
			TableName: galleriesTable,
			Key: { galleryId }
		}));
		const gallery = galleryGet.Item as any;
		if (!gallery) {
			return {
				statusCode: 404,
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ error: 'Gallery not found' })
			};
		}

		const access = await verifyGalleryAccess(event, galleryId, gallery);
		if (!access.isOwner && !access.isClient) {
			return {
				statusCode: 401,
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ error: 'Unauthorized. Please log in.' })
			};
		}

		const imageKey = `original#${filename}`;
		const imageGet = await ddb.send(new GetCommand({
			TableName: imagesTable,
			Key: { galleryId, imageKey }
		}));
		const image = imageGet.Item as any;
		if (!image || image.type !== 'original') {
			return {
				statusCode: 404,
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ error: 'Image not found' })
			};
		}

		const originalKey = image.s3Key || `galleries/${galleryId}/originals/${filename}`;
		const webpFilename = getWebpFilename(filename);
		const thumbWebpKey = `galleries/${galleryId}/thumbs/${webpFilename}`;
		const previewWebpKey = `galleries/${galleryId}/previews/${webpFilename}`;
		const bigThumbWebpKey = `galleries/${galleryId}/bigthumbs/${webpFilename}`;

		const generatePresignedUrl = async (key: string): Promise<string | null> => {
			try {
				const cmd = new GetObjectCommand({ Bucket: bucket, Key: key });
				return await getSignedUrl(s3, cmd, { expiresIn: 3600 });
			} catch {
				return null;
			}
		};

		const result: Record<string, string | null> = {};
		const promises: Promise<void>[] = [];

		if (sizes.has('thumb')) {
			promises.push(
				generatePresignedUrl(thumbWebpKey).then((url) => {
					result.thumbUrl = url;
				})
			);
		}
		if (sizes.has('preview')) {
			promises.push(
				generatePresignedUrl(previewWebpKey).then((url) => {
					result.previewUrl = url;
				})
			);
		}
		if (sizes.has('bigthumb')) {
			promises.push(
				generatePresignedUrl(bigThumbWebpKey).then((url) => {
					result.bigThumbUrl = url;
				})
			);
		}
		if (sizes.has('original') && !access.isClient) {
			promises.push(
				generatePresignedUrl(originalKey).then((url) => {
					result.url = url;
				})
			);
		}

		await Promise.all(promises);

		return {
			statusCode: 200,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(result)
		};
	} catch (error: any) {
		logger.error('Get image presigned URL failed', {
			error: { name: error.name, message: error.message },
			galleryId,
			filename
		});
		return createLambdaErrorResponse(error, 'Failed to get presigned URL', 500);
	}
});
