// @ts-nocheck
import { Construct } from 'constructs';
import { Stack, StackProps, CfnOutput, Duration, RemovalPolicy } from 'aws-cdk-lib';
import { Bucket, BlockPublicAccess, HttpMethods } from 'aws-cdk-lib/aws-s3';
import { AttributeType, BillingMode, Table, StreamViewType, CfnTable } from 'aws-cdk-lib/aws-dynamodb';
import { DynamoEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import { UserPool, UserPoolClient } from 'aws-cdk-lib/aws-cognito';
import { HttpApi, CorsHttpMethod, HttpMethod } from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { HttpUserPoolAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import { Runtime, LayerVersion } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Rule, Schedule } from 'aws-cdk-lib/aws-events';
import { LambdaFunction } from 'aws-cdk-lib/aws-events-targets';
import { Distribution, AllowedMethods, ViewerProtocolPolicy, CachePolicy } from 'aws-cdk-lib/aws-cloudfront';
import { S3BucketOrigin } from 'aws-cdk-lib/aws-cloudfront-origins';
import * as path from 'path';

interface AppStackProps extends StackProps {
	stage: string;
}

export class AppStack extends Stack {
	constructor(scope: Construct, id: string, props: AppStackProps) {
		super(scope, id, props);

		const galleriesBucket = new Bucket(this, 'GalleriesBucket', {
			blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
			autoDeleteObjects: false,
			removalPolicy: RemovalPolicy.RETAIN
		});
		
		// CORS origins from context or environment, fallback to wildcard for dev
		const corsOrigins = this.node.tryGetContext('corsOrigins')?.split(',') || 
			process.env.CORS_ORIGINS?.split(',') || 
			(props.stage === 'prod' ? [] : ['*']);
		
		galleriesBucket.addCorsRule({
			allowedOrigins: corsOrigins.length > 0 ? corsOrigins : ['*'],
			allowedMethods: [HttpMethods.PUT, HttpMethods.GET, HttpMethods.HEAD],
			allowedHeaders: ['*'],
			exposedHeaders: ['ETag']
		});

		const galleries = new Table(this, 'GalleriesTable', {
			partitionKey: { name: 'galleryId', type: AttributeType.STRING },
			billingMode: BillingMode.PAY_PER_REQUEST,
			removalPolicy: RemovalPolicy.RETAIN,
			// Enable DynamoDB Streams for TTL deletion events
			// When TTL expires, DynamoDB automatically deletes the item and triggers the stream
			stream: StreamViewType.OLD_IMAGE // Capture old image to get galleryId when TTL deletes
		});
		galleries.addGlobalSecondaryIndex({
			indexName: 'ownerId-index',
			partitionKey: { name: 'ownerId', type: AttributeType.STRING },
			sortKey: { name: 'createdAt', type: AttributeType.STRING }
		});
		
		// Enable TTL on the galleries table using the 'ttl' attribute
		// This allows DynamoDB to automatically delete expired items (typically within 48 hours)
		const galleriesCfnTable = galleries.node.defaultChild as CfnTable;
		galleriesCfnTable.timeToLiveSpecification = {
			enabled: true,
			attributeName: 'ttl'
		};

		const payments = new Table(this, 'PaymentsTable', {
			partitionKey: { name: 'paymentId', type: AttributeType.STRING },
			billingMode: BillingMode.PAY_PER_REQUEST,
			removalPolicy: RemovalPolicy.RETAIN
		});

		const wallet = new Table(this, 'WalletsTable', {
			partitionKey: { name: 'userId', type: AttributeType.STRING },
			billingMode: BillingMode.PAY_PER_REQUEST,
			removalPolicy: RemovalPolicy.RETAIN
		});

		const walletLedger = new Table(this, 'WalletLedgerTable', {
			partitionKey: { name: 'userId', type: AttributeType.STRING },
			sortKey: { name: 'txnId', type: AttributeType.STRING },
			billingMode: BillingMode.PAY_PER_REQUEST,
			removalPolicy: RemovalPolicy.RETAIN
		});
	const orders = new Table(this, 'OrdersTable', {
		partitionKey: { name: 'galleryId', type: AttributeType.STRING },
		sortKey: { name: 'orderId', type: AttributeType.STRING },
		billingMode: BillingMode.PAY_PER_REQUEST,
		removalPolicy: RemovalPolicy.RETAIN
	});

	const galleryAddons = new Table(this, 'GalleryAddonsTable', {
		partitionKey: { name: 'galleryId', type: AttributeType.STRING },
		sortKey: { name: 'addonId', type: AttributeType.STRING },
		billingMode: BillingMode.PAY_PER_REQUEST,
		removalPolicy: RemovalPolicy.RETAIN
	});

	const transactions = new Table(this, 'TransactionsTable', {
		partitionKey: { name: 'userId', type: AttributeType.STRING },
		sortKey: { name: 'transactionId', type: AttributeType.STRING },
		billingMode: BillingMode.PAY_PER_REQUEST,
		removalPolicy: RemovalPolicy.RETAIN
	});
	transactions.addGlobalSecondaryIndex({
		indexName: 'galleryId-status-index',
		partitionKey: { name: 'galleryId', type: AttributeType.STRING },
		sortKey: { name: 'status', type: AttributeType.STRING }
	});

	const clients = new Table(this, 'ClientsTable', {
		partitionKey: { name: 'clientId', type: AttributeType.STRING },
		billingMode: BillingMode.PAY_PER_REQUEST,
		removalPolicy: RemovalPolicy.RETAIN
	});
	clients.addGlobalSecondaryIndex({
		indexName: 'ownerId-index',
		partitionKey: { name: 'ownerId', type: AttributeType.STRING },
		sortKey: { name: 'createdAt', type: AttributeType.STRING }
	});

	const packages = new Table(this, 'PackagesTable', {
		partitionKey: { name: 'packageId', type: AttributeType.STRING },
		billingMode: BillingMode.PAY_PER_REQUEST,
		removalPolicy: RemovalPolicy.RETAIN
	});
	packages.addGlobalSecondaryIndex({
		indexName: 'ownerId-index',
		partitionKey: { name: 'ownerId', type: AttributeType.STRING },
		sortKey: { name: 'createdAt', type: AttributeType.STRING }
	});

	const notifications = new Table(this, 'NotificationsTable', {
		partitionKey: { name: 'userId', type: AttributeType.STRING },
		sortKey: { name: 'notificationId', type: AttributeType.STRING },
		billingMode: BillingMode.PAY_PER_REQUEST,
		removalPolicy: RemovalPolicy.RETAIN
	});

		const userPool = new UserPool(this, 'PhotographersUserPool', {
			selfSignUpEnabled: true,
			signInAliases: { email: true }
		});
		
		// Get callback URLs from context or environment, fallback to localhost for dev
		// Note: Callback URLs must match exactly what's sent in the OAuth request
		const callbackUrls = this.node.tryGetContext('cognitoCallbackUrls')?.split(',') || 
			process.env.COGNITO_CALLBACK_URLS?.split(',') || 
			['http://localhost:3000/login'];
		const logoutUrls = this.node.tryGetContext('cognitoLogoutUrls')?.split(',') || 
			process.env.COGNITO_LOGOUT_URLS?.split(',') || 
			['http://localhost:3000'];
		
		const userPoolClient = new UserPoolClient(this, 'PhotographersUserPoolClient', {
			userPool,
			generateSecret: false,
			allowedOAuthFlows: ['authorization_code'],
			allowedOAuthScopes: ['openid', 'email', 'profile'],
			allowedOAuthFlowsUserPoolClient: true,
			callbackOAuthUrls: callbackUrls,
			logoutOAuthUrls: logoutUrls,
			supportedIdentityProviders: ['COGNITO']
		});
		
		const userPoolDomain = userPool.addDomain('PhotographersUserPoolDomain', {
			cognitoDomain: {
				domainPrefix: `photohub-${props.stage}`
			}
		});

		const httpApi = new HttpApi(this, 'Api', {
			corsPreflight: {
				allowHeaders: ['*'],
				allowMethods: [CorsHttpMethod.ANY],
				allowOrigins: ['*']
			}
		});

		const authorizer = new HttpUserPoolAuthorizer('CognitoAuthorizer', userPool, {
			userPoolClients: [userPoolClient]
		});

		const defaultFnProps = {
			runtime: Runtime.NODEJS_20_X,
			memorySize: 256,
			timeout: Duration.seconds(10),
			bundling: {
				externalModules: ['aws-sdk'],
				minify: true,
				treeShaking: true,
				sourceMap: false
			}
		};

		// Generate or use existing JWT secret for client gallery authentication
		const jwtSecret = this.node.tryGetContext('jwtSecret') || 
			process.env.JWT_SECRET || 
			`photohub-${props.stage}-jwt-secret-change-in-production`;

		const envVars: Record<string, string> = {
			STAGE: props.stage,
			GALLERIES_BUCKET: galleriesBucket.bucketName,
			COGNITO_USER_POOL_ID: userPool.userPoolId,
			COGNITO_USER_POOL_CLIENT_ID: userPoolClient.userPoolClientId,
			COGNITO_DOMAIN: userPoolDomain.domainName,
			JWT_SECRET: jwtSecret,
			CLIENTS_TABLE: clients.tableName,
			PACKAGES_TABLE: packages.tableName,
			NOTIFICATIONS_TABLE: notifications.tableName,
			SENDER_EMAIL: process.env.SENDER_EMAIL || '',
			STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY || '',
			STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET || '',
			PUBLIC_API_URL: process.env.PUBLIC_API_URL || '',
			PUBLIC_GALLERY_URL: process.env.PUBLIC_GALLERY_URL || '',
			PUBLIC_DASHBOARD_URL: process.env.PUBLIC_DASHBOARD_URL || process.env.NEXT_PUBLIC_DASHBOARD_URL || 'http://localhost:3000',
			GALLERIES_TABLE: galleries.tableName,
			PAYMENTS_TABLE: payments.tableName,
			WALLETS_TABLE: wallet.tableName,
			WALLET_LEDGER_TABLE: walletLedger.tableName,
			ORDERS_TABLE: orders.tableName,
			GALLERY_ADDONS_TABLE: galleryAddons.tableName,
			TRANSACTIONS_TABLE: transactions.tableName
		};

		const healthFn = new NodejsFunction(this, 'HealthFunction', {
			entry: path.join(__dirname, '../../../backend/functions/health/index.ts'),
			handler: 'handler',
			...defaultFnProps,
			environment: envVars
		});

		httpApi.addRoutes({
			path: '/health',
			methods: [HttpMethod.GET],
			integration: new HttpLambdaIntegration('HealthIntegration', healthFn)
		});

		galleriesBucket.grantReadWrite(healthFn);

		// Payments: checkout + webhook
		const checkoutFn = new NodejsFunction(this, 'PaymentsCheckoutFn', {
			entry: path.join(__dirname, '../../../backend/functions/payments/checkoutCreate.ts'),
			handler: 'handler',
			...defaultFnProps,
			environment: envVars
		});
		const webhookFn = new NodejsFunction(this, 'PaymentsWebhookFn', {
			entry: path.join(__dirname, '../../../backend/functions/payments/webhook.ts'),
			handler: 'handler',
			...defaultFnProps,
			environment: envVars
		});
		const paymentsSuccessFn = new NodejsFunction(this, 'PaymentsSuccessFn', {
			entry: path.join(__dirname, '../../../backend/functions/payments/success.ts'),
			handler: 'handler',
			...defaultFnProps,
			environment: envVars
		});
		const paymentsCancelFn = new NodejsFunction(this, 'PaymentsCancelFn', {
			entry: path.join(__dirname, '../../../backend/functions/payments/cancel.ts'),
			handler: 'handler',
			...defaultFnProps,
			environment: envVars
		});
		payments.grantReadWriteData(checkoutFn);
		payments.grantReadWriteData(webhookFn);
		transactions.grantReadWriteData(checkoutFn); // Needed for fractional payments
		wallet.grantReadWriteData(webhookFn);
		walletLedger.grantReadWriteData(webhookFn);
		transactions.grantReadWriteData(webhookFn); // Needed to update transaction status
		transactions.grantReadWriteData(paymentsCancelFn); // Needed to mark transaction as CANCELED
		galleries.grantReadWriteData(webhookFn);
		orders.grantReadWriteData(webhookFn); // Needed for addon_payment to update orders with zipKey
		galleryAddons.grantReadWriteData(webhookFn); // Needed for addon_payment to create addon
		// generateZipsForAddonFn.grantInvoke(webhookFn) will be set after generateZipsForAddonFn is created
		httpApi.addRoutes({
			path: '/payments/checkout',
			methods: [HttpMethod.POST],
			integration: new HttpLambdaIntegration('CheckoutIntegration', checkoutFn),
			authorizer
		});
		httpApi.addRoutes({
			path: '/payments/webhook',
			methods: [HttpMethod.POST],
			integration: new HttpLambdaIntegration('WebhookIntegration', webhookFn)
		});
		httpApi.addRoutes({
			path: '/payments/success',
			methods: [HttpMethod.GET],
			integration: new HttpLambdaIntegration('PaymentsSuccessIntegration', paymentsSuccessFn)
		});
		httpApi.addRoutes({
			path: '/payments/cancel',
			methods: [HttpMethod.GET],
			integration: new HttpLambdaIntegration('PaymentsCancelIntegration', paymentsCancelFn)
		});

		// Wallet endpoints
		const walletBalanceFn = new NodejsFunction(this, 'WalletBalanceFn', {
			entry: path.join(__dirname, '../../../backend/functions/wallet/getBalance.ts'),
			handler: 'handler',
			...defaultFnProps,
			environment: envVars
		});
		const walletTransactionsFn = new NodejsFunction(this, 'WalletTransactionsFn', {
			entry: path.join(__dirname, '../../../backend/functions/wallet/listTransactions.ts'),
			handler: 'handler',
			...defaultFnProps,
			environment: envVars
		});
		wallet.grantReadWriteData(walletBalanceFn); // Needs write to create wallet if missing
		walletLedger.grantReadData(walletTransactionsFn);
		transactions.grantReadData(walletTransactionsFn); // Needed to query transactions table
		httpApi.addRoutes({
			path: '/wallet/balance',
			methods: [HttpMethod.GET],
			integration: new HttpLambdaIntegration('WalletBalanceIntegration', walletBalanceFn),
			authorizer
		});
		httpApi.addRoutes({
			path: '/wallet/transactions',
			methods: [HttpMethod.GET],
			integration: new HttpLambdaIntegration('WalletTransactionsIntegration', walletTransactionsFn),
			authorizer
		});

		// Transaction endpoints
		const transactionsGetFn = new NodejsFunction(this, 'TransactionsGetFn', {
			entry: path.join(__dirname, '../../../backend/functions/transactions/get.ts'),
			handler: 'handler',
			...defaultFnProps,
			environment: envVars
		});
		const transactionsCancelFn = new NodejsFunction(this, 'TransactionsCancelFn', {
			entry: path.join(__dirname, '../../../backend/functions/transactions/cancel.ts'),
			handler: 'handler',
			...defaultFnProps,
			environment: envVars
		});
		const transactionsRetryFn = new NodejsFunction(this, 'TransactionsRetryFn', {
			entry: path.join(__dirname, '../../../backend/functions/transactions/retry.ts'),
			handler: 'handler',
			...defaultFnProps,
			environment: envVars
		});
		transactions.grantReadData(transactionsGetFn);
		transactions.grantReadWriteData(transactionsCancelFn);
		transactions.grantReadWriteData(transactionsRetryFn);
		galleries.grantReadWriteData(transactionsCancelFn);
		wallet.grantReadData(transactionsRetryFn);
		httpApi.addRoutes({
			path: '/transactions/{id}',
			methods: [HttpMethod.GET],
			integration: new HttpLambdaIntegration('TransactionsGetIntegration', transactionsGetFn),
			authorizer
		});
		httpApi.addRoutes({
			path: '/transactions/{id}/cancel',
			methods: [HttpMethod.POST],
			integration: new HttpLambdaIntegration('TransactionsCancelIntegration', transactionsCancelFn),
			authorizer
		});
		httpApi.addRoutes({
			path: '/transactions/{id}/retry',
			methods: [HttpMethod.POST],
			integration: new HttpLambdaIntegration('TransactionsRetryIntegration', transactionsRetryFn),
			authorizer
		});

		// Galleries CRUD
		const galleriesCreateFn = new NodejsFunction(this, 'GalleriesCreateFn', {
			entry: path.join(__dirname, '../../../backend/functions/galleries/create.ts'),
			handler: 'handler',
			...defaultFnProps,
			environment: envVars
		});
		const galleriesGetFn = new NodejsFunction(this, 'GalleriesGetFn', {
			entry: path.join(__dirname, '../../../backend/functions/galleries/get.ts'),
			handler: 'handler',
			...defaultFnProps,
			environment: envVars
		});
		const galleriesListFn = new NodejsFunction(this, 'GalleriesListFn', {
			entry: path.join(__dirname, '../../../backend/functions/galleries/list.ts'),
			handler: 'handler',
			...defaultFnProps,
			environment: envVars
		});
		const galleriesListImagesFn = new NodejsFunction(this, 'GalleriesListImagesFn', {
			entry: path.join(__dirname, '../../../backend/functions/galleries/listImages.ts'),
			handler: 'handler',
			...defaultFnProps,
			environment: envVars
		});
		const galleriesDeleteFn = new NodejsFunction(this, 'GalleriesDeleteFn', {
			entry: path.join(__dirname, '../../../backend/functions/galleries/delete.ts'),
			handler: 'handler',
			...defaultFnProps,
			environment: envVars
		});
		const galleriesSetSelectionModeFn = new NodejsFunction(this, 'GalleriesSetSelectionModeFn', {
			entry: path.join(__dirname, '../../../backend/functions/galleries/setSelectionMode.ts'),
			handler: 'handler',
			...defaultFnProps,
			environment: envVars
		});
		const galleriesUpdatePricingFn = new NodejsFunction(this, 'GalleriesUpdatePricingFn', {
			entry: path.join(__dirname, '../../../backend/functions/galleries/updatePricingPackage.ts'),
			handler: 'handler',
			...defaultFnProps,
			environment: envVars
		});
		const galleriesSetClientPasswordFn = new NodejsFunction(this, 'GalleriesSetClientPasswordFn', {
			entry: path.join(__dirname, '../../../backend/functions/galleries/setClientPassword.ts'),
			handler: 'handler',
			...defaultFnProps,
			environment: envVars
		});
		const galleriesPayFn = new NodejsFunction(this, 'GalleriesPayFn', {
			entry: path.join(__dirname, '../../../backend/functions/galleries/pay.ts'),
			handler: 'handler',
			...defaultFnProps,
			environment: envVars
		});
		const galleriesCancelTransactionFn = new NodejsFunction(this, 'GalleriesCancelTransactionFn', {
			entry: path.join(__dirname, '../../../backend/functions/galleries/cancelTransaction.ts'),
			handler: 'handler',
			...defaultFnProps,
			environment: envVars
		});
		const galleriesDeletePhotoFn = new NodejsFunction(this, 'GalleriesDeletePhotoFn', {
			entry: path.join(__dirname, '../../../backend/functions/galleries/deletePhoto.ts'),
			handler: 'handler',
			...defaultFnProps,
			environment: envVars
		});
		const galleriesUpdateFn = new NodejsFunction(this, 'GalleriesUpdateFn', {
			entry: path.join(__dirname, '../../../backend/functions/galleries/update.ts'),
			handler: 'handler',
			...defaultFnProps,
			environment: envVars
		});
		// Make delete function name available to expiry lambda
		envVars['GALLERIES_DELETE_FN_NAME'] = galleriesDeleteFn.functionName;
		galleries.grantReadWriteData(galleriesCreateFn);
		wallet.grantReadWriteData(galleriesCreateFn);
		walletLedger.grantReadWriteData(galleriesCreateFn);
		transactions.grantReadWriteData(galleriesCreateFn); // Needed to create transactions
		galleryAddons.grantReadWriteData(galleriesCreateFn); // Needed to create backup storage addon during gallery creation
		orders.grantReadWriteData(galleriesCreateFn); // Needed to create orders for non-selection galleries
		galleries.grantReadData(galleriesGetFn);
		transactions.grantReadData(galleriesGetFn); // Needed to derive payment status
		galleries.grantReadData(galleriesListFn);
		galleryAddons.grantReadData(galleriesListFn); // Needed to check hasBackupStorage
		transactions.grantReadData(galleriesListFn); // Needed to derive payment status from transactions
		galleries.grantReadData(galleriesListImagesFn);
		galleries.grantReadData(galleriesPayFn);
		transactions.grantReadWriteData(galleriesPayFn); // Needed to update transactions
		galleries.grantReadData(galleriesCancelTransactionFn);
		transactions.grantReadWriteData(galleriesCancelTransactionFn); // Needed to cancel transactions
		galleries.grantReadWriteData(galleriesDeleteFn);
		transactions.grantReadWriteData(galleriesDeleteFn); // Needed to cancel transactions before deletion
		orders.grantReadWriteData(galleriesDeleteFn);
		galleryAddons.grantReadWriteData(galleriesDeleteFn); // Needed to delete gallery addons when gallery is deleted
		galleries.grantReadWriteData(galleriesDeletePhotoFn);
		galleries.grantReadWriteData(galleriesSetSelectionModeFn);
		galleries.grantReadWriteData(galleriesUpdatePricingFn);
		galleries.grantReadWriteData(galleriesSetClientPasswordFn);
		galleries.grantReadWriteData(galleriesUpdateFn);
		galleriesBucket.grantReadWrite(galleriesDeletePhotoFn);
		// Allow sending emails via SES if SENDER_EMAIL is configured
		galleriesSetClientPasswordFn.addToRolePolicy(new PolicyStatement({
			actions: ['ses:SendEmail', 'ses:SendRawEmail'],
			resources: ['*']
		}));
		galleriesBucket.grantReadWrite(galleriesCreateFn);
		galleriesBucket.grantReadWrite(galleriesDeleteFn);
		galleriesBucket.grantRead(galleriesListImagesFn);
		// Grant delete lambda SES permissions for confirmation emails
		galleriesDeleteFn.addToRolePolicy(new PolicyStatement({
			actions: ['ses:SendEmail', 'ses:SendRawEmail'],
			resources: ['*']
		}));
		// Grant delete lambda Cognito read permissions for fallback email retrieval
		galleriesDeleteFn.addToRolePolicy(new PolicyStatement({
			actions: ['cognito-idp:AdminGetUser'],
			resources: [userPool.userPoolArn]
		}));

		httpApi.addRoutes({
			path: '/galleries',
			methods: [HttpMethod.POST],
			integration: new HttpLambdaIntegration('GalleriesCreateIntegration', galleriesCreateFn),
			authorizer
		});
		httpApi.addRoutes({
			path: '/galleries',
			methods: [HttpMethod.GET],
			integration: new HttpLambdaIntegration('GalleriesListIntegration', galleriesListFn),
			authorizer
		});
		httpApi.addRoutes({
			path: '/galleries/{id}',
			methods: [HttpMethod.GET],
			integration: new HttpLambdaIntegration('GalleriesGetIntegration', galleriesGetFn),
			authorizer
		});
		httpApi.addRoutes({
			path: '/galleries/{id}',
			methods: [HttpMethod.PUT],
			integration: new HttpLambdaIntegration('GalleriesUpdateIntegration', galleriesUpdateFn),
			authorizer
		});
		httpApi.addRoutes({
			path: '/galleries/{id}/images',
			methods: [HttpMethod.GET],
			integration: new HttpLambdaIntegration('GalleriesListImagesIntegration', galleriesListImagesFn)
		});
		httpApi.addRoutes({
			path: '/galleries/{id}/pay',
			methods: [HttpMethod.POST],
			integration: new HttpLambdaIntegration('GalleriesPayIntegration', galleriesPayFn),
			authorizer
		});
		httpApi.addRoutes({
			path: '/galleries/{id}/cancel-transaction',
			methods: [HttpMethod.POST],
			integration: new HttpLambdaIntegration('GalleriesCancelTransactionIntegration', galleriesCancelTransactionFn),
			authorizer
		});
		httpApi.addRoutes({
			path: '/galleries/{id}',
			methods: [HttpMethod.DELETE],
			integration: new HttpLambdaIntegration('GalleriesDeleteIntegration', galleriesDeleteFn),
			authorizer
		});
		httpApi.addRoutes({
			path: '/galleries/{id}/selection-mode',
			methods: [HttpMethod.PATCH],
			integration: new HttpLambdaIntegration('GalleriesSetSelectionModeIntegration', galleriesSetSelectionModeFn),
			authorizer
		});
		httpApi.addRoutes({
			path: '/galleries/{id}/pricing-package',
			methods: [HttpMethod.PATCH],
			integration: new HttpLambdaIntegration('GalleriesUpdatePricingIntegration', galleriesUpdatePricingFn),
			authorizer
		});
		httpApi.addRoutes({
			path: '/galleries/{id}/client-password',
			methods: [HttpMethod.PATCH],
			integration: new HttpLambdaIntegration('GalleriesSetClientPasswordIntegration', galleriesSetClientPasswordFn),
			authorizer
		});
		httpApi.addRoutes({
			path: '/galleries/{id}/photos/{filename}',
			methods: [HttpMethod.DELETE],
			integration: new HttpLambdaIntegration('GalleriesDeletePhotoIntegration', galleriesDeletePhotoFn)
		});

		// Uploads presign
		const presignFn = new NodejsFunction(this, 'UploadsPresignFn', {
			entry: path.join(__dirname, '../../../backend/functions/uploads/presign.ts'),
			handler: 'handler',
			...defaultFnProps,
			environment: envVars
		});
		galleriesBucket.grantReadWrite(presignFn);
		galleries.grantReadData(presignFn);
		httpApi.addRoutes({
			path: '/uploads/presign',
			methods: [HttpMethod.POST],
			integration: new HttpLambdaIntegration('UploadsPresignIntegration', presignFn),
			authorizer
		});

		// Downloads zip
		const zipFn = new NodejsFunction(this, 'DownloadsZipFn', {
			entry: path.join(__dirname, '../../../backend/functions/downloads/createZip.ts'),
			handler: 'handler',
			runtime: Runtime.NODEJS_20_X,
			memorySize: 512,
			timeout: Duration.minutes(5),
			bundling: {
				externalModules: ['aws-sdk'],
				minify: true,
				treeShaking: true,
				sourceMap: false
			},
			environment: envVars
		});
		galleriesBucket.grantReadWrite(zipFn);
		// Make zip function name available to other lambdas
		envVars['DOWNLOADS_ZIP_FN_NAME'] = zipFn.functionName;
		
		// Generate ZIPs for addon purchase (created early so env var is available to webhook)
		const generateZipsForAddonFn = new NodejsFunction(this, 'GenerateZipsForAddonFn', {
			entry: path.join(__dirname, '../../../backend/functions/orders/generateZipsForAddon.ts'),
			handler: 'handler',
			...defaultFnProps,
			timeout: Duration.minutes(5), // ZIP generation can take time
			memorySize: 512, // More memory for processing multiple orders
			environment: envVars
		});
		orders.grantReadWriteData(generateZipsForAddonFn); // Needed to update orders with zipKey
		zipFn.grantInvoke(generateZipsForAddonFn); // Needed to generate ZIPs
		galleriesBucket.grantRead(generateZipsForAddonFn); // Needed to check if original files exist (HeadObject, ListObjectsV2)
		// Make function name available to other lambdas (especially webhook)
		envVars['GENERATE_ZIPS_FOR_ADDON_FN_NAME'] = generateZipsForAddonFn.functionName;
		generateZipsForAddonFn.grantInvoke(webhookFn); // webhook can invoke it for ZIP generation
		
		httpApi.addRoutes({
			path: '/downloads/zip',
			methods: [HttpMethod.POST],
			integration: new HttpLambdaIntegration('DownloadsZipIntegration', zipFn)
		});

		// Selections (public, password-gated in handler)
		const approveSelectionFn = new NodejsFunction(this, 'SelectionsApproveFn', {
			entry: path.join(__dirname, '../../../backend/functions/selections/approveSelection.ts'),
			handler: 'handler',
			...defaultFnProps,
			environment: envVars
		});
		galleries.grantReadWriteData(approveSelectionFn);
		orders.grantReadWriteData(approveSelectionFn);
		galleryAddons.grantReadWriteData(approveSelectionFn);
		zipFn.grantInvoke(approveSelectionFn);
		// Allow SES for notifications
		approveSelectionFn.addToRolePolicy(new PolicyStatement({
			actions: ['ses:SendEmail', 'ses:SendRawEmail'],
			resources: ['*']
		}));
		httpApi.addRoutes({
			path: '/galleries/{id}/selections/approve',
			methods: [HttpMethod.POST],
			integration: new HttpLambdaIntegration('SelectionsApproveIntegration', approveSelectionFn)
		});
		// Client login (public)
		const clientLoginFn = new NodejsFunction(this, 'GalleriesClientLoginFn', {
			entry: path.join(__dirname, '../../../backend/functions/galleries/clientLogin.ts'),
			handler: 'handler',
			...defaultFnProps,
			environment: envVars
		});
		galleries.grantReadData(clientLoginFn);
		httpApi.addRoutes({
			path: '/galleries/{id}/client-login',
			methods: [HttpMethod.POST],
			integration: new HttpLambdaIntegration('GalleriesClientLoginIntegration', clientLoginFn)
		});

		// Get selection (public, password via query)
		const getSelectionFn = new NodejsFunction(this, 'SelectionsGetFn', {
			entry: path.join(__dirname, '../../../backend/functions/selections/getSelection.ts'),
			handler: 'handler',
			...defaultFnProps,
			environment: envVars
		});
		galleries.grantReadData(getSelectionFn);
		orders.grantReadData(getSelectionFn);
		httpApi.addRoutes({
			path: '/galleries/{id}/selections/{clientId}',
			methods: [HttpMethod.GET],
			integration: new HttpLambdaIntegration('SelectionsGetIntegration', getSelectionFn)
		});

		// Change request (public) & approval (authorizer)
		const changeRequestFn = new NodejsFunction(this, 'SelectionsChangeRequestFn', {
			entry: path.join(__dirname, '../../../backend/functions/selections/changeRequest.ts'),
			handler: 'handler',
			...defaultFnProps,
			environment: envVars
		});
		const changeApproveFn = new NodejsFunction(this, 'OrdersApproveChangeRequestFn', {
			entry: path.join(__dirname, '../../../backend/functions/orders/approveChangeRequest.ts'),
			handler: 'handler',
			...defaultFnProps,
			environment: envVars
		});
		galleries.grantReadWriteData(changeRequestFn);
		orders.grantReadWriteData(changeRequestFn);
		galleries.grantReadWriteData(changeApproveFn);
		orders.grantReadWriteData(changeApproveFn);
		galleriesBucket.grantWrite(changeApproveFn);
		httpApi.addRoutes({
			path: '/galleries/{id}/selection-change-request',
			methods: [HttpMethod.POST],
			integration: new HttpLambdaIntegration('SelectionsChangeRequestIntegration', changeRequestFn)
		});
		httpApi.addRoutes({
			path: '/galleries/{id}/orders/{orderId}/approve-change',
			methods: [HttpMethod.POST],
			integration: new HttpLambdaIntegration('OrdersApproveChangeRequestIntegration', changeApproveFn),
			authorizer
		});

		// Orders admin endpoints
		const ordersListFn = new NodejsFunction(this, 'OrdersListFn', {
			entry: path.join(__dirname, '../../../backend/functions/orders/list.ts'),
			handler: 'handler',
			...defaultFnProps,
			environment: envVars
		});
		const ordersListAllFn = new NodejsFunction(this, 'OrdersListAllFn', {
			entry: path.join(__dirname, '../../../backend/functions/orders/listAll.ts'),
			handler: 'handler',
			...defaultFnProps,
			environment: envVars
		});
		const ordersGetFn = new NodejsFunction(this, 'OrdersGetFn', {
			entry: path.join(__dirname, '../../../backend/functions/orders/get.ts'),
			handler: 'handler',
			...defaultFnProps,
			environment: envVars
		});
		const ordersDownloadZipFn = new NodejsFunction(this, 'OrdersDownloadZipFn', {
			entry: path.join(__dirname, '../../../backend/functions/orders/downloadZip.ts'),
			handler: 'handler',
			...defaultFnProps,
			environment: envVars
		});
		const ordersGenerateZipFn = new NodejsFunction(this, 'OrdersGenerateZipFn', {
			entry: path.join(__dirname, '../../../backend/functions/orders/generateZip.ts'),
			handler: 'handler',
			...defaultFnProps,
			environment: envVars
		});
		const ordersPurchaseAddonFn = new NodejsFunction(this, 'OrdersPurchaseAddonFn', {
			entry: path.join(__dirname, '../../../backend/functions/orders/purchaseAddon.ts'),
			handler: 'handler',
			...defaultFnProps,
			environment: envVars
		});
		const ordersMarkPaidFn = new NodejsFunction(this, 'OrdersMarkPaidFn', {
			entry: path.join(__dirname, '../../../backend/functions/orders/markPaid.ts'),
			handler: 'handler',
			...defaultFnProps,
			environment: envVars
		});
		const ordersMarkCanceledFn = new NodejsFunction(this, 'OrdersMarkCanceledFn', {
			entry: path.join(__dirname, '../../../backend/functions/orders/markCanceled.ts'),
			handler: 'handler',
			...defaultFnProps,
			environment: envVars
		});
		const ordersMarkRefundedFn = new NodejsFunction(this, 'OrdersMarkRefundedFn', {
			entry: path.join(__dirname, '../../../backend/functions/orders/markRefunded.ts'),
			handler: 'handler',
			...defaultFnProps,
			environment: envVars
		});
		const ordersMarkPartiallyPaidFn = new NodejsFunction(this, 'OrdersMarkPartiallyPaidFn', {
			entry: path.join(__dirname, '../../../backend/functions/orders/markPartiallyPaid.ts'),
			handler: 'handler',
			...defaultFnProps,
			environment: envVars
		});
		orders.grantReadData(ordersListFn);
		orders.grantReadData(ordersListAllFn);
		orders.grantReadData(ordersGetFn);
		orders.grantReadData(ordersDownloadZipFn);
		orders.grantReadWriteData(ordersMarkPaidFn);
		orders.grantReadWriteData(ordersMarkCanceledFn);
		orders.grantReadWriteData(ordersMarkRefundedFn);
		orders.grantReadWriteData(ordersMarkPartiallyPaidFn);
		orders.grantReadWriteData(ordersDownloadZipFn);
		orders.grantReadWriteData(ordersGenerateZipFn);
		orders.grantReadWriteData(ordersPurchaseAddonFn);
		wallet.grantReadWriteData(ordersPurchaseAddonFn); // Needed to debit wallet for addon purchase
		walletLedger.grantReadWriteData(ordersPurchaseAddonFn); // Needed to create ledger entry for debit
		transactions.grantReadWriteData(ordersPurchaseAddonFn); // Needed to create transactions
		galleries.grantReadData(ordersListFn);
		galleries.grantReadData(ordersListAllFn);
		galleryAddons.grantReadData(ordersListFn); // Needed to check hasBackupStorage for orders list
		galleries.grantReadData(ordersGetFn);
		galleryAddons.grantReadData(ordersGetFn);
		galleries.grantReadData(ordersDownloadZipFn);
		galleries.grantReadData(ordersPurchaseAddonFn);
		galleries.grantReadData(ordersMarkPaidFn);
		galleries.grantReadData(ordersMarkCanceledFn);
		galleries.grantReadData(ordersMarkRefundedFn);
		galleries.grantReadData(ordersMarkPartiallyPaidFn);
		galleries.grantReadData(ordersGenerateZipFn);
		galleriesBucket.grantRead(ordersDownloadZipFn);
		galleriesBucket.grantReadWrite(ordersDownloadZipFn);
		// ordersGenerateZipFn doesn't need S3 access - it only invokes zipFn Lambda which handles S3 operations
		// ordersPurchaseAddonFn no longer needs S3 access - it invokes generateZipsForAddonFn instead
		zipFn.grantInvoke(ordersDownloadZipFn);
		zipFn.grantInvoke(ordersGenerateZipFn);
		generateZipsForAddonFn.grantInvoke(ordersPurchaseAddonFn); // purchaseAddon can invoke it
		generateZipsForAddonFn.grantInvoke(webhookFn); // webhook can invoke it
		galleryAddons.grantReadWriteData(ordersDownloadZipFn);
		galleryAddons.grantReadWriteData(ordersGenerateZipFn);
		galleryAddons.grantReadWriteData(ordersPurchaseAddonFn);
		httpApi.addRoutes({
			path: '/galleries/{id}/orders',
			methods: [HttpMethod.GET],
			integration: new HttpLambdaIntegration('OrdersListIntegration', ordersListFn),
			authorizer
		});
		httpApi.addRoutes({
			path: '/orders',
			methods: [HttpMethod.GET],
			integration: new HttpLambdaIntegration('OrdersListAllIntegration', ordersListAllFn),
			authorizer
		});
		httpApi.addRoutes({
			path: '/galleries/{id}/orders/{orderId}',
			methods: [HttpMethod.GET],
			integration: new HttpLambdaIntegration('OrdersGetIntegration', ordersGetFn),
			authorizer
		});
		httpApi.addRoutes({
			path: '/galleries/{id}/orders/{orderId}/zip',
			methods: [HttpMethod.GET],
			integration: new HttpLambdaIntegration('OrdersDownloadZipIntegration', ordersDownloadZipFn),
			authorizer
		});
		httpApi.addRoutes({
			path: '/galleries/{id}/orders/{orderId}/generate-zip',
			methods: [HttpMethod.POST],
			integration: new HttpLambdaIntegration('OrdersGenerateZipIntegration', ordersGenerateZipFn),
			authorizer
		});
		httpApi.addRoutes({
			path: '/galleries/{id}/purchase-addon',
			methods: [HttpMethod.POST],
			integration: new HttpLambdaIntegration('OrdersPurchaseAddonIntegration', ordersPurchaseAddonFn),
			authorizer
		});
		httpApi.addRoutes({
			path: '/galleries/{id}/orders/{orderId}/mark-paid',
			methods: [HttpMethod.POST],
			integration: new HttpLambdaIntegration('OrdersMarkPaidIntegration', ordersMarkPaidFn),
			authorizer
		});
		httpApi.addRoutes({
			path: '/galleries/{id}/orders/{orderId}/mark-partially-paid',
			methods: [HttpMethod.POST],
			integration: new HttpLambdaIntegration('OrdersMarkPartiallyPaidIntegration', ordersMarkPartiallyPaidFn),
			authorizer
		});
		httpApi.addRoutes({
			path: '/galleries/{id}/orders/{orderId}/mark-canceled',
			methods: [HttpMethod.POST],
			integration: new HttpLambdaIntegration('OrdersMarkCanceledIntegration', ordersMarkCanceledFn),
			authorizer
		});
		httpApi.addRoutes({
			path: '/galleries/{id}/orders/{orderId}/mark-refunded',
			methods: [HttpMethod.POST],
			integration: new HttpLambdaIntegration('OrdersMarkRefundedIntegration', ordersMarkRefundedFn),
			authorizer
		});

		// Regenerate ZIP
		const ordersRegenerateZipFn = new NodejsFunction(this, 'OrdersRegenerateZipFn', {
			entry: path.join(__dirname, '../../../backend/functions/orders/regenerateZip.ts'),
			handler: 'handler',
			...defaultFnProps,
			environment: envVars
		});
		orders.grantReadWriteData(ordersRegenerateZipFn);
		galleries.grantReadData(ordersRegenerateZipFn);
		zipFn.grantInvoke(ordersRegenerateZipFn);
		httpApi.addRoutes({
			path: '/galleries/{id}/orders/{orderId}/regenerate-zip',
			methods: [HttpMethod.POST],
			integration: new HttpLambdaIntegration('OrdersRegenerateZipIntegration', ordersRegenerateZipFn),
			authorizer
		});

		// Clients CRUD endpoints
		const clientsCreateFn = new NodejsFunction(this, 'ClientsCreateFn', {
			entry: path.join(__dirname, '../../../backend/functions/clients/create.ts'),
			handler: 'handler',
			...defaultFnProps,
			environment: envVars
		});
		const clientsListFn = new NodejsFunction(this, 'ClientsListFn', {
			entry: path.join(__dirname, '../../../backend/functions/clients/list.ts'),
			handler: 'handler',
			...defaultFnProps,
			environment: envVars
		});
		const clientsGetFn = new NodejsFunction(this, 'ClientsGetFn', {
			entry: path.join(__dirname, '../../../backend/functions/clients/get.ts'),
			handler: 'handler',
			...defaultFnProps,
			environment: envVars
		});
		const clientsUpdateFn = new NodejsFunction(this, 'ClientsUpdateFn', {
			entry: path.join(__dirname, '../../../backend/functions/clients/update.ts'),
			handler: 'handler',
			...defaultFnProps,
			environment: envVars
		});
		const clientsDeleteFn = new NodejsFunction(this, 'ClientsDeleteFn', {
			entry: path.join(__dirname, '../../../backend/functions/clients/delete.ts'),
			handler: 'handler',
			...defaultFnProps,
			environment: envVars
		});
		clients.grantReadWriteData(clientsCreateFn);
		clients.grantReadData(clientsListFn);
		clients.grantReadData(clientsGetFn);
		clients.grantReadWriteData(clientsUpdateFn);
		clients.grantReadWriteData(clientsDeleteFn);
		httpApi.addRoutes({
			path: '/clients',
			methods: [HttpMethod.POST],
			integration: new HttpLambdaIntegration('ClientsCreateIntegration', clientsCreateFn),
			authorizer
		});
		httpApi.addRoutes({
			path: '/clients',
			methods: [HttpMethod.GET],
			integration: new HttpLambdaIntegration('ClientsListIntegration', clientsListFn),
			authorizer
		});
		httpApi.addRoutes({
			path: '/clients/{id}',
			methods: [HttpMethod.GET],
			integration: new HttpLambdaIntegration('ClientsGetIntegration', clientsGetFn),
			authorizer
		});
		httpApi.addRoutes({
			path: '/clients/{id}',
			methods: [HttpMethod.PUT],
			integration: new HttpLambdaIntegration('ClientsUpdateIntegration', clientsUpdateFn),
			authorizer
		});
		httpApi.addRoutes({
			path: '/clients/{id}',
			methods: [HttpMethod.DELETE],
			integration: new HttpLambdaIntegration('ClientsDeleteIntegration', clientsDeleteFn),
			authorizer
		});

		// Packages CRUD endpoints
		const packagesCreateFn = new NodejsFunction(this, 'PackagesCreateFn', {
			entry: path.join(__dirname, '../../../backend/functions/packages/create.ts'),
			handler: 'handler',
			...defaultFnProps,
			environment: envVars
		});
		const packagesListFn = new NodejsFunction(this, 'PackagesListFn', {
			entry: path.join(__dirname, '../../../backend/functions/packages/list.ts'),
			handler: 'handler',
			...defaultFnProps,
			environment: envVars
		});
		const packagesGetFn = new NodejsFunction(this, 'PackagesGetFn', {
			entry: path.join(__dirname, '../../../backend/functions/packages/get.ts'),
			handler: 'handler',
			...defaultFnProps,
			environment: envVars
		});
		const packagesUpdateFn = new NodejsFunction(this, 'PackagesUpdateFn', {
			entry: path.join(__dirname, '../../../backend/functions/packages/update.ts'),
			handler: 'handler',
			...defaultFnProps,
			environment: envVars
		});
		const packagesDeleteFn = new NodejsFunction(this, 'PackagesDeleteFn', {
			entry: path.join(__dirname, '../../../backend/functions/packages/delete.ts'),
			handler: 'handler',
			...defaultFnProps,
			environment: envVars
		});
		packages.grantReadWriteData(packagesCreateFn);
		packages.grantReadData(packagesListFn);
		packages.grantReadData(packagesGetFn);
		packages.grantReadWriteData(packagesUpdateFn);
		packages.grantReadWriteData(packagesDeleteFn);
		httpApi.addRoutes({
			path: '/packages',
			methods: [HttpMethod.POST],
			integration: new HttpLambdaIntegration('PackagesCreateIntegration', packagesCreateFn),
			authorizer
		});
		httpApi.addRoutes({
			path: '/packages',
			methods: [HttpMethod.GET],
			integration: new HttpLambdaIntegration('PackagesListIntegration', packagesListFn),
			authorizer
		});
		httpApi.addRoutes({
			path: '/packages/{id}',
			methods: [HttpMethod.GET],
			integration: new HttpLambdaIntegration('PackagesGetIntegration', packagesGetFn),
			authorizer
		});
		httpApi.addRoutes({
			path: '/packages/{id}',
			methods: [HttpMethod.PUT],
			integration: new HttpLambdaIntegration('PackagesUpdateIntegration', packagesUpdateFn),
			authorizer
		});
		httpApi.addRoutes({
			path: '/packages/{id}',
			methods: [HttpMethod.DELETE],
			integration: new HttpLambdaIntegration('PackagesDeleteIntegration', packagesDeleteFn),
			authorizer
		});

		// Processed complete
		const processedCompleteFn = new NodejsFunction(this, 'ProcessedCompleteFn', {
			entry: path.join(__dirname, '../../../backend/functions/processed/complete.ts'),
			handler: 'handler',
			...defaultFnProps,
			environment: envVars
		});
		orders.grantReadWriteData(processedCompleteFn);
		galleries.grantReadData(processedCompleteFn);
		galleriesBucket.grantWrite(processedCompleteFn);
		httpApi.addRoutes({
			path: '/galleries/{id}/processed/complete',
			methods: [HttpMethod.POST],
			integration: new HttpLambdaIntegration('ProcessedCompleteIntegration', processedCompleteFn),
			authorizer
		});

		// Send final link (order-based)
		const ordersSendFinalLinkFn = new NodejsFunction(this, 'OrdersSendFinalLinkFn', {
			entry: path.join(__dirname, '../../../backend/functions/orders/sendFinalLink.ts'),
			handler: 'handler',
			...defaultFnProps,
			environment: envVars
		});
		galleries.grantReadData(ordersSendFinalLinkFn);
		orders.grantReadWriteData(ordersSendFinalLinkFn); // Needs write to mark order as DELIVERED
		galleriesBucket.grantWrite(ordersSendFinalLinkFn);
		ordersSendFinalLinkFn.addToRolePolicy(new PolicyStatement({
			actions: ['ses:SendEmail', 'ses:SendRawEmail'],
			resources: ['*']
		}));
		httpApi.addRoutes({
			path: '/galleries/{id}/orders/{orderId}/send-final-link',
			methods: [HttpMethod.POST],
			integration: new HttpLambdaIntegration('OrdersSendFinalLinkIntegration', ordersSendFinalLinkFn),
			authorizer
		});

		// List delivered orders (client access)
		const ordersListDeliveredFn = new NodejsFunction(this, 'OrdersListDeliveredFn', {
			entry: path.join(__dirname, '../../../backend/functions/orders/listDelivered.ts'),
			handler: 'handler',
			...defaultFnProps,
			environment: envVars
		});
		galleries.grantReadData(ordersListDeliveredFn);
		orders.grantReadData(ordersListDeliveredFn);
		galleriesBucket.grantRead(ordersListDeliveredFn); // Needed to list final images
		httpApi.addRoutes({
			path: '/galleries/{id}/orders/delivered',
			methods: [HttpMethod.GET],
			integration: new HttpLambdaIntegration('OrdersListDeliveredIntegration', ordersListDeliveredFn)
		});

		// List final images for a specific order (client access)
		const ordersListFinalImagesFn = new NodejsFunction(this, 'OrdersListFinalImagesFn', {
			entry: path.join(__dirname, '../../../backend/functions/orders/listFinalImages.ts'),
			handler: 'handler',
			...defaultFnProps,
			environment: envVars
		});
		galleries.grantReadData(ordersListFinalImagesFn);
		orders.grantReadData(ordersListFinalImagesFn);
		galleriesBucket.grantRead(ordersListFinalImagesFn);
		httpApi.addRoutes({
			path: '/galleries/{id}/orders/{orderId}/final/images',
			methods: [HttpMethod.GET],
			integration: new HttpLambdaIntegration('OrdersListFinalImagesIntegration', ordersListFinalImagesFn)
		});

		// Upload final photos for a specific order (photographer access)
		const ordersUploadFinalFn = new NodejsFunction(this, 'OrdersUploadFinalFn', {
			entry: path.join(__dirname, '../../../backend/functions/orders/uploadFinal.ts'),
			handler: 'handler',
			...defaultFnProps,
			environment: envVars
		});
		galleries.grantReadData(ordersUploadFinalFn);
		orders.grantReadWriteData(ordersUploadFinalFn); // Needs write to update order status to PREPARING_DELIVERY
		galleryAddons.grantReadData(ordersUploadFinalFn); // Needed to check hasBackupStorage before deleting originals
		galleriesBucket.grantReadWrite(ordersUploadFinalFn); // Needs ListBucket to check if first photo, Write to upload, and Delete to remove originals
		httpApi.addRoutes({
			path: '/galleries/{id}/orders/{orderId}/final/upload',
			methods: [HttpMethod.POST],
			integration: new HttpLambdaIntegration('OrdersUploadFinalIntegration', ordersUploadFinalFn),
			authorizer
		});

		// Download final ZIP for a specific order (client access)
		const ordersDownloadFinalZipFn = new NodejsFunction(this, 'OrdersDownloadFinalZipFn', {
			entry: path.join(__dirname, '../../../backend/functions/orders/downloadFinalZip.ts'),
			handler: 'handler',
			runtime: Runtime.NODEJS_20_X,
			memorySize: 512,
			timeout: Duration.minutes(5),
			bundling: {
				externalModules: ['aws-sdk'],
				minify: true,
				treeShaking: true,
				sourceMap: false
			},
			environment: envVars
		});
		galleries.grantReadData(ordersDownloadFinalZipFn);
		orders.grantReadData(ordersDownloadFinalZipFn);
		galleriesBucket.grantRead(ordersDownloadFinalZipFn);
		httpApi.addRoutes({
			path: '/galleries/{id}/orders/{orderId}/final/zip',
			methods: [HttpMethod.POST],
			integration: new HttpLambdaIntegration('OrdersDownloadFinalZipIntegration', ordersDownloadFinalZipFn)
		});

		// Send gallery to client (invitation + password emails)
		const sendGalleryToClientFn = new NodejsFunction(this, 'GalleriesSendGalleryToClientFn', {
			entry: path.join(__dirname, '../../../backend/functions/galleries/sendGalleryToClient.ts'),
			handler: 'handler',
			...defaultFnProps,
			environment: envVars
		});
		galleries.grantReadData(sendGalleryToClientFn);
		sendGalleryToClientFn.addToRolePolicy(new PolicyStatement({
			actions: ['ses:SendEmail', 'ses:SendRawEmail'],
			resources: ['*']
		}));
		httpApi.addRoutes({
			path: '/galleries/{id}/send-to-client',
			methods: [HttpMethod.POST],
			integration: new HttpLambdaIntegration('GalleriesSendGalleryToClientIntegration', sendGalleryToClientFn),
			authorizer
		});

		// Export to Google/Apple Photos
		const exportFn = new NodejsFunction(this, 'GalleriesExportFn', {
			entry: path.join(__dirname, '../../../backend/functions/galleries/export.ts'),
			handler: 'handler',
			...defaultFnProps,
			environment: envVars
		});
		galleries.grantReadData(exportFn);
		orders.grantReadData(exportFn);
		galleriesBucket.grantRead(exportFn);
		exportFn.addToRolePolicy(new PolicyStatement({
			actions: ['ses:SendEmail', 'ses:SendRawEmail'],
			resources: ['*']
		}));
		httpApi.addRoutes({
			path: '/galleries/{id}/export',
			methods: [HttpMethod.POST],
			integration: new HttpLambdaIntegration('GalleriesExportIntegration', exportFn)
		});

		new CfnOutput(this, 'BucketName', { value: galleriesBucket.bucketName });
		new CfnOutput(this, 'OrdersTableName', { value: orders.tableName });
		new CfnOutput(this, 'UserPoolId', { value: userPool.userPoolId });
		new CfnOutput(this, 'UserPoolClientId', { value: userPoolClient.userPoolClientId });
		new CfnOutput(this, 'UserPoolDomain', { value: userPoolDomain.domainName });
		new CfnOutput(this, 'HttpApiUrl', { value: httpApi.apiEndpoint });

		// DynamoDB Stream handler for TTL deletions - automatically triggered when gallery expires
		// This is more efficient than daily scans - works to the second, scales infinitely
		const galleryExpiryStreamFn = new NodejsFunction(this, 'GalleryExpiryStreamFn', {
			entry: path.join(__dirname, '../../../backend/functions/expiry/onGalleryExpired.ts'),
			handler: 'handler',
			...defaultFnProps,
			timeout: Duration.minutes(5), // Handle multiple deletions
			environment: envVars
		});
		galleriesDeleteFn.grantInvoke(galleryExpiryStreamFn); // Can invoke delete Lambda
		// Connect DynamoDB Stream to Lambda
		// DynamoEventSource automatically grants the Lambda permission to read from the stream
		// Filter to only process TTL deletions (userIdentity.type = "Service" and userIdentity.principalId = "dynamodb.amazonaws.com")
		galleryExpiryStreamFn.addEventSource(new DynamoEventSource(galleries, {
			startingPosition: 'LATEST',
			batchSize: 10,
			maxBatchingWindow: Duration.seconds(5),
			filters: [
				{
					pattern: JSON.stringify({
						userIdentity: {
							type: ['Service'],
							principalId: ['dynamodb.amazonaws.com']
						},
						eventName: ['REMOVE']
					})
				}
			]
		}));

		// Expiry reminders schedule - sends warning emails and migrates existing galleries
		// Also handles fallback deletion for galleries that expired before migration
		// Deletion is now primarily handled automatically by DynamoDB TTL + Streams
		const expiryFn = new NodejsFunction(this, 'ExpiryCheckFn', {
			entry: path.join(__dirname, '../../../backend/functions/expiry/checkAndNotify.ts'),
			handler: 'handler',
			...defaultFnProps,
			environment: envVars
		});
		galleries.grantReadWriteData(expiryFn);
		galleriesDeleteFn.grantInvoke(expiryFn); // Needed for fallback deletion of already-expired galleries
		expiryFn.addToRolePolicy(new PolicyStatement({
			actions: ['ses:SendEmail', 'ses:SendRawEmail'],
			resources: ['*']
		}));
		// Grant expiry lambda Cognito read permissions for fallback email retrieval
		expiryFn.addToRolePolicy(new PolicyStatement({
			actions: ['cognito-idp:AdminGetUser'],
			resources: [userPool.userPoolArn]
		}));
		// Run every 6 hours for more frequent expiry checks and warnings
		// Cost: ~$37/month for 1M galleries (4 scans/day)
		// Balance: Frequent enough for timely warnings, cost-effective
		new Rule(this, 'ExpirySchedule', {
			schedule: Schedule.rate(Duration.hours(6)),
			targets: [new LambdaFunction(expiryFn)]
		});

		// Transaction expiry check (auto-cancel UNPAID transactions after 3 days for galleries, 15 minutes for wallet top-ups)
		const transactionExpiryFn = new NodejsFunction(this, 'TransactionExpiryCheckFn', {
			entry: path.join(__dirname, '../../../backend/functions/expiry/checkTransactions.ts'),
			handler: 'handler',
			...defaultFnProps,
			environment: envVars,
			timeout: Duration.minutes(5) // Increase timeout for scanning transactions
		});
		transactions.grantReadWriteData(transactionExpiryFn);
		galleries.grantReadWriteData(transactionExpiryFn);
		galleriesDeleteFn.grantInvoke(transactionExpiryFn);
		// Run every 15 minutes to check for expired wallet top-ups
		// Also checks gallery transactions (3 days expiry)
		new Rule(this, 'TransactionExpirySchedule', {
			schedule: Schedule.rate(Duration.minutes(15)),
			targets: [new LambdaFunction(transactionExpiryFn)]
		});

		// Images resize with Jimp (pure JavaScript, no native dependencies)
		const resizeFn = new NodejsFunction(this, 'ImagesOnUploadResizeFn', {
			entry: path.join(__dirname, '../../../backend/functions/images/onUploadResize.ts'),
			handler: 'handler',
			runtime: Runtime.NODEJS_20_X,
			memorySize: 1024, // More memory for image processing
			timeout: Duration.minutes(1),
			bundling: {
				externalModules: ['aws-sdk'], // Exclude aws-sdk (provided by Lambda runtime)
				depsLockFilePath: path.join(__dirname, '../../../yarn.lock'),
				minify: true,
				treeShaking: true,
				sourceMap: false
			},
			environment: envVars
		});
		galleriesBucket.grantReadWrite(resizeFn);
		galleries.grantReadWriteData(resizeFn);
		galleriesBucket.addEventNotification(
			// @ts-ignore
			require('aws-cdk-lib/aws-s3').EventType.OBJECT_CREATED_PUT,
			new (require('aws-cdk-lib/aws-s3-notifications').LambdaDestination)(resizeFn)
		);

		// CloudFront distribution for previews/* (use OAC for bucket access)
		// Use S3BucketOrigin.withOriginAccessControl() which automatically creates OAC
		const dist = new Distribution(this, 'PreviewsDistribution', {
			defaultBehavior: {
				origin: S3BucketOrigin.withOriginAccessControl(galleriesBucket, {
					originAccessControlName: `PhotoHub-${props.stage}-OAC`,
					description: `Origin Access Control for PhotoHub ${props.stage} galleries bucket`
				}),
				cachePolicy: CachePolicy.CACHING_OPTIMIZED,
				allowedMethods: AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
				viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS
			},
			comment: `PhotoHub previews ${props.stage}`
		});
		// S3BucketOrigin.withOriginAccessControl() automatically sets up the bucket policy
		// No manual policy needed - CDK handles it automatically
		// Add CloudFront domain to env vars after distribution is created
		envVars.CLOUDFRONT_DOMAIN = dist.distributionDomainName;
		// Update Lambda functions that need CloudFront domain (they were created before distribution)
		galleriesGetFn.addEnvironment('CLOUDFRONT_DOMAIN', dist.distributionDomainName);
		galleriesListFn.addEnvironment('CLOUDFRONT_DOMAIN', dist.distributionDomainName);
		galleriesListImagesFn.addEnvironment('CLOUDFRONT_DOMAIN', dist.distributionDomainName);
		ordersListDeliveredFn.addEnvironment('CLOUDFRONT_DOMAIN', dist.distributionDomainName);
		ordersListFinalImagesFn.addEnvironment('CLOUDFRONT_DOMAIN', dist.distributionDomainName);
		new CfnOutput(this, 'PreviewsDomainName', { value: dist.distributionDomainName });
		new CfnOutput(this, 'PreviewsDistributionId', { value: dist.distributionId });
	}
}

