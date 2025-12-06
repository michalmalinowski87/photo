/**
 * Type definitions for Lambda handlers and AWS API Gateway events
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';

/**
 * Extended Lambda event with helper types for common operations
 */
export interface LambdaEvent extends APIGatewayProxyEvent {
	pathParameters?: {
		id?: string;
		galleryId?: string;
		orderId?: string;
		clientId?: string;
		packageId?: string;
		[key: string]: string | undefined;
	};
	queryStringParameters?: {
		page?: string;
		limit?: string;
		itemsPerPage?: string;
		offset?: string;
		search?: string;
		filter?: string;
		deliveryStatus?: string;
		excludeDeliveryStatus?: string;
		lastKey?: string;
		[key: string]: string | undefined;
	};
}

/**
 * Lambda handler function type
 */
export type LambdaHandler = (
	event: LambdaEvent,
	context: Context,
	callback?: () => void
) => Promise<APIGatewayProxyResult> | APIGatewayProxyResult;

/**
 * Lambda context with logger
 */
export interface LambdaContext extends Context {
	logger?: {
		debug: (msg: string, details?: Record<string, unknown>) => void;
		info: (msg: string, details?: Record<string, unknown>) => void;
		warn: (msg: string, details?: Record<string, unknown>) => void;
		error: (msg: string, details?: Record<string, unknown>) => void;
	};
}

/**
 * Standard DynamoDB item interface
 */
export interface DynamoDBItem {
	[key: string]: unknown;
}

/**
 * Gallery item from DynamoDB
 */
export interface GalleryItem extends DynamoDBItem {
	galleryId: string;
	ownerId: string;
	galleryName?: string;
	state?: string;
	selectionEnabled?: boolean;
	pricingPackage?: {
		packageName?: string;
		includedCount?: number;
		extraPriceCents?: number;
		packagePriceCents?: number;
	};
	coverPhotoUrl?: string;
	createdAt?: string;
	updatedAt?: string;
}

/**
 * Order item from DynamoDB
 */
export interface OrderItem extends DynamoDBItem {
	orderId: string;
	galleryId: string;
	ownerId?: string;
	deliveryStatus?: string;
	paymentStatus?: string;
	totalCents?: number;
	selectedKeys?: string[];
	createdAt?: string;
	updatedAt?: string;
}

/**
 * Client item from DynamoDB
 */
export interface ClientItem extends DynamoDBItem {
	clientId: string;
	ownerId: string;
	email?: string;
	firstName?: string;
	lastName?: string;
	companyName?: string;
	phone?: string;
	nip?: string;
	isCompany?: boolean;
	createdAt?: string;
}

