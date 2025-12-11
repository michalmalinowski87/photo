// @ts-nocheck
import { Construct } from 'constructs';
import { Stack, StackProps, CfnOutput, Duration, RemovalPolicy } from 'aws-cdk-lib';
import { Bucket, BlockPublicAccess, HttpMethods, EventType } from 'aws-cdk-lib/aws-s3';
import { LambdaDestination } from 'aws-cdk-lib/aws-s3-notifications';
import { AttributeType, BillingMode, Table, StreamViewType, CfnTable } from 'aws-cdk-lib/aws-dynamodb';
import { DynamoEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import { UserPool, UserPoolClient } from 'aws-cdk-lib/aws-cognito';
import { HttpApi, CorsHttpMethod, HttpMethod } from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { HttpUserPoolAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import { Runtime, LayerVersion } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Rule, Schedule, EventBus } from 'aws-cdk-lib/aws-events';
import { LambdaFunction } from 'aws-cdk-lib/aws-events-targets';
import { ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { Distribution, AllowedMethods, ViewerProtocolPolicy, CachePolicy, PriceClass, CacheCookieBehavior, CacheHeaderBehavior, CacheQueryStringBehavior } from 'aws-cdk-lib/aws-cloudfront';
import { S3BucketOrigin } from 'aws-cdk-lib/aws-cloudfront-origins';
import { Alarm, ComparisonOperator, Metric, Statistic, TreatMissingData } from 'aws-cdk-lib/aws-cloudwatch';
import { SnsAction } from 'aws-cdk-lib/aws-cloudwatch-actions';
import { Topic } from 'aws-cdk-lib/aws-sns';
import { EmailSubscription } from 'aws-cdk-lib/aws-sns-subscriptions';
import { Queue, QueueEncryption } from 'aws-cdk-lib/aws-sqs';
import { SqsEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
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
		// GSI for finding DRAFT galleries older than X days (for expiry cleanup)
		galleries.addGlobalSecondaryIndex({
			indexName: 'state-createdAt-index',
			partitionKey: { name: 'state', type: AttributeType.STRING },
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
	// GSI for querying orders by owner (for dashboard stats)
	orders.addGlobalSecondaryIndex({
		indexName: 'ownerId-deliveryStatus-index',
		partitionKey: { name: 'ownerId', type: AttributeType.STRING },
		sortKey: { name: 'deliveryStatus', type: AttributeType.STRING }
	});
	// GSI for filtering orders by delivery status within a gallery
	orders.addGlobalSecondaryIndex({
		indexName: 'galleryId-deliveryStatus-index',
		partitionKey: { name: 'galleryId', type: AttributeType.STRING },
		sortKey: { name: 'deliveryStatus', type: AttributeType.STRING }
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
	// GSI for finding expired wallet top-ups (status + createdAt, filter by type)
	transactions.addGlobalSecondaryIndex({
		indexName: 'status-createdAt-index',
		partitionKey: { name: 'status', type: AttributeType.STRING },
		sortKey: { name: 'createdAt', type: AttributeType.STRING }
	});
	// GSI for filtering transactions by status and type for a user
	// Uses composite sort key: "STATUS#TYPE" (e.g., "UNPAID#WALLET_TOPUP")
	// NOTE: This requires adding statusType field to transactions (composite: "STATUS#TYPE")
	// For now, keeping commented as it requires code changes to populate statusType field
	// transactions.addGlobalSecondaryIndex({
	// 	indexName: 'userId-statusType-index',
	// 	partitionKey: { name: 'userId', type: AttributeType.STRING },
	// 	sortKey: { name: 'statusType', type: AttributeType.STRING }
	// });

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

	const emailCodeRateLimit = new Table(this, 'EmailCodeRateLimitTable', {
		partitionKey: { name: 'email', type: AttributeType.STRING },
		billingMode: BillingMode.PAY_PER_REQUEST,
		removalPolicy: RemovalPolicy.RETAIN
	});
	// Enable TTL on the rate limit table to automatically clean up old entries
	const emailCodeRateLimitCfnTable = emailCodeRateLimit.node.defaultChild as CfnTable;
	emailCodeRateLimitCfnTable.timeToLiveSpecification = {
		enabled: true,
		attributeName: 'ttl'
	};

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
			`photocloud-${props.stage}-jwt-secret-change-in-production`;

		// Debug: Log Stripe key status at CDK synthesis time
		const stripeKeyFromEnv = process.env.STRIPE_SECRET_KEY;
		if (!stripeKeyFromEnv || stripeKeyFromEnv.trim() === '') {
			console.warn('⚠️  WARNING: STRIPE_SECRET_KEY is not set in process.env at CDK synthesis time');
			console.warn('   Available STRIPE-related env vars:', Object.keys(process.env).filter(k => k.includes('STRIPE')).join(', ') || 'none');
		} else {
			console.log('✓ STRIPE_SECRET_KEY is available at CDK synthesis time (length:', stripeKeyFromEnv.length, 'chars)');
		}

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
			EMAIL_CODE_RATE_LIMIT_TABLE: emailCodeRateLimit.tableName,
			SENDER_EMAIL: process.env.SENDER_EMAIL || '',
			STRIPE_SECRET_KEY: stripeKeyFromEnv || '',
			STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET || '',
			PUBLIC_API_URL: process.env.PUBLIC_API_URL || '',
			PUBLIC_GALLERY_URL: process.env.PUBLIC_GALLERY_URL || '',
			PUBLIC_DASHBOARD_URL: process.env.PUBLIC_DASHBOARD_URL || process.env.NEXT_PUBLIC_DASHBOARD_URL || 'http://localhost:3000',
			GALLERIES_TABLE: galleries.tableName,
			PAYMENTS_TABLE: payments.tableName,
			WALLETS_TABLE: wallet.tableName,
			WALLET_LEDGER_TABLE: walletLedger.tableName,
			ORDERS_TABLE: orders.tableName,
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
				externalModules: ['aws-sdk'], // Only externalize AWS SDK v2, v3 must be bundled
				minify: false, // Disable minification to prevent AWS SDK v3 constructor issues
				treeShaking: true,
				sourceMap: false,
				depsLockFilePath: path.join(__dirname, '../../../yarn.lock')
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
		transactions.grantReadWriteData(apiFn);
		clients.grantReadWriteData(apiFn);
		packages.grantReadWriteData(apiFn);
		notifications.grantReadWriteData(apiFn);
		users.grantReadWriteData(apiFn);
		emailCodeRateLimit.grantReadWriteData(apiFn);

		// S3 bucket
		galleriesBucket.grantReadWrite(apiFn);

		// Cognito permissions
		apiFn.addToRolePolicy(new PolicyStatement({
			actions: ['cognito-idp:AdminInitiateAuth', 'cognito-idp:AdminSetUserPassword', 'cognito-idp:AdminGetUser', 'cognito-idp:AdminCreateUser', 'cognito-idp:AdminResendConfirmationCode'],
			resources: [userPool.userPoolArn]
		}));

		// SES permissions
		apiFn.addToRolePolicy(new PolicyStatement({
			actions: ['ses:SendEmail', 'ses:SendRawEmail'],
			resources: ['*']
		}));

		// Lambda invoke permissions (for zip generation functions)
		// Will be granted after zip functions are created

		// Explicit OPTIONS route for CORS preflight - must come before catch-all route
		// API Gateway HTTP API v2's built-in CORS may not work correctly with authorizers,
		// so we handle OPTIONS explicitly to ensure preflight requests succeed
		httpApi.addRoutes({
			path: '/{proxy+}',
			methods: [HttpMethod.OPTIONS],
			integration: new HttpLambdaIntegration('ApiOptionsIntegration', apiFn)
			// No authorizer - OPTIONS requests must be public for CORS to work
		});

		// Public routes (no authorizer required)
		// Public auth endpoints (signup and resend verification code) with rate limiting
		httpApi.addRoutes({
			path: '/auth/public/signup',
			methods: [HttpMethod.POST, HttpMethod.OPTIONS],
			integration: new HttpLambdaIntegration('ApiPublicSignupIntegration', apiFn)
			// No authorizer - public endpoint
		});
		httpApi.addRoutes({
			path: '/auth/public/resend-verification-code',
			methods: [HttpMethod.POST, HttpMethod.OPTIONS],
			integration: new HttpLambdaIntegration('ApiPublicResendCodeIntegration', apiFn)
			// No authorizer - public endpoint
		});
		// Client login endpoint - clients authenticate with gallery password, not Cognito
		httpApi.addRoutes({
			path: '/galleries/{id}/client-login',
			methods: [HttpMethod.POST, HttpMethod.OPTIONS],
			integration: new HttpLambdaIntegration('ApiClientLoginIntegration', apiFn)
			// No authorizer - public endpoint
		});

		// Client gallery endpoints (use client JWT tokens, not Cognito)
		// These endpoints verify client JWT tokens in the Lambda function itself
		httpApi.addRoutes({
			path: '/galleries/{id}/images',
			methods: [HttpMethod.GET, HttpMethod.OPTIONS],
			integration: new HttpLambdaIntegration('ApiGalleryImagesIntegration', apiFn)
			// No authorizer - uses client JWT token verification
		});
		httpApi.addRoutes({
			path: '/galleries/{id}/orders',
			methods: [HttpMethod.GET, HttpMethod.OPTIONS],
			integration: new HttpLambdaIntegration('ApiOrdersListIntegration', apiFn)
			// No authorizer - uses client JWT token verification
		});
		httpApi.addRoutes({
			path: '/galleries/{id}/orders/delivered',
			methods: [HttpMethod.GET, HttpMethod.OPTIONS],
			integration: new HttpLambdaIntegration('ApiOrdersDeliveredIntegration', apiFn)
			// No authorizer - uses client JWT token verification
		});
		httpApi.addRoutes({
			path: '/galleries/{id}/selections',
			methods: [HttpMethod.GET, HttpMethod.OPTIONS],
			integration: new HttpLambdaIntegration('ApiSelectionsGetIntegration', apiFn)
			// No authorizer - uses client JWT token verification
		});
		httpApi.addRoutes({
			path: '/galleries/{id}/selections/approve',
			methods: [HttpMethod.POST, HttpMethod.OPTIONS],
			integration: new HttpLambdaIntegration('ApiSelectionsApproveIntegration', apiFn)
			// No authorizer - uses client JWT token verification
		});
		httpApi.addRoutes({
			path: '/galleries/{id}/selection-change-request',
			methods: [HttpMethod.POST, HttpMethod.OPTIONS],
			integration: new HttpLambdaIntegration('ApiSelectionChangeRequestIntegration', apiFn)
			// No authorizer - uses client JWT token verification
		});
		httpApi.addRoutes({
			path: '/galleries/{id}/orders/{orderId}/zip',
			methods: [HttpMethod.GET, HttpMethod.OPTIONS],
			integration: new HttpLambdaIntegration('ApiOrdersZipIntegration', apiFn)
			// No authorizer - uses client JWT token verification
		});
		httpApi.addRoutes({
			path: '/galleries/{id}/orders/{orderId}/final/images',
			methods: [HttpMethod.GET, HttpMethod.OPTIONS],
			integration: new HttpLambdaIntegration('ApiOrdersFinalImagesIntegration', apiFn)
			// No authorizer - uses client JWT token verification
		});
		httpApi.addRoutes({
			path: '/galleries/{id}/orders/{orderId}/final/zip',
			methods: [HttpMethod.GET, HttpMethod.POST, HttpMethod.OPTIONS], // Support both GET (new) and POST (backward compatibility)
			integration: new HttpLambdaIntegration('ApiOrdersFinalZipIntegration', apiFn)
			// No authorizer - uses client JWT token verification
		});

		// Stripe payment functions - separate Lambda functions for better isolation and scaling
		// Created BEFORE catch-all route to ensure they're matched first
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
		const paymentsCheckStatusFn = new NodejsFunction(this, 'PaymentsCheckStatusFn', {
			entry: path.join(__dirname, '../../../backend/functions/payments/checkStatus.ts'),
			handler: 'handler',
			...defaultFnProps,
			environment: envVars
		});

		// Grant permissions for Stripe payment functions
		payments.grantReadWriteData(paymentsCheckoutFn);
		payments.grantReadWriteData(paymentsWebhookFn);
		payments.grantReadData(paymentsCheckStatusFn); // Read-only for status checks
		transactions.grantReadWriteData(paymentsCheckoutFn);
		transactions.grantReadWriteData(paymentsWebhookFn); // Needed to update transaction status
		transactions.grantReadWriteData(paymentsCancelFn); // Needed to mark transaction as CANCELED
		transactions.grantReadData(paymentsCheckStatusFn); // Read-only for status checks
		wallet.grantReadWriteData(paymentsWebhookFn);
		walletLedger.grantReadWriteData(paymentsWebhookFn);
		galleries.grantReadWriteData(paymentsWebhookFn);
		orders.grantReadWriteData(paymentsWebhookFn);

		// Create EventBridge rule for Stripe partner events
		// Stripe sends events directly to EventBridge partner event bus, which routes them to Lambda
		const stripeEventSourceName = 'aws.partner/stripe.com/ed_test_61ThbOqJLCV8JR42e16Tc793AKNJz6JQrPoxvHJd2XxQ';
		
		// Reference the partner event bus (created by Stripe when you set up the integration)
		const stripePartnerEventBus = EventBus.fromEventBusName(
			this,
			'StripePartnerEventBus',
			stripeEventSourceName
		);
		
		// Create rule on the partner event bus (not the default event bus)
		// For partner event buses, the source field in events is the event bus name
		// Since all events on this bus are from Stripe, we could omit source filter,
		// but including it makes the rule more explicit and secure
		const stripeEventRule = new Rule(this, 'StripeEventRule', {
			eventBus: stripePartnerEventBus,
			eventPattern: {
				// Source is the event bus name for partner event buses
				// This matches: aws.partner/stripe.com/ed_test_61ThbOqJLCV8JR42e16Tc793AKNJz6JQrPoxvHJd2XxQ
				source: [stripeEventSourceName],
				'detail-type': [
					'checkout.session.completed',
					'checkout.session.expired',
					'payment_intent.payment_failed',
					'payment_intent.canceled',
					'charge.succeeded',
					'charge.updated',
					'payment_intent.succeeded'
				]
			},
			description: 'Route Stripe events from partner event bus to webhook Lambda',
			enabled: true
		});

		// Add Lambda as target for EventBridge rule
		stripeEventRule.addTarget(new LambdaFunction(paymentsWebhookFn));

		// Grant EventBridge permission to invoke Lambda
		paymentsWebhookFn.addPermission('AllowEventBridgeInvoke', {
			principal: new ServicePrincipal('events.amazonaws.com'),
			sourceArn: stripeEventRule.ruleArn
		});

		// Note: HTTP webhook route removed - we only use EventBridge for Stripe events
		httpApi.addRoutes({
			path: '/payments/checkout',
			methods: [HttpMethod.POST],
			integration: new HttpLambdaIntegration('PaymentsCheckoutIntegration', paymentsCheckoutFn),
			authorizer
		});
		httpApi.addRoutes({
			path: '/payments/success',
			methods: [HttpMethod.GET],
			integration: new HttpLambdaIntegration('PaymentsSuccessIntegration', paymentsSuccessFn)
			// No authorizer - public redirect endpoint
		});
		httpApi.addRoutes({
			path: '/payments/cancel',
			methods: [HttpMethod.GET],
			integration: new HttpLambdaIntegration('PaymentsCancelIntegration', paymentsCancelFn)
			// No authorizer - public redirect endpoint
		});
		httpApi.addRoutes({
			path: '/payments/check-status',
			methods: [HttpMethod.GET],
			integration: new HttpLambdaIntegration('PaymentsCheckStatusIntegration', paymentsCheckStatusFn)
			// No authorizer - public status check endpoint
		});

		// Single catch-all route for all API endpoints
		// Exclude OPTIONS from catch-all since it's handled separately above
		httpApi.addRoutes({
			path: '/{proxy+}',
			methods: [HttpMethod.GET, HttpMethod.POST, HttpMethod.PUT, HttpMethod.PATCH, HttpMethod.DELETE],
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

		// Image resizing is now handled client-side via Uppy thumbnail generation
		// No server-side resize Lambda needed
		
		// Storage recalculation is now handled on-demand with caching (5-minute TTL)
		// See backend/functions/galleries/recalculateBytesUsed.ts for implementation
		// Critical operations (pay, validateUploadLimits) force recalculation; display uses cached values

		// SQS Queue to batch delete operations - reduces Lambda invocations significantly
		// For 3000 deletes: without batching = 3000 invocations, with batching (batch size 10) = 300 invocations
		const deleteQueue = new Queue(this, 'DeleteOperationsQueue', {
			queueName: `PhotoHub-${props.stage}-DeleteOperationsQueue`,
			encryption: QueueEncryption.SQS_MANAGED,
			visibilityTimeout: Duration.minutes(3), // Must be > Lambda timeout (2 min) + processing time
			receiveMessageWaitTime: Duration.seconds(20), // Long polling for cost efficiency
			retentionPeriod: Duration.days(14)
		});

		// Lambda function to process batch deletes
		// Processes deletes in batches (optimal batch size: 6 per batch, 10 batches per invocation)
		// Consumes from SQS queue with batching to reduce invocations
		const deleteBatchFn = new NodejsFunction(this, 'ImagesOnS3DeleteBatchFn', {
			entry: path.join(__dirname, '../../../backend/functions/images/onS3DeleteBatch.ts'),
			handler: 'handler',
			runtime: Runtime.NODEJS_20_X,
			memorySize: 512, // Sufficient for batch delete operations
			timeout: Duration.minutes(2),
			bundling: {
				externalModules: ['aws-sdk'],
				depsLockFilePath: path.join(__dirname, '../../../yarn.lock'),
				minify: true,
				treeShaking: true,
				sourceMap: false
			},
			environment: envVars
		});
		galleriesBucket.grantReadWrite(deleteBatchFn);
		// Grant permissions to read/write galleries (for storage usage updates) and orders (for order status updates)
		galleries.grantReadWriteData(deleteBatchFn);
		orders.grantReadWriteData(deleteBatchFn);
		// Storage recalculation is now on-demand - no need to invoke Lambda after deletes
		
		// Configure Lambda to consume from SQS with batching
		// Batch size: 10 delete operations per invocation (optimal balance: cost vs memory/timeout)
		// Max concurrency: 5 (prevents overwhelming DynamoDB and S3)
		deleteBatchFn.addEventSource(new SqsEventSource(deleteQueue, {
			batchSize: 10, // Process up to 10 delete operations per Lambda invocation
			maxBatchingWindow: Duration.seconds(5), // Wait up to 5 seconds to batch more operations
			maxConcurrency: 5 // Limit concurrent executions to prevent DynamoDB/S3 throttling
		}));
		
		// Grant Lambda permission to consume from queue
		deleteQueue.grantConsumeMessages(deleteBatchFn);
		
		// Store function names and queue URLs in environment
		envVars['DELETE_BATCH_FN_NAME'] = deleteBatchFn.functionName;
		envVars['DELETE_QUEUE_URL'] = deleteQueue.queueUrl;
		
		// Grant API Lambda permission to invoke batch delete Lambda (for deletePhoto, deleteFinalImage, and batch delete endpoints)
		deleteBatchFn.grantInvoke(apiFn);
		
		// Update API Lambda environment with DELETE_BATCH_FN_NAME (added after apiFn was created)
		apiFn.addEnvironment('DELETE_BATCH_FN_NAME', deleteBatchFn.functionName);

		// CloudFront distribution for previews/* (use OAC for bucket access)
		// Use S3BucketOrigin.withOriginAccessControl() which automatically creates OAC
		// Price Class 100 restricts to US, Canada, Europe, Israel (excludes expensive Asia/South America)
		
		// Create custom cache policy that includes query strings in cache key
		// This allows cache-busting via query parameters (e.g., ?t=timestamp&v=random)
		// This is essential for handling image replacements with the same filename
		const imageCachePolicy = new CachePolicy(this, 'ImageCachePolicy', {
			cachePolicyName: `PhotoCloud-${props.stage}-ImageCache`,
			comment: 'Cache policy for images with query string support for cache-busting',
			defaultTtl: Duration.days(365), // Long cache for images
			minTtl: Duration.seconds(0),
			maxTtl: Duration.days(365),
			enableAcceptEncodingGzip: true,
			enableAcceptEncodingBrotli: true,
			// Include query strings in cache key to support cache-busting
			queryStringBehavior: CacheQueryStringBehavior.all(),
			// Don't include headers in cache key (standard for images)
			headerBehavior: CacheHeaderBehavior.none(),
			// Don't include cookies in cache key (standard for images)
			cookieBehavior: CacheCookieBehavior.none()
		});
		
		const dist = new Distribution(this, 'PreviewsDistribution', {
			defaultBehavior: {
				origin: S3BucketOrigin.withOriginAccessControl(galleriesBucket, {
					originAccessControlName: `PhotoCloud-${props.stage}-OAC`,
					description: `Origin Access Control for PhotoCloud ${props.stage} galleries bucket`
				}),
				cachePolicy: imageCachePolicy,
				allowedMethods: AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
				viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS
			},
			priceClass: PriceClass.PRICE_CLASS_100,
			comment: `PhotoCloud previews ${props.stage}`
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
		

		// CloudWatch Monitoring & Alarms for CloudFront cost optimization
		// Create SNS topic for cost alerts (only in production)
		const costAlertsTopic = props.stage === 'prod' ? new Topic(this, 'CloudFrontCostAlertsTopic', {
			displayName: `PhotoCloud-${props.stage}-CloudFront-Cost-Alerts`,
			topicName: `photocloud-${props.stage}-cloudfront-cost-alerts`
		}) : undefined;

		// Subscribe email if provided via environment variable (only in production)
		if (costAlertsTopic && process.env.COST_ALERT_EMAIL) {
			costAlertsTopic.addSubscription(new EmailSubscription(process.env.COST_ALERT_EMAIL));
		}

		// Alarm 1: CloudFront data transfer spike (>10GB/day = ~333MB/hour)
		// This helps detect unexpected traffic spikes that could increase costs
		const dataTransferAlarm = new Alarm(this, 'CloudFrontDataTransferSpikeAlarm', {
			alarmName: `PhotoCloud-${props.stage}-CloudFront-DataTransfer-Spike`,
			alarmDescription: 'Alert when CloudFront data transfer exceeds 333MB/hour (10GB/day threshold)',
			metric: new Metric({
				namespace: 'AWS/CloudFront',
				metricName: 'BytesDownloaded',
				dimensionsMap: {
					DistributionId: dist.distributionId
				},
				statistic: Statistic.SUM,
				period: Duration.hours(1)
			}),
			threshold: 333 * 1024 * 1024, // 333MB in bytes
			comparisonOperator: ComparisonOperator.GREATER_THAN_THRESHOLD,
			evaluationPeriods: 1,
			treatMissingData: TreatMissingData.NOT_BREACHING
		});
		if (costAlertsTopic) {
			dataTransferAlarm.addAlarmAction(new SnsAction(costAlertsTopic));
		}

		// Alarm 2: CloudFront request count spike (>100k requests/day = ~4167 requests/hour)
		// This helps detect unexpected request spikes
		const requestCountAlarm = new Alarm(this, 'CloudFrontRequestCountSpikeAlarm', {
			alarmName: `PhotoCloud-${props.stage}-CloudFront-RequestCount-Spike`,
			alarmDescription: 'Alert when CloudFront requests exceed 4167/hour (100k/day threshold)',
			metric: new Metric({
				namespace: 'AWS/CloudFront',
				metricName: 'Requests',
				dimensionsMap: {
					DistributionId: dist.distributionId
				},
				statistic: Statistic.SUM,
				period: Duration.hours(1)
			}),
			threshold: 4167,
			comparisonOperator: ComparisonOperator.GREATER_THAN_THRESHOLD,
			evaluationPeriods: 1,
			treatMissingData: TreatMissingData.NOT_BREACHING
		});
		if (costAlertsTopic) {
			requestCountAlarm.addAlarmAction(new SnsAction(costAlertsTopic));
		}

		// Note: Cache hit ratio monitoring
		// CloudFront doesn't provide a direct cache hit ratio metric
		// We can calculate it from: (1 - (OriginRequests / Requests)) * 100
		// For monitoring purposes, we'll alarm on high origin requests (low cache hit ratio)
		// High origin requests indicate low cache hit ratio (<80% target)
		// If Requests = 1000 and OriginRequests > 200, cache hit ratio < 80%
		const originRequestRatioAlarm = new Alarm(this, 'CloudFrontOriginRequestRatioAlarm', {
			alarmName: `PhotoCloud-${props.stage}-CloudFront-OriginRequest-Ratio`,
			alarmDescription: 'Alert when origin requests exceed 20% of total requests (cache hit ratio < 80%)',
			metric: new Metric({
				namespace: 'AWS/CloudFront',
				metricName: 'OriginRequests',
				dimensionsMap: {
					DistributionId: dist.distributionId
				},
				statistic: Statistic.SUM,
				period: Duration.hours(1)
			}),
			threshold: 1000, // Alert if origin requests > 1000/hour (adjust based on expected traffic)
			comparisonOperator: ComparisonOperator.GREATER_THAN_THRESHOLD,
			evaluationPeriods: 2, // Require 2 consecutive periods to reduce false positives
			treatMissingData: TreatMissingData.NOT_BREACHING
		});
		if (costAlertsTopic) {
			originRequestRatioAlarm.addAlarmAction(new SnsAction(costAlertsTopic));
		}

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

