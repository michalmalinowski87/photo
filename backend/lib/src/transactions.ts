import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export type TransactionType = 'GALLERY_PLAN' | 'ADDON_PURCHASE' | 'WALLET_TOPUP' | 'REFUND';
export type TransactionStatus = 'UNPAID' | 'PAID' | 'CANCELED' | 'REFUNDED' | 'FAILED';
export type PaymentMethod = 'WALLET' | 'STRIPE' | 'MIXED';

export interface Transaction {
	userId: string;
	transactionId: string;
	type: TransactionType;
	status: TransactionStatus;
	paymentMethod: PaymentMethod;
	amountCents: number;
	walletAmountCents: number;
	stripeAmountCents: number;
	stripeSessionId?: string;
	stripePaymentIntentId?: string;
	galleryId?: string;
	refId?: string;
	metadata?: Record<string, any>;
	composites?: string[]; // List of items/components in this transaction (e.g., ['Gallery Plan Basic', 'Backup addon'])
	createdAt: string;
	updatedAt: string;
	paidAt?: string;
	canceledAt?: string;
}

export function generateTransactionId(): string {
	return `txn_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function createTransaction(
	userId: string,
	type: TransactionType,
	amountCents: number,
	options: {
		galleryId?: string;
		walletAmountCents?: number;
		stripeAmountCents?: number;
		paymentMethod?: PaymentMethod;
		metadata?: Record<string, any>;
		refId?: string;
		composites?: string[]; // List of items/components in this transaction
	}
): Promise<string> {
	const envProc = (globalThis as any).process || process;
	const transactionsTable = envProc?.env?.TRANSACTIONS_TABLE as string;
	if (!transactionsTable) {
		throw new Error('TRANSACTIONS_TABLE environment variable not set');
	}

	const now = new Date().toISOString();
	const transactionId = generateTransactionId();
	
	const walletAmountCents = options.walletAmountCents || 0;
	const stripeAmountCents = options.stripeAmountCents || 0;
	const paymentMethod = options.paymentMethod || (walletAmountCents > 0 && stripeAmountCents > 0 ? 'MIXED' : walletAmountCents > 0 ? 'WALLET' : 'STRIPE');

	const transaction: Transaction = {
		userId,
		transactionId,
		type,
		status: 'UNPAID',
		paymentMethod,
		amountCents,
		walletAmountCents,
		stripeAmountCents,
		galleryId: options.galleryId,
		refId: options.refId || transactionId,
		metadata: options.metadata || {},
		composites: options.composites,
		createdAt: now,
		updatedAt: now
	};

	await ddb.send(new PutCommand({
		TableName: transactionsTable,
		Item: transaction
	}));

	return transactionId;
}

export async function getTransaction(userId: string, transactionId: string): Promise<Transaction | null> {
	const envProc = (globalThis as any).process || process;
	const transactionsTable = envProc?.env?.TRANSACTIONS_TABLE as string;
	if (!transactionsTable) {
		throw new Error('TRANSACTIONS_TABLE environment variable not set');
	}

	const result = await ddb.send(new GetCommand({
		TableName: transactionsTable,
		Key: { userId, transactionId }
	}));

	return (result.Item as Transaction) || null;
}

export async function updateTransactionStatus(
	userId: string,
	transactionId: string,
	status: TransactionStatus,
	updates?: {
		stripeSessionId?: string;
		stripePaymentIntentId?: string;
	}
): Promise<void> {
	const envProc = (globalThis as any).process || process;
	const transactionsTable = envProc?.env?.TRANSACTIONS_TABLE as string;
	if (!transactionsTable) {
		throw new Error('TRANSACTIONS_TABLE environment variable not set');
	}

	const now = new Date().toISOString();
	const updateExpr: string[] = ['SET #status = :status', 'updatedAt = :updatedAt'];
	const exprValues: Record<string, any> = {
		':status': status,
		':updatedAt': now
	};
	const exprNames: Record<string, string> = {
		'#status': 'status'
	};

	if (status === 'PAID' && !updates?.paidAt) {
		updateExpr.push('paidAt = :paidAt');
		exprValues[':paidAt'] = now;
	}

	if (status === 'CANCELED' && !updates?.canceledAt) {
		updateExpr.push('canceledAt = :canceledAt');
		exprValues[':canceledAt'] = now;
	}

	if (updates?.stripeSessionId) {
		updateExpr.push('stripeSessionId = :stripeSessionId');
		exprValues[':stripeSessionId'] = updates.stripeSessionId;
	}

	if (updates?.stripePaymentIntentId) {
		updateExpr.push('stripePaymentIntentId = :stripePaymentIntentId');
		exprValues[':stripePaymentIntentId'] = updates.stripePaymentIntentId;
	}

	await ddb.send(new UpdateCommand({
		TableName: transactionsTable,
		Key: { userId, transactionId },
		UpdateExpression: updateExpr.join(', '),
		ExpressionAttributeValues: exprValues,
		ExpressionAttributeNames: exprNames
	}));
}

export async function getPaidTransactionForGallery(galleryId: string): Promise<Transaction | null> {
	const envProc = (globalThis as any).process || process;
	const transactionsTable = envProc?.env?.TRANSACTIONS_TABLE as string;
	if (!transactionsTable) {
		throw new Error('TRANSACTIONS_TABLE environment variable not set');
	}

	const result = await ddb.send(new QueryCommand({
		TableName: transactionsTable,
		IndexName: 'galleryId-status-index',
		KeyConditionExpression: 'galleryId = :g AND #status = :s',
		ExpressionAttributeValues: {
			':g': galleryId,
			':s': 'PAID'
		},
		ExpressionAttributeNames: {
			'#status': 'status'
		},
		Limit: 1
	}));

	return (result.Items && result.Items.length > 0 ? result.Items[0] as Transaction : null);
}

export async function getUnpaidTransactionForGallery(galleryId: string): Promise<Transaction | null> {
	const envProc = (globalThis as any).process || process;
	const transactionsTable = envProc?.env?.TRANSACTIONS_TABLE as string;
	if (!transactionsTable) {
		throw new Error('TRANSACTIONS_TABLE environment variable not set');
	}

	const result = await ddb.send(new QueryCommand({
		TableName: transactionsTable,
		IndexName: 'galleryId-status-index',
		KeyConditionExpression: 'galleryId = :g AND #status = :s',
		ExpressionAttributeValues: {
			':g': galleryId,
			':s': 'UNPAID'
		},
		ExpressionAttributeNames: {
			'#status': 'status'
		},
		Limit: 1
	}));

	return (result.Items && result.Items.length > 0 ? result.Items[0] as Transaction : null);
}

export interface PaginatedTransactionsResult {
	transactions: Transaction[];
	lastKey?: Record<string, any>;
	hasMore: boolean;
}

export async function listTransactionsByUser(
	userId: string,
	options?: {
		status?: TransactionStatus;
		type?: TransactionType;
		limit?: number;
		exclusiveStartKey?: Record<string, any>;
	}
): Promise<PaginatedTransactionsResult> {
	const envProc = (globalThis as any).process || process;
	const transactionsTable = envProc?.env?.TRANSACTIONS_TABLE as string;
	if (!transactionsTable) {
		throw new Error('TRANSACTIONS_TABLE environment variable not set');
	}

	const filterExpressions: string[] = [];
	const exprValues: Record<string, any> = { ':u': userId };
	const exprNames: Record<string, string> = {};

	if (options?.status) {
		filterExpressions.push('#status = :status');
		exprValues[':status'] = options.status;
		exprNames['#status'] = 'status';
	}

	if (options?.type) {
		filterExpressions.push('#type = :type');
		exprValues[':type'] = options.type;
		exprNames['#type'] = 'type';
	}

	const queryParams: any = {
		TableName: transactionsTable,
		KeyConditionExpression: 'userId = :u',
		ExpressionAttributeValues: exprValues,
		ScanIndexForward: false,
		Limit: (options?.limit || 100) + 1 // Fetch one extra to check if there are more
	};
	
	if (filterExpressions.length > 0) {
		queryParams.FilterExpression = filterExpressions.join(' AND ');
		queryParams.ExpressionAttributeNames = exprNames;
	}

	if (options?.exclusiveStartKey) {
		queryParams.ExclusiveStartKey = options.exclusiveStartKey;
	}
	
	const result = await ddb.send(new QueryCommand(queryParams));
	const items = (result.Items || []) as Transaction[];
	
	// Check if there are more items
	const hasMore = items.length > (options?.limit || 100);
	const transactions = hasMore ? items.slice(0, -1) : items;
	const lastKey = result.LastEvaluatedKey;

	return {
		transactions,
		lastKey,
		hasMore
	};
}

