#!/usr/bin/env node
/**
 * Script to manually mark a gallery as "Sent To Client"
 * 
 * Usage:
 *   STAGE=dev GALLERIES_TABLE=PhotoHub-dev-GalleriesTable ORDERS_TABLE=PhotoHub-dev-OrdersTable \
 *   node -r ts-node/register scripts/mark-gallery-sent.ts <galleryId> [clientEmail] [password]
 * 
 * If clientEmail and password are not provided, they will be set to defaults:
 *   clientEmail: "client@example.com"
 *   password: "password123"
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { randomBytes, pbkdf2Sync } from 'crypto';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

// Password hashing matching the exact implementation from setClientPassword.ts
function hashPassword(password: string): { hash: string; salt: string; iterations: number } {
	const salt = randomBytes(16).toString('hex');
	const hash = pbkdf2Sync(password, salt, 100_000, 32, 'sha256').toString('hex');
	return { hash, salt, iterations: 100000 };
}

async function markGalleryAsSent(galleryId: string, clientEmail?: string, password?: string) {
	const stage = process.env.STAGE || 'dev';
	const galleriesTable = process.env.GALLERIES_TABLE || `PhotoHub-${stage}-GalleriesTable`;
	const ordersTable = process.env.ORDERS_TABLE || `PhotoHub-${stage}-OrdersTable`;
	
	const defaultEmail = clientEmail || 'client@example.com';
	const defaultPassword = password || 'password123';
	
	console.log(`\n📋 Marking gallery as "Sent To Client"`);
	console.log(`Gallery ID: ${galleryId}`);
	console.log(`Galleries Table: ${galleriesTable}`);
	console.log(`Orders Table: ${ordersTable}\n`);
	
	// Step 1: Get the gallery
	console.log('1️⃣  Fetching gallery...');
	const galleryGet = await ddb.send(new GetCommand({
		TableName: galleriesTable,
		Key: { galleryId }
	}));
	
	const gallery = galleryGet.Item;
	if (!gallery) {
		console.error(`❌ Gallery not found: ${galleryId}`);
		process.exit(1);
	}
	
	console.log(`✅ Gallery found: ${gallery.galleryName || galleryId}`);
	console.log(`   Owner: ${gallery.ownerId}`);
	console.log(`   Current clientEmail: ${gallery.clientEmail || '(not set)'}`);
	console.log(`   Current state: ${gallery.state || 'DRAFT'}\n`);
	
	// Step 2: Check if orders already exist
	console.log('2️⃣  Checking for existing orders...');
	const ordersQuery = await ddb.send(new QueryCommand({
		TableName: ordersTable,
		KeyConditionExpression: 'galleryId = :g',
		ExpressionAttributeValues: { ':g': galleryId }
	}));
	
	const existingOrders = ordersQuery.Items || [];
	console.log(`   Found ${existingOrders.length} existing order(s)`);
	if (existingOrders.length > 0) {
		console.log(`   Order IDs: ${existingOrders.map((o: any) => o.orderId).join(', ')}`);
		console.log(`   Statuses: ${existingOrders.map((o: any) => o.deliveryStatus).join(', ')}\n`);
	}
	
	// Step 3: Update gallery with clientEmail and password
	console.log('3️⃣  Updating gallery with client email and password...');
	const { hash, salt, iterations } = hashPassword(defaultPassword);
	const passwordEncrypted = Buffer.from(defaultPassword).toString('base64');
	
	const now = new Date().toISOString();
	await ddb.send(new UpdateCommand({
		TableName: galleriesTable,
		Key: { galleryId },
		UpdateExpression: 'SET clientEmail = :email, clientPasswordHash = :hash, clientPasswordSalt = :salt, clientPasswordIter = :iter, clientPasswordEncrypted = :enc, updatedAt = :u',
		ExpressionAttributeValues: {
			':email': defaultEmail,
			':hash': hash,
			':salt': salt,
			':iter': iterations,
			':enc': passwordEncrypted,
			':u': now
		}
	}));
	
	console.log(`✅ Gallery updated:`);
	console.log(`   clientEmail: ${defaultEmail}`);
	console.log(`   password: ${defaultPassword} (hashed and encrypted)\n`);
	
	// Step 4: Create order if none exists
	if (existingOrders.length === 0) {
		console.log('4️⃣  Creating order with CLIENT_SELECTING status...');
		const orderNumber = (gallery.lastOrderNumber ?? 0) + 1;
		const orderId = `${orderNumber}-${Date.now()}`;
		
		await ddb.send(new PutCommand({
			TableName: ordersTable,
			Item: {
				galleryId,
				orderId,
				orderNumber,
				ownerId: gallery.ownerId,
				deliveryStatus: 'CLIENT_SELECTING',
				paymentStatus: 'UNPAID',
				selectedKeys: [],
				selectedCount: 0,
				overageCount: 0,
				overageCents: 0,
				totalCents: 0,
				createdAt: now
			}
		}));
		
		// Update gallery with order info
		await ddb.send(new UpdateCommand({
			TableName: galleriesTable,
			Key: { galleryId },
			UpdateExpression: 'SET lastOrderNumber = :n, currentOrderId = :oid',
			ExpressionAttributeValues: {
				':n': orderNumber,
				':oid': orderId
			}
		}));
		
		console.log(`✅ Order created:`);
		console.log(`   orderId: ${orderId}`);
		console.log(`   orderNumber: ${orderNumber}`);
		console.log(`   deliveryStatus: CLIENT_SELECTING\n`);
	} else {
		console.log('4️⃣  Orders already exist, skipping order creation\n');
	}
	
	console.log('✅ Gallery successfully marked as "Sent To Client"!');
	console.log(`\n📧 Client can now access the gallery at:`);
	console.log(`   https://your-gallery-url/gallery/${galleryId}`);
	console.log(`   Email: ${defaultEmail}`);
	console.log(`   Password: ${defaultPassword}\n`);
}

// Main execution
const galleryId = process.argv[2];
const clientEmail = process.argv[3];
const password = process.argv[4];

if (!galleryId) {
	console.error('Usage: node scripts/mark-gallery-sent.ts <galleryId> [clientEmail] [password]');
	console.error('Example: node scripts/mark-gallery-sent.ts gal_123 client@example.com mypassword');
	process.exit(1);
}

markGalleryAsSent(galleryId, clientEmail, password).catch(err => {
	console.error('Error:', err);
	process.exit(1);
});

