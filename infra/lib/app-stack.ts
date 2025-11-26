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

	const users = new Table(this, 'UsersTable', {
		partitionKey: { name: 'userId', type: AttributeType.STRING },
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
				sourceMap: false,
				depsLockFilePath: path.join(__dirname, '../../../yarn.lock')
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
			USERS_TABLE: users.tableName,
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

		// Downloads zip - helper function invoked by API Lambda and other functions
		// Created before apiFn so DOWNLOADS_ZIP_FN_NAME can be added to envVars
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
				sourceMap: false,
				depsLockFilePath: path.join(__dirname, '../../../yarn.lock')
			},
			environment: envVars
		});
		galleriesBucket.grantReadWrite(zipFn);
		// Grant permission to update orders table to clear zipGenerating flag
		orders.grantReadWriteData(zipFn);
		envVars['DOWNLOADS_ZIP_FN_NAME'] = zipFn.functionName;

		// Single API Lambda function - handles all HTTP endpoints via Express router
		const apiFn = new NodejsFunction(this, 'ApiFunction', {
			entry: path.join(__dirname, '../../../backend/functions/api/index.ts'),
			handler: 'handler',
			runtime: Runtime.NODEJS_20_X,
			memorySize: 512, // Increased for Express overhead
			timeout: Duration.seconds(30), // Increased timeout for complex operations
			bundling: {
				externalModules: ['aws-sdk'],
				minify: true,
				treeShaking: true,
				sourceMap: false,
				depsLockFilePath: path.join(__dirname, '../../../yarn.lock'),
			},
			environment: envVars
		});

		// Grant all necessary permissions to the API Lambda
		// DynamoDB tables
		galleries.grantReadWriteData(apiFn);
		payments.grantReadWriteData(apiFn);
		wallet.grantReadWriteData(apiFn);
		walletLedger.grantReadWriteData(apiFn);
		orders.grantReadWriteData(apiFn);
		galleryAddons.grantReadWriteData(apiFn);
		transactions.grantReadWriteData(apiFn);
		clients.grantReadWriteData(apiFn);
		packages.grantReadWriteData(apiFn);
		notifications.grantReadWriteData(apiFn);
		users.grantReadWriteData(apiFn);

		// S3 bucket
		galleriesBucket.grantReadWrite(apiFn);

		// Cognito permissions
		apiFn.addToRolePolicy(new PolicyStatement({
			actions: ['cognito-idp:AdminInitiateAuth', 'cognito-idp:AdminSetUserPassword', 'cognito-idp:AdminGetUser'],
			resources: [userPool.userPoolArn]
		}));

		// SES permissions
		apiFn.addToRolePolicy(new PolicyStatement({
			actions: ['ses:SendEmail', 'ses:SendRawEmail'],
			resources: ['*']
		}));

		// Lambda invoke permissions (for zip generation functions)
		// Will be granted after zip functions are created

		// OPTIONS route for CORS preflight - no authorizer required
		httpApi.addRoutes({
			path: '/{proxy+}',
			methods: [HttpMethod.OPTIONS],
			integration: new HttpLambdaIntegration('ApiOptionsIntegration', apiFn)
			// No authorizer for OPTIONS requests
		});

		// Public routes (no authorizer required)
		// Client login endpoint - clients authenticate with gallery password, not Cognito
		httpApi.addRoutes({
			path: '/galleries/{id}/client-login',
			methods: [HttpMethod.POST],
			integration: new HttpLambdaIntegration('ApiClientLoginIntegration', apiFn)
			// No authorizer - public endpoint
		});

		// Client gallery endpoints (use client JWT tokens, not Cognito)
		// These endpoints verify client JWT tokens in the Lambda function itself
		httpApi.addRoutes({
			path: '/galleries/{id}/images',
			methods: [HttpMethod.GET],
			integration: new HttpLambdaIntegration('ApiGalleryImagesIntegration', apiFn)
			// No authorizer - uses client JWT token verification
		});
		httpApi.addRoutes({
			path: '/galleries/{id}/orders/delivered',
			methods: [HttpMethod.GET],
			integration: new HttpLambdaIntegration('ApiOrdersDeliveredIntegration', apiFn)
			// No authorizer - uses client JWT token verification
		});
		httpApi.addRoutes({
			path: '/galleries/{id}/selections',
			methods: [HttpMethod.GET],
			integration: new HttpLambdaIntegration('ApiSelectionsGetIntegration', apiFn)
			// No authorizer - uses client JWT token verification
		});
		httpApi.addRoutes({
			path: '/galleries/{id}/selections/approve',
			methods: [HttpMethod.POST],
			integration: new HttpLambdaIntegration('ApiSelectionsApproveIntegration', apiFn)
			// No authorizer - uses client JWT token verification
		});
		httpApi.addRoutes({
			path: '/galleries/{id}/selection-change-request',
			methods: [HttpMethod.POST],
			integration: new HttpLambdaIntegration('ApiSelectionChangeRequestIntegration', apiFn)
			// No authorizer - uses client JWT token verification
		});
		httpApi.addRoutes({
			path: '/galleries/{id}/orders/{orderId}/zip',
			methods: [HttpMethod.GET],
			integration: new HttpLambdaIntegration('ApiOrdersZipIntegration', apiFn)
			// No authorizer - uses client JWT token verification
		});
		httpApi.addRoutes({
			path: '/galleries/{id}/orders/{orderId}/final/images',
			methods: [HttpMethod.GET],
			integration: new HttpLambdaIntegration('ApiOrdersFinalImagesIntegration', apiFn)
			// No authorizer - uses client JWT token verification
		});
		httpApi.addRoutes({
			path: '/galleries/{id}/orders/{orderId}/final/zip',
			methods: [HttpMethod.GET, HttpMethod.POST], // Support both GET (new) and POST (backward compatibility)
			integration: new HttpLambdaIntegration('ApiOrdersFinalZipIntegration', apiFn)
			// No authorizer - uses client JWT token verification
		});

		// Single catch-all route for all API endpoints
		httpApi.addRoutes({
			path: '/{proxy+}',
			methods: [HttpMethod.ANY],
			integration: new HttpLambdaIntegration('ApiIntegration', apiFn),
			authorizer // Apply authorizer to all routes
		});

		// Also add root routes (without proxy)
		httpApi.addRoutes({
			path: '/health',
			methods: [HttpMethod.GET],
			integration: new HttpLambdaIntegration('ApiHealthIntegration', apiFn)
		});

		// Grant API Lambda permission to invoke zipFn
		apiFn.addToRolePolicy(new PolicyStatement({
			actions: ['lambda:InvokeFunction'],
			resources: [zipFn.functionArn]
		}));

		// Stripe payment functions - separate Lambda functions for better isolation and scaling
		const paymentsCheckoutFn = new NodejsFunction(this, 'PaymentsCheckoutFn', {
			entry: path.join(__dirname, '../../../backend/functions/payments/checkoutCreate.ts'),
			handler: 'handler',
			...defaultFnProps,
			environment: envVars
		});
		const paymentsWebhookFn = new NodejsFunction(this, 'PaymentsWebhookFn', {
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

		// Grant permissions for Stripe payment functions
		payments.grantReadWriteData(paymentsCheckoutFn);
		payments.grantReadWriteData(paymentsWebhookFn);
		transactions.grantReadWriteData(paymentsCheckoutFn); // Needed for fractional payments
		transactions.grantReadWriteData(paymentsWebhookFn); // Needed to update transaction status
		transactions.grantReadWriteData(paymentsCancelFn); // Needed to mark transaction as CANCELED
		wallet.grantReadWriteData(paymentsWebhookFn);
		walletLedger.grantReadWriteData(paymentsWebhookFn);
		galleries.grantReadWriteData(paymentsWebhookFn);
		orders.grantReadWriteData(paymentsWebhookFn);
		galleryAddons.grantReadWriteData(paymentsWebhookFn); // Needed for addon_payment to create addon

		// Add Stripe payment routes
		httpApi.addRoutes({
			path: '/payments/checkout',
			methods: [HttpMethod.POST],
			integration: new HttpLambdaIntegration('PaymentsCheckoutIntegration', paymentsCheckoutFn),
			authorizer
		});
		httpApi.addRoutes({
			path: '/payments/webhook',
			methods: [HttpMethod.POST],
			integration: new HttpLambdaIntegration('PaymentsWebhookIntegration', paymentsWebhookFn)
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

		// Gallery delete helper - used by expiry event handlers
		const galleriesDeleteHelperFn = new NodejsFunction(this, 'GalleriesDeleteHelperFn', {
			entry: path.join(__dirname, '../../../backend/functions/galleries/delete.ts'),
			handler: 'handler',
			...defaultFnProps,
			environment: envVars
		});
		galleries.grantReadWriteData(galleriesDeleteHelperFn);
		transactions.grantReadWriteData(galleriesDeleteHelperFn);
		orders.grantReadWriteData(galleriesDeleteHelperFn);
		galleryAddons.grantReadWriteData(galleriesDeleteHelperFn);
		galleriesBucket.grantReadWrite(galleriesDeleteHelperFn);
		galleriesDeleteHelperFn.addToRolePolicy(new PolicyStatement({
			actions: ['ses:SendEmail', 'ses:SendRawEmail'],
			resources: ['*']
		}));
		galleriesDeleteHelperFn.addToRolePolicy(new PolicyStatement({
			actions: ['cognito-idp:AdminGetUser'],
			resources: [userPool.userPoolArn]
		}));
		envVars['GALLERIES_DELETE_FN_NAME'] = galleriesDeleteHelperFn.functionName;

		// Remove all individual HTTP Lambda functions - they're now handled by the single API Lambda
		// Keeping only event-triggered and helper functions below

		// DynamoDB Stream handler for TTL deletions - automatically triggered when gallery expires
		const galleryExpiryStreamFn = new NodejsFunction(this, 'GalleryExpiryStreamFn', {
			entry: path.join(__dirname, '../../../backend/functions/expiry/onGalleryExpired.ts'),
			handler: 'handler',
			...defaultFnProps,
			timeout: Duration.minutes(5),
			environment: envVars
		});
		galleriesDeleteHelperFn.grantInvoke(galleryExpiryStreamFn);
		// Connect DynamoDB Stream to Lambda
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
		galleriesDeleteHelperFn.grantInvoke(expiryFn); // Needed for fallback deletion of already-expired galleries
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
		galleriesDeleteHelperFn.grantInvoke(transactionExpiryFn);
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
		// Add CloudFront domain and distribution ID to env vars after distribution is created
		envVars.CLOUDFRONT_DOMAIN = dist.distributionDomainName;
		envVars.CLOUDFRONT_DISTRIBUTION_ID = dist.distributionId;
		// Update API Lambda environment with CloudFront domain and distribution ID
		apiFn.addEnvironment('CLOUDFRONT_DOMAIN', dist.distributionDomainName);
		apiFn.addEnvironment('CLOUDFRONT_DISTRIBUTION_ID', dist.distributionId);

		// CloudFront invalidation permissions (must be added after distribution is created)
		apiFn.addToRolePolicy(new PolicyStatement({
			actions: ['cloudfront:CreateInvalidation'],
			resources: [`arn:aws:cloudfront::${this.account}:distribution/${dist.distributionId}`]
		}));

		// Outputs
		new CfnOutput(this, 'BucketName', { value: galleriesBucket.bucketName });
		new CfnOutput(this, 'OrdersTableName', { value: orders.tableName });
		new CfnOutput(this, 'UserPoolId', { value: userPool.userPoolId });
		new CfnOutput(this, 'UserPoolClientId', { value: userPoolClient.userPoolClientId });
		new CfnOutput(this, 'UserPoolDomain', { value: userPoolDomain.domainName });
		new CfnOutput(this, 'HttpApiUrl', { value: httpApi.apiEndpoint });
		new CfnOutput(this, 'PreviewsDomainName', { value: dist.distributionDomainName });
		new CfnOutput(this, 'PreviewsDistributionId', { value: dist.distributionId });
	}
}

