import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export type TransactionType = 'GALLERY_PLAN' | 'GALLERY_PLAN_UPGRADE' | 'WALLET_TOPUP' | 'WELCOME_BONUS' | 'REFERRAL_BONUS' | 'REFUND';
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
	composites?: string[]; // List of items/components in this transaction (e.g., ['Gallery Plan Basic'])
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
		idempotencyKey?: string; // Optional idempotency key to prevent duplicates
	}
): Promise<string> {
	const envProc = (globalThis as any).process || process;
	const transactionsTable = envProc?.env?.TRANSACTIONS_TABLE as string;
	if (!transactionsTable) {
		throw new Error('TRANSACTIONS_TABLE environment variable not set');
	}

	// For wallet top-ups, check for recent UNPAID transactions of the same type and amount
	// This prevents duplicate transactions when checkoutCreate is called multiple times
	if (type === 'WALLET_TOPUP' && !options.idempotencyKey) {
		try {
			// Check for UNPAID transactions created in the last 5 minutes with same amount
			const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
			const result = await ddb.send(new QueryCommand({
				TableName: transactionsTable,
				KeyConditionExpression: 'userId = :u',
				FilterExpression: '#type = :type AND #status = :status AND amountCents = :amount AND createdAt > :time',
				ExpressionAttributeValues: {
					':u': userId,
					':type': type,
					':status': 'UNPAID',
					':amount': amountCents,
					':time': fiveMinutesAgo
				},
				ExpressionAttributeNames: {
					'#type': 'type',
					'#status': 'status'
				},
				ScanIndexForward: false, // Most recent first
				Limit: 1
			}));

			if (result.Items && result.Items.length > 0) {
				const existingTransaction = result.Items[0] as Transaction;
				// Return existing transaction ID instead of creating a duplicate
				return existingTransaction.transactionId;
			}
		} catch (err: any) {
			// If query fails, log but continue with creating new transaction
			// This ensures we don't block transaction creation if there's a DynamoDB issue
			console.warn('Failed to check for existing transaction, creating new one', {
				error: err?.message,
				userId,
				type
			});
		}
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

	if (status === 'PAID') {
		updateExpr.push('paidAt = :paidAt');
		exprValues[':paidAt'] = now;
	}

	if (status === 'CANCELED') {
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

	try {
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

		if (result.Items && result.Items.length > 0) {
			return result.Items[0] as Transaction;
		}
		return null;
	} catch (err: any) {
		// Create a more descriptive error message
		const errorMessage = err?.message || err?.toString() || JSON.stringify(err) || 'Unknown error';
		const errorName = err?.name || 'UnknownError';
		
		// If GSI doesn't exist or query fails, throw with more context
		if (errorName === 'ResourceNotFoundException' || errorMessage.includes('index') || errorMessage.includes('GSI')) {
			throw new Error(`GSI 'galleryId-status-index' not found or not ready. Error: ${errorMessage}`);
		}
		
		// Re-throw with more context
		const enhancedError = new Error(`Failed to query unpaid transaction for gallery ${galleryId}: ${errorMessage}`);
		(enhancedError as any).originalError = err;
		(enhancedError as any).errorName = errorName;
		throw enhancedError;
	}
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

