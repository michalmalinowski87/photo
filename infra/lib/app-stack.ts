// @ts-nocheck
import { Construct } from 'constructs';
import { Stack, StackProps, CfnOutput, Duration, RemovalPolicy } from 'aws-cdk-lib';
import { Bucket, BlockPublicAccess, HttpMethods, EventType, CfnBucket, ObjectOwnership } from 'aws-cdk-lib/aws-s3';
import { LambdaDestination } from 'aws-cdk-lib/aws-s3-notifications';
import { AttributeType, BillingMode, Table, CfnTable, StreamViewType } from 'aws-cdk-lib/aws-dynamodb';
import { UserPool, UserPoolClient, CfnUserPool } from 'aws-cdk-lib/aws-cognito';
import { HttpApi, CorsHttpMethod, HttpMethod } from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { HttpUserPoolAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import { Runtime, LayerVersion, Code, StartingPosition, CfnFunction } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Rule, Schedule, EventBus } from 'aws-cdk-lib/aws-events';
import { LambdaFunction } from 'aws-cdk-lib/aws-events-targets';
import { Distribution, AllowedMethods, ViewerProtocolPolicy, CachePolicy, PriceClass, CacheCookieBehavior, CacheHeaderBehavior, CacheQueryStringBehavior } from 'aws-cdk-lib/aws-cloudfront';
import { S3BucketOrigin } from 'aws-cdk-lib/aws-cloudfront-origins';
import { Alarm, ComparisonOperator, Metric, Statistic, TreatMissingData } from 'aws-cdk-lib/aws-cloudwatch';
import { SnsAction } from 'aws-cdk-lib/aws-cloudwatch-actions';
import { Topic } from 'aws-cdk-lib/aws-sns';
import { EmailSubscription } from 'aws-cdk-lib/aws-sns-subscriptions';
import { Queue, QueueEncryption } from 'aws-cdk-lib/aws-sqs';
import { SqsEventSource, DynamoEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import { Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { StringParameter, ParameterType, CfnParameter } from 'aws-cdk-lib/aws-ssm';
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
			removalPolicy: RemovalPolicy.RETAIN,
			// Explicitly set object ownership to BUCKET_OWNER_ENFORCED for OAC compatibility
			// This ensures ACLs are disabled and bucket owner has full control
			objectOwnership: ObjectOwnership.BUCKET_OWNER_ENFORCED
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

		// Configure S3 Intelligent-Tiering for ZIP files
		// Provides automatic cost savings (down to ~40-68% lower after 30-90 days) while keeping instant access forever
		// Small monitoring fee (~$0.0025/month per ZIP) is negligible compared to storage savings
		// Note: Intelligent-Tiering cannot be used as a lifecycle transition target
		// Objects must be uploaded directly to Intelligent-Tiering storage class
		// This is configured in createZip.ts when uploading ZIP files to S3

		// ZIP cleanup: Scheduled Lambda function to delete ZIPs older than 2 hours
		// Presigned URLs expire after 1 hour, so this gives a 1-hour safety margin
		// This prevents S3 storage bloat from multiple ZIP generations
		// Note: Using Lambda instead of lifecycle rule for precise control (only delete .zip files)

		const galleries = new Table(this, 'GalleriesTable', {
			partitionKey: { name: 'galleryId', type: AttributeType.STRING },
			billingMode: BillingMode.PAY_PER_REQUEST,
			removalPolicy: RemovalPolicy.RETAIN
			// Note: DynamoDB Streams were previously used for TTL deletions, but are no longer needed
			// Gallery expiration is now handled by EventBridge Scheduler
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
		
		// Note: TTL was previously enabled for gallery expiration, but is no longer used
		// Gallery expiration is now handled by EventBridge Scheduler for precise timing

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
		removalPolicy: RemovalPolicy.RETAIN,
		stream: StreamViewType.NEW_AND_OLD_IMAGES // Enable streams to detect deliveryStatus changes
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

	const images = new Table(this, 'ImagesTable', {
		partitionKey: { name: 'galleryId', type: AttributeType.STRING },
		sortKey: { name: 'imageKey', type: AttributeType.STRING },
		billingMode: BillingMode.PAY_PER_REQUEST,
		removalPolicy: RemovalPolicy.RETAIN
	});
	// GSI for time-based queries (newest first)
	images.addGlobalSecondaryIndex({
		indexName: 'galleryId-lastModified-index',
		partitionKey: { name: 'galleryId', type: AttributeType.STRING },
		sortKey: { name: 'lastModified', type: AttributeType.NUMBER }
	});
	// Sparse GSI for filtering final images by orderId
	images.addGlobalSecondaryIndex({
		indexName: 'galleryId-orderId-index',
		partitionKey: { name: 'galleryId', type: AttributeType.STRING },
		sortKey: { name: 'orderId', type: AttributeType.STRING }
	});

		const userPool = new UserPool(this, 'PhotographersUserPool', {
			selfSignUpEnabled: true,
			signInAliases: { email: true },
			autoVerify: { email: true }, // REQUIRED: AutoVerifiedAttributes must include email for ResendConfirmationCode to work
			// According to AWS docs: "Amazon Cognito sends confirmation codes to the user attribute 
			// in the AutoVerifiedAttributes property of your user pool"
			// This doesn't auto-verify the email - it tells Cognito to send verification codes TO the email
			// Customize email verification templates (for signup) - removes "new" from message
			userVerificationEmailSubject: 'Verify your account',
			userVerificationEmailBody: 'The verification code to your account is {####}'
		});
		
		// Customize email templates using CfnUserPool for full control
		// Cognito uses VerificationMessageTemplate for code-based verification (both signup and password reset)
		const cfnUserPool = userPool.node.defaultChild as CfnUserPool;
		// Explicitly set AutoVerifiedAttributes to ensure ResendConfirmationCode works
		// This is critical - without this, ResendConfirmationCode will fail with "Auto verification not turned on"
		cfnUserPool.addPropertyOverride('AutoVerifiedAttributes', ['email']);
		// Override verification email template - this affects both signup verification and password reset
		// Removes "new" from the default message
		cfnUserPool.addPropertyOverride('VerificationMessageTemplate.EmailSubject', 'Verify your account');
		cfnUserPool.addPropertyOverride('VerificationMessageTemplate.EmailMessage', 'The verification code to your account is {####}');
		
		// Note: PostAuthentication Lambda trigger will be added later to avoid circular dependencies
		
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

		// AWS SDK v3 Lambda Layer - shared across all functions to reduce bundle sizes
		// Layer structure: nodejs/node_modules/@aws-sdk/...
		// Path is relative to compiled output location (infra/dist/lib/)
		// Layer directory MUST be pre-built (deploy.sh handles this automatically)
		// CDK will zip the pre-built directory without Docker bundling
		const layerPath = path.join(__dirname, '../../layers/aws-sdk');
		const awsSdkLayer = new LayerVersion(this, 'AwsSdkLayer', {
			code: Code.fromAsset(layerPath, {
				// Only exclude root-level files, not files in node_modules
				// This ensures all dependencies (including debug, finalhandler, etc.) are included
				exclude: [
					'README.md',
					'build-layer.sh',
					'*.ts',
					'*.tsx',
					'*.jsx'
				]
			}),
			compatibleRuntimes: [Runtime.NODEJS_20_X],
			description: 'AWS SDK v3 packages for Lambda functions',
			layerVersionName: `PhotoHub-${props.stage}-aws-sdk-layer`
		});

		const defaultFnProps = {
			runtime: Runtime.NODEJS_20_X,
			memorySize: 256,
			timeout: Duration.seconds(10),
			layers: [awsSdkLayer],
			bundling: {
				externalModules: [
					'aws-sdk', // AWS SDK v2 (available in Lambda runtime)
					'@aws-sdk/client-cloudfront',
					'@aws-sdk/client-cloudwatch',
					'@aws-sdk/client-cognito-identity-provider',
					'@aws-sdk/client-dynamodb',
					'@aws-sdk/client-lambda',
					'@aws-sdk/client-s3',
					'@aws-sdk/client-scheduler',
					'@aws-sdk/client-ses',
					'@aws-sdk/client-sqs',
					'@aws-sdk/client-ssm',
					'@aws-sdk/lib-dynamodb',
					'@aws-sdk/s3-request-presigner',
					'express' // Express framework (in layer for API and Auth functions)
				],
				minify: true,
				treeShaking: true,
				sourceMap: false,
				format: 'cjs', // CommonJS format for better tree-shaking in Node.js
				mainFields: ['module', 'main'], // Prefer ES modules for better tree-shaking
				depsLockFilePath: path.join(__dirname, '../../../yarn.lock')
			}
		};

		// Generate or use existing JWT secret for client gallery authentication
		const jwtSecret = this.node.tryGetContext('jwtSecret') || 
			process.env.JWT_SECRET || 
			`photocloud-${props.stage}-jwt-secret-change-in-production`;

		// Secret for encrypting client gallery passwords stored in DynamoDB (reversible, for emailing).
		// IMPORTANT: This must be a long, random secret in production.
		const galleryPasswordEncryptionSecret =
			this.node.tryGetContext('galleryPasswordEncryptionSecret') ||
			process.env.GALLERY_PASSWORD_ENCRYPTION_SECRET ||
			`photocloud-${props.stage}-gallery-password-enc-secret-change-in-production`;

		// Debug: Log Stripe key status at CDK synthesis time
		const stripeKeyFromEnv = process.env.STRIPE_SECRET_KEY;
		if (!stripeKeyFromEnv || stripeKeyFromEnv.trim() === '') {
			console.warn('⚠️  WARNING: STRIPE_SECRET_KEY is not set in process.env at CDK synthesis time');
			console.warn('   Available STRIPE-related env vars:', Object.keys(process.env).filter(k => k.includes('STRIPE')).join(', ') || 'none');
		} else {
			console.log('✓ STRIPE_SECRET_KEY is available at CDK synthesis time (length:', stripeKeyFromEnv.length, 'chars)');
		}

		// Create SSM parameters for configurable values (can be changed without redeploying)
		// These parameters are read at runtime by Lambda functions
		const ssmParameterPrefix = `/PhotoHub/${props.stage}`;
		
		// JWT Secret - SecureString for encryption
		// Note: Using StringParameter without type property - CDK will create as String type
		// For SecureString, parameters should be created manually or migrated to Secrets Manager
		const jwtSecretParam = new StringParameter(this, 'JwtSecretParam', {
			parameterName: `${ssmParameterPrefix}/JwtSecret`,
			stringValue: jwtSecret,
			description: 'JWT secret for client gallery authentication'
		});

		// Client gallery password encryption secret (used to encrypt `clientPasswordEncrypted` in DynamoDB).
		// NOTE: Stored as plain String to match the existing config approach in this stack.
		// If you want stronger protection, migrate this to Secrets Manager or SecureString + kms:Decrypt permissions.
		const galleryPasswordEncryptionSecretParam = new StringParameter(this, 'GalleryPasswordEncryptionSecretParam', {
			parameterName: `${ssmParameterPrefix}/GalleryPasswordEncryptionSecret`,
			stringValue: galleryPasswordEncryptionSecret,
			description: 'Secret used to encrypt client gallery passwords stored in DynamoDB (AES-256-GCM, versioned)'
		});

		// Stripe configuration - Using String type (SecureString deprecated in CDK)
		// For production, consider migrating to AWS Secrets Manager
		const stripeSecretKeyParam = new StringParameter(this, 'StripeSecretKeyParam', {
			parameterName: `${ssmParameterPrefix}/StripeSecretKey`,
			stringValue: stripeKeyFromEnv || '',
			description: 'Stripe secret key for payment processing'
		});

		const stripeWebhookSecretParam = new StringParameter(this, 'StripeWebhookSecretParam', {
			parameterName: `${ssmParameterPrefix}/StripeWebhookSecret`,
			stringValue: process.env.STRIPE_WEBHOOK_SECRET || '',
			description: 'Stripe webhook secret for webhook verification'
		});

		// Email configuration
		const senderEmailParam = new StringParameter(this, 'SenderEmailParam', {
			parameterName: `${ssmParameterPrefix}/SenderEmail`,
			stringValue: process.env.SENDER_EMAIL || '',
			description: 'SES verified sender email address'
		});

		// Public URLs configuration
		const publicApiUrlParam = new StringParameter(this, 'PublicApiUrlParam', {
			parameterName: `${ssmParameterPrefix}/PublicApiUrl`,
			stringValue: process.env.PUBLIC_API_URL || '',
			description: 'Public API Gateway URL'
		});

		const publicGalleryUrlParam = new StringParameter(this, 'PublicGalleryUrlParam', {
			parameterName: `${ssmParameterPrefix}/PublicGalleryUrl`,
			stringValue: process.env.PUBLIC_GALLERY_URL || '',
			description: 'Public gallery frontend URL'
		});

		const publicDashboardUrlParam = new StringParameter(this, 'PublicDashboardUrlParam', {
			parameterName: `${ssmParameterPrefix}/PublicDashboardUrl`,
			stringValue: process.env.PUBLIC_DASHBOARD_URL || process.env.NEXT_PUBLIC_DASHBOARD_URL || 'http://localhost:3000',
			description: 'Public dashboard frontend URL'
		});

		// CORS Origins configuration
		const corsOriginsParam = new StringParameter(this, 'CorsOriginsParam', {
			parameterName: `${ssmParameterPrefix}/CorsOrigins`,
			stringValue: corsOrigins.join(','),
			description: 'Comma-separated list of allowed CORS origins'
		});

		// SSM Parameter Store policy for Lambda functions to read configuration
		const ssmPolicy = new PolicyStatement({
			actions: [
				'ssm:GetParameter',
				'ssm:GetParameters'
			],
			resources: [
				`arn:aws:ssm:${this.region}:${this.account}:parameter${ssmParameterPrefix}/*`
			]
		});

		const envVars: Record<string, string> = {
			STAGE: props.stage,
			GALLERIES_BUCKET: galleriesBucket.bucketName,
			COGNITO_USER_POOL_ID: userPool.userPoolId,
			COGNITO_USER_POOL_CLIENT_ID: userPoolClient.userPoolClientId,
			COGNITO_DOMAIN: userPoolDomain.domainName,
			CLIENTS_TABLE: clients.tableName,
			PACKAGES_TABLE: packages.tableName,
			NOTIFICATIONS_TABLE: notifications.tableName,
			USERS_TABLE: users.tableName,
			EMAIL_CODE_RATE_LIMIT_TABLE: emailCodeRateLimit.tableName,
			GALLERIES_TABLE: galleries.tableName,
			PAYMENTS_TABLE: payments.tableName,
			WALLETS_TABLE: wallet.tableName,
			WALLET_LEDGER_TABLE: walletLedger.tableName,
			ORDERS_TABLE: orders.tableName,
			TRANSACTIONS_TABLE: transactions.tableName,
			IMAGES_TABLE: images.tableName
			// Note: INACTIVITY_SCANNER_FN_NAME is added via addEnvironment() after inactivityScannerFn is created
		};

		// Downloads zip - helper function invoked by API Lambda and other functions
		// Created before apiFn so DOWNLOADS_ZIP_FN_NAME can be added to envVars
		// Dead Letter Queue for failed ZIP generation (production reliability)
		const zipGenerationDLQ = new Queue(this, 'ZipGenerationDLQ', {
			queueName: `PhotoHub-${props.stage}-ZipGenerationDLQ`,
			encryption: QueueEncryption.SQS_MANAGED,
			retentionPeriod: Duration.days(14), // Retain failed jobs for 14 days for debugging
			visibilityTimeout: Duration.minutes(16) // Slightly longer than Lambda timeout
		});
		
		const zipFn = new NodejsFunction(this, 'DownloadsZipFn', {
			entry: path.join(__dirname, '../../../backend/functions/downloads/createZip.ts'),
			handler: 'handler',
			runtime: Runtime.NODEJS_20_X,
			memorySize: 1024, // Optimized to 1024MB - best performance with 15MB parts and 12 concurrency
			// Balanced configuration providing optimal throughput for ZIP generation
			// Connection reuse enabled (AWS_NODEJS_CONNECTION_REUSE_ENABLED=1) for efficient S3 operations
			timeout: Duration.minutes(15), // Increased for large ZIPs (up to 15GB)
			deadLetterQueue: zipGenerationDLQ, // DLQ for failed async invocations
			// Note: reservedConcurrentExecutions removed to avoid account limit conflicts
			// Lambda will auto-scale naturally. Concurrency is controlled at application level (12 concurrent downloads)
			layers: [awsSdkLayer],
			bundling: {
				externalModules: [
					'aws-sdk',
					'@aws-sdk/client-cloudfront',
					'@aws-sdk/client-cognito-identity-provider',
					'@aws-sdk/client-dynamodb',
					'@aws-sdk/client-lambda',
					'@aws-sdk/client-s3',
					'@aws-sdk/client-scheduler',
					'@aws-sdk/client-ses',
					'@aws-sdk/client-sqs',
					'@aws-sdk/lib-dynamodb',
					'@aws-sdk/s3-request-presigner',
					'express'
				],
				minify: true,
				treeShaking: true,
				sourceMap: false,
				format: 'cjs',
				mainFields: ['module', 'main'],
				depsLockFilePath: path.join(__dirname, '../../../yarn.lock')
			},
			environment: {
				...envVars,
				AWS_NODEJS_CONNECTION_REUSE_ENABLED: '1' // Enable HTTP connection reuse for S3 - 20-40% speedup
			}
		});
		galleriesBucket.grantReadWrite(zipFn);
		// Grant permission to update orders table to clear zipGenerating flag
		orders.grantReadWriteData(zipFn);
		// Grant permission to read galleries table for expiration date
		galleries.grantReadData(zipFn);
		// Grant permission to read images table for final ZIP generation (queries GSI galleryId-orderId-index)
		images.grantReadData(zipFn);
		// Explicitly grant Query permission on Images table GSI (grantReadData should include this, but being explicit)
		zipFn.addToRolePolicy(new PolicyStatement({
			actions: ['dynamodb:Query'],
			resources: [
				images.tableArn,
				`${images.tableArn}/index/*` // Include all GSIs
			]
		}));
		// Grant DLQ permissions
		zipGenerationDLQ.grantSendMessages(zipFn);
		zipFn.addToRolePolicy(ssmPolicy);
		envVars['DOWNLOADS_ZIP_FN_NAME'] = zipFn.functionName;
		
		// Lambda function to handle order delivery (pre-generate finals ZIP and trigger cleanup)
		const onOrderDeliveredFn = new NodejsFunction(this, 'OnOrderDeliveredFn', {
			entry: path.join(__dirname, '../../../backend/functions/orders/onOrderDelivered.ts'),
			handler: 'handler',
			runtime: Runtime.NODEJS_20_X,
			memorySize: 256,
			timeout: Duration.minutes(5),
			layers: [awsSdkLayer],
			bundling: {
				externalModules: [
					'aws-sdk',
					'@aws-sdk/client-dynamodb',
					'@aws-sdk/client-lambda',
					'@aws-sdk/client-s3',
					'@aws-sdk/lib-dynamodb'
				],
				minify: true,
				treeShaking: true,
				sourceMap: false,
				format: 'cjs',
				mainFields: ['module', 'main'],
				depsLockFilePath: path.join(__dirname, '../../../yarn.lock')
			},
			environment: {
				IMAGES_TABLE: images.tableName,
				ORDERS_TABLE: orders.tableName,
				GALLERIES_BUCKET: galleriesBucket.bucketName,
				DOWNLOADS_ZIP_FN_NAME: zipFn.functionName,
				CLEANUP_DELIVERED_ORDER_FN_NAME: '' // Will be set after cleanup function is created
			}
		});
		orders.grantReadWriteData(onOrderDeliveredFn);
		images.grantReadData(onOrderDeliveredFn);
		galleriesBucket.grantRead(onOrderDeliveredFn);
		zipFn.grantInvoke(onOrderDeliveredFn);
		envVars['ON_ORDER_DELIVERED_FN_NAME'] = onOrderDeliveredFn.functionName;
		
		// Lambda function to cleanup originals/finals after order is delivered
		const cleanupDeliveredOrderFn = new NodejsFunction(this, 'CleanupDeliveredOrderFn', {
			entry: path.join(__dirname, '../../../backend/functions/orders/cleanupDeliveredOrder.ts'),
			handler: 'handler',
			runtime: Runtime.NODEJS_20_X,
			memorySize: 512,
			timeout: Duration.minutes(10), // May need time for large batches
			layers: [awsSdkLayer],
			bundling: {
				externalModules: [
					'aws-sdk',
					'@aws-sdk/client-dynamodb',
					'@aws-sdk/client-s3',
					'@aws-sdk/lib-dynamodb'
				],
				minify: true,
				treeShaking: true,
				sourceMap: false,
				format: 'cjs',
				mainFields: ['module', 'main'],
				depsLockFilePath: path.join(__dirname, '../../../yarn.lock')
			},
			environment: {
				GALLERIES_TABLE: galleries.tableName,
				IMAGES_TABLE: images.tableName,
				ORDERS_TABLE: orders.tableName,
				GALLERIES_BUCKET: galleriesBucket.bucketName
			}
		});
		orders.grantReadWriteData(cleanupDeliveredOrderFn);
		images.grantReadWriteData(cleanupDeliveredOrderFn);
		galleriesBucket.grantReadWrite(cleanupDeliveredOrderFn);
		envVars['CLEANUP_DELIVERED_ORDER_FN_NAME'] = cleanupDeliveredOrderFn.functionName;
		
		// Update onOrderDeliveredFn environment with cleanup function name
		onOrderDeliveredFn.addEnvironment('CLEANUP_DELIVERED_ORDER_FN_NAME', cleanupDeliveredOrderFn.functionName);
		// Grant onOrderDeliveredFn permission to invoke cleanupDeliveredOrderFn
		cleanupDeliveredOrderFn.grantInvoke(onOrderDeliveredFn);
		
		// Lambda function to process DynamoDB stream events and automatically trigger onOrderDelivered
		// This ensures final ZIP generation happens even if order is marked DELIVERED outside of sendFinalLink/complete
		// Processes stream records and filters for MODIFY events where deliveryStatus changes to DELIVERED
		const orderDeliveredStreamProcessor = new NodejsFunction(this, 'OrderDeliveredStreamProcessor', {
			entry: path.join(__dirname, '../../../backend/functions/orders/onOrderDeliveredStreamProcessor.ts'),
			handler: 'handler',
			runtime: Runtime.NODEJS_20_X,
			memorySize: 256,
			timeout: Duration.minutes(2),
			layers: [awsSdkLayer],
			bundling: {
				externalModules: [
					'aws-sdk',
					'@aws-sdk/client-lambda'
				],
				minify: true,
				treeShaking: true,
				sourceMap: false,
				format: 'cjs',
				mainFields: ['module', 'main'],
				depsLockFilePath: path.join(__dirname, '../../../yarn.lock')
			},
			environment: {
				ON_ORDER_DELIVERED_FN_NAME: onOrderDeliveredFn.functionName
			}
		});
		onOrderDeliveredFn.grantInvoke(orderDeliveredStreamProcessor);
		
		// Connect DynamoDB stream to Lambda function
		// The Lambda function filters for MODIFY events where deliveryStatus changes to DELIVERED
		orderDeliveredStreamProcessor.addEventSource(new DynamoEventSource(orders, {
			startingPosition: StartingPosition.LATEST,
			batchSize: 10,
			maxBatchingWindow: Duration.seconds(5)
		}));
		
		// Lambda function to process order status changes and trigger ZIP generation for selected originals
		// Handles CLIENT_APPROVED and PREPARING_DELIVERY (from CHANGES_REQUESTED) status changes
		// This ensures ZIP generation happens even if status changes outside of approveSelection function
		const orderStatusChangeProcessor = new NodejsFunction(this, 'OrderStatusChangeProcessor', {
			entry: path.join(__dirname, '../../../backend/functions/orders/onOrderStatusChange.ts'),
			handler: 'handler',
			runtime: Runtime.NODEJS_20_X,
			memorySize: 512,
			timeout: Duration.minutes(2),
			layers: [awsSdkLayer],
			bundling: {
				externalModules: [
					'aws-sdk',
					'@aws-sdk/client-dynamodb',
					'@aws-sdk/client-lambda',
					'@aws-sdk/lib-dynamodb'
				],
				minify: true,
				treeShaking: true,
				sourceMap: false,
				format: 'cjs',
				mainFields: ['module', 'main'],
				depsLockFilePath: path.join(__dirname, '../../../yarn.lock')
			},
			environment: {
				DOWNLOADS_ZIP_FN_NAME: zipFn.functionName,
				ORDERS_TABLE: orders.tableName,
				GALLERIES_BUCKET: galleriesBucket.bucketName
			}
		});
		orders.grantReadWriteData(orderStatusChangeProcessor);
		zipFn.grantInvoke(orderStatusChangeProcessor);
		
		// Connect DynamoDB stream to Lambda function
		// The Lambda function filters for MODIFY events where deliveryStatus changes to CLIENT_APPROVED or PREPARING_DELIVERY
		orderStatusChangeProcessor.addEventSource(new DynamoEventSource(orders, {
			startingPosition: StartingPosition.LATEST,
			batchSize: 10,
			maxBatchingWindow: Duration.seconds(5)
		}));
		
		// CloudWatch alarm for ZIP generation failures (DLQ messages)
		const zipDLQAlarm = new Alarm(this, 'ZipGenerationDLQAlarm', {
			alarmName: `PhotoCloud-${props.stage}-ZipGenerationDLQ-Messages`,
			alarmDescription: 'Alert when ZIP generation DLQ has messages (failed ZIP generations)',
			metric: zipGenerationDLQ.metricApproximateNumberOfMessagesVisible({
				statistic: Statistic.SUM,
				period: Duration.minutes(5)
			}),
			threshold: 1,
			evaluationPeriods: 1,
			comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
			treatMissingData: TreatMissingData.NOT_BREACHING
		});

		// Auth Lambda function - handles all authentication endpoints (signup, login, password reset)
		const authFn = new NodejsFunction(this, 'AuthFunction', {
			entry: path.join(__dirname, '../../../backend/functions/auth/index.ts'),
			handler: 'handler',
			runtime: Runtime.NODEJS_20_X,
			memorySize: 256,
			timeout: Duration.seconds(30),
			layers: [awsSdkLayer],
			bundling: {
				externalModules: [
					'aws-sdk',
					'@aws-sdk/client-cloudfront',
					'@aws-sdk/client-cognito-identity-provider',
					'@aws-sdk/client-dynamodb',
					'@aws-sdk/client-lambda',
					'@aws-sdk/client-s3',
					'@aws-sdk/client-scheduler',
					'@aws-sdk/client-ses',
					'@aws-sdk/client-sqs',
					'@aws-sdk/client-ssm',
					'@aws-sdk/lib-dynamodb',
					'@aws-sdk/s3-request-presigner',
					'express'
				],
				minify: true,
				treeShaking: true,
				sourceMap: false,
				format: 'cjs',
				mainFields: ['module', 'main'],
				depsLockFilePath: path.join(__dirname, '../../../yarn.lock')
			},
			environment: envVars
		});

		// Grant permissions to auth Lambda
		emailCodeRateLimit.grantReadWriteData(authFn);
		users.grantReadWriteData(authFn);
		
		// Cognito permissions for auth Lambda
		authFn.addToRolePolicy(new PolicyStatement({
			actions: [
				'cognito-idp:AdminInitiateAuth',
				'cognito-idp:AdminSetUserPassword',
				'cognito-idp:AdminGetUser',
				'cognito-idp:AdminCreateUser',
				'cognito-idp:AdminResendConfirmationCode',
				'cognito-idp:ForgotPassword',
				'cognito-idp:ConfirmForgotPassword',
				'cognito-idp:SignUp',
				'cognito-idp:ResendConfirmationCode',
				'cognito-idp:ConfirmSignUp'
			],
			resources: [userPool.userPoolArn]
		}));

		// SSM Parameter Store permissions for reading configuration
		authFn.addToRolePolicy(new PolicyStatement({
			actions: [
				'ssm:GetParameter',
				'ssm:GetParameters'
			],
			resources: [
				`arn:aws:ssm:${this.region}:${this.account}:parameter${ssmParameterPrefix}/*`
			]
		}));


		// Single API Lambda function - handles all HTTP endpoints via Express router (except auth)
		const apiFn = new NodejsFunction(this, 'ApiFunction', {
			entry: path.join(__dirname, '../../../backend/functions/api/index.ts'),
			handler: 'handler',
			runtime: Runtime.NODEJS_20_X,
			memorySize: 512, // Streaming uses minimal memory (~50-100MB), 512MB is sufficient
			timeout: Duration.minutes(15), // Increased timeout for large ZIP generation (up to 15GB)
			layers: [awsSdkLayer],
			bundling: {
				externalModules: [
					'aws-sdk',
					'@aws-sdk/client-cloudfront',
					'@aws-sdk/client-cloudwatch',
					'@aws-sdk/client-cognito-identity-provider',
					'@aws-sdk/client-dynamodb',
					'@aws-sdk/client-lambda',
					'@aws-sdk/client-s3',
					'@aws-sdk/client-scheduler',
					'@aws-sdk/client-ses',
					'@aws-sdk/client-sqs',
					'@aws-sdk/client-ssm',
					'@aws-sdk/lib-dynamodb',
					'@aws-sdk/s3-request-presigner',
					'express'
				],
				minify: true,
				treeShaking: true,
				sourceMap: false,
				format: 'cjs',
				mainFields: ['module', 'main'],
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
		images.grantReadWriteData(apiFn);
		transactions.grantReadWriteData(apiFn);
		clients.grantReadWriteData(apiFn);
		packages.grantReadWriteData(apiFn);
		notifications.grantReadWriteData(apiFn);
		users.grantReadWriteData(apiFn);
		emailCodeRateLimit.grantReadWriteData(apiFn);

		// S3 bucket
		galleriesBucket.grantReadWrite(apiFn);

		// Cognito permissions removed - auth Lambda handles all Cognito operations

		// SES permissions
		apiFn.addToRolePolicy(new PolicyStatement({
			actions: ['ses:SendEmail', 'ses:SendRawEmail'],
			resources: ['*']
		}));

		// CloudWatch and Lambda permissions for metrics
		apiFn.addToRolePolicy(new PolicyStatement({
			actions: [
				'cloudwatch:GetMetricStatistics',
				'cloudwatch:GetMetricData',
				'lambda:ListFunctions'
			],
			resources: ['*']
		}));

		// SSM Parameter Store permissions for reading configuration
		apiFn.addToRolePolicy(new PolicyStatement({
			actions: [
				'ssm:GetParameter',
				'ssm:GetParameters'
			],
			resources: [
				`arn:aws:ssm:${this.region}:${this.account}:parameter${ssmParameterPrefix}/*`
			]
		}));

		// Lambda invoke permissions (for zip generation functions)
		zipFn.grantInvoke(apiFn);
		onOrderDeliveredFn.grantInvoke(apiFn);

		// Explicit OPTIONS route for CORS preflight - must come before catch-all route
		// API Gateway HTTP API v2's built-in CORS may not work correctly with authorizers,
		// so we handle OPTIONS explicitly to ensure preflight requests succeed
		httpApi.addRoutes({
			path: '/{proxy+}',
			methods: [HttpMethod.OPTIONS],
			integration: new HttpLambdaIntegration('ApiOptionsIntegration', apiFn)
			// No authorizer - OPTIONS requests must be public for CORS to work
		});

		// Auth routes - handled by separate auth Lambda
		// Public auth endpoints (signup, password reset) - no authorizer required
		httpApi.addRoutes({
			path: '/auth/public/{proxy+}',
			methods: [HttpMethod.GET, HttpMethod.POST, HttpMethod.PUT, HttpMethod.PATCH, HttpMethod.DELETE, HttpMethod.OPTIONS],
			integration: new HttpLambdaIntegration('AuthPublicIntegration', authFn)
			// No authorizer - public endpoints
		});
		// User deletion endpoints - handled by API Lambda (require authentication)
		// These routes must be defined BEFORE the /auth/{proxy+} catch-all to take precedence
		// OPTIONS routes for CORS preflight (must be public, no authorizer)
		httpApi.addRoutes({
			path: '/auth/request-deletion',
			methods: [HttpMethod.OPTIONS],
			integration: new HttpLambdaIntegration('UserDeletionRequestOptionsIntegration', apiFn)
			// No authorizer - OPTIONS requests must be public for CORS to work
		});
		httpApi.addRoutes({
			path: '/auth/cancel-deletion',
			methods: [HttpMethod.OPTIONS],
			integration: new HttpLambdaIntegration('UserDeletionCancelOptionsIntegration', apiFn)
			// No authorizer - OPTIONS requests must be public for CORS to work
		});
		httpApi.addRoutes({
			path: '/auth/deletion-status',
			methods: [HttpMethod.OPTIONS],
			integration: new HttpLambdaIntegration('UserDeletionStatusOptionsIntegration', apiFn)
			// No authorizer - OPTIONS requests must be public for CORS to work
		});
		httpApi.addRoutes({
			path: '/auth/undo-deletion/{token}',
			methods: [HttpMethod.OPTIONS],
			integration: new HttpLambdaIntegration('UserDeletionUndoOptionsIntegration', apiFn)
			// No authorizer - OPTIONS requests must be public for CORS to work
		});
		// Actual endpoints with authentication
		httpApi.addRoutes({
			path: '/auth/request-deletion',
			methods: [HttpMethod.POST],
			integration: new HttpLambdaIntegration('UserDeletionRequestIntegration', apiFn),
			authorizer
		});
		httpApi.addRoutes({
			path: '/auth/cancel-deletion',
			methods: [HttpMethod.POST],
			integration: new HttpLambdaIntegration('UserDeletionCancelIntegration', apiFn),
			authorizer
		});
		httpApi.addRoutes({
			path: '/auth/deletion-status',
			methods: [HttpMethod.GET],
			integration: new HttpLambdaIntegration('UserDeletionStatusIntegration', apiFn),
			authorizer
		});
		httpApi.addRoutes({
			path: '/auth/undo-deletion/{token}',
			methods: [HttpMethod.GET],
			integration: new HttpLambdaIntegration('UserDeletionUndoIntegration', apiFn)
			// No authorizer - public endpoint accessed via token
		});
		// Dev endpoints - handled by API Lambda (require authentication)
		// These routes must be defined BEFORE the /auth/{proxy+} catch-all to take precedence
		httpApi.addRoutes({
			path: '/auth/dev/trigger-inactivity-scanner',
			methods: [HttpMethod.OPTIONS],
			integration: new HttpLambdaIntegration('DevTriggerInactivityScannerOptionsIntegration', apiFn)
			// No authorizer - OPTIONS requests must be public for CORS to work
		});
		httpApi.addRoutes({
			path: '/auth/dev/trigger-inactivity-scanner',
			methods: [HttpMethod.POST],
			integration: new HttpLambdaIntegration('DevTriggerInactivityScannerIntegration', apiFn),
			authorizer
		});
		// OPTIONS for protected auth endpoints - must be public for CORS preflight
		httpApi.addRoutes({
			path: '/auth/{proxy+}',
			methods: [HttpMethod.OPTIONS],
			integration: new HttpLambdaIntegration('AuthOptionsIntegration', authFn)
			// No authorizer - OPTIONS requests must be public for CORS to work
		});
		// Protected auth endpoints (change password, business info) - require authorizer
		httpApi.addRoutes({
			path: '/auth/{proxy+}',
			methods: [HttpMethod.GET, HttpMethod.POST, HttpMethod.PUT, HttpMethod.PATCH, HttpMethod.DELETE],
			integration: new HttpLambdaIntegration('AuthIntegration', authFn),
			authorizer // Protected endpoints require authentication
		});
		// Client login endpoint - clients authenticate with gallery password, not Cognito
		httpApi.addRoutes({
			path: '/galleries/{id}/client-login',
			methods: [HttpMethod.POST, HttpMethod.OPTIONS],
			integration: new HttpLambdaIntegration('ApiClientLoginIntegration', apiFn)
			// No authorizer - public endpoint
		});
		// Public gallery info endpoint (login page): non-sensitive fields only
		httpApi.addRoutes({
			path: '/galleries/{id}/public-info',
			methods: [HttpMethod.GET, HttpMethod.OPTIONS],
			integration: new HttpLambdaIntegration('ApiGalleryPublicInfoIntegration', apiFn)
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
			path: '/galleries/{id}/images/{imageKey}/download',
			methods: [HttpMethod.GET, HttpMethod.OPTIONS],
			integration: new HttpLambdaIntegration('ApiGalleryImageDownloadIntegration', apiFn)
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

		// SSM Parameter Store permissions for payment functions
		paymentsCheckoutFn.addToRolePolicy(ssmPolicy);
		paymentsWebhookFn.addToRolePolicy(ssmPolicy);
		paymentsSuccessFn.addToRolePolicy(ssmPolicy);
		paymentsCancelFn.addToRolePolicy(ssmPolicy);
		paymentsCheckStatusFn.addToRolePolicy(ssmPolicy);

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
		const stripeEventRule = new Rule(this, 'StripeEventRule', {
			eventBus: stripePartnerEventBus,
			eventPattern: {
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
		galleriesDeleteHelperFn.addToRolePolicy(ssmPolicy);
		envVars['GALLERIES_DELETE_FN_NAME'] = galleriesDeleteHelperFn.functionName;

		// Remove all individual HTTP Lambda functions - they're now handled by the single API Lambda
		// Keeping only event-triggered and helper functions below

		// Note: DynamoDB Stream handler for TTL deletions has been removed
		// Gallery expiration is now handled by EventBridge Scheduler

		// Expiry reminders schedule - sends warning emails
		// Note: Gallery deletion is handled by EventBridge Scheduler, not DynamoDB TTL
		const expiryFn = new NodejsFunction(this, 'ExpiryCheckFn', {
			entry: path.join(__dirname, '../../../backend/functions/expiry/checkAndNotify.ts'),
			handler: 'handler',
			...defaultFnProps,
			environment: envVars
		});
		galleries.grantReadWriteData(expiryFn);
		expiryFn.addToRolePolicy(new PolicyStatement({
			actions: ['ses:SendEmail', 'ses:SendRawEmail'],
			resources: ['*']
		}));
		// Grant expiry lambda Cognito read permissions for fallback email retrieval
		expiryFn.addToRolePolicy(new PolicyStatement({
			actions: ['cognito-idp:AdminGetUser'],
			resources: [userPool.userPoolArn]
		}));
		expiryFn.addToRolePolicy(ssmPolicy);
		// Run every 6 hours for more frequent expiry checks and warnings
		new Rule(this, 'ExpirySchedule', {
			schedule: Schedule.rate(Duration.hours(6)),
			targets: [new LambdaFunction(expiryFn)]
		});

		// EventBridge Scheduler-based gallery expiration system
		// Deletion Lambda function - invoked by EventBridge Scheduler at exact expiry time
		const galleryExpiryDeletionFn = new NodejsFunction(this, 'GalleryExpiryDeletionFn', {
			entry: path.join(__dirname, '../../../backend/functions/expiry/deleteExpiredGallery.ts'),
			handler: 'handler',
			runtime: Runtime.NODEJS_20_X,
			memorySize: 1024, // Increased memory for faster processing
			timeout: Duration.minutes(15), // Maximum Lambda timeout for very large galleries
			layers: [awsSdkLayer],
			bundling: {
				externalModules: [
					'aws-sdk',
					'@aws-sdk/client-cloudfront',
					'@aws-sdk/client-cognito-identity-provider',
					'@aws-sdk/client-dynamodb',
					'@aws-sdk/client-lambda',
					'@aws-sdk/client-s3',
					'@aws-sdk/client-scheduler',
					'@aws-sdk/client-ses',
					'@aws-sdk/client-sqs',
					'@aws-sdk/client-ssm',
					'@aws-sdk/lib-dynamodb',
					'@aws-sdk/s3-request-presigner',
					'express'
				],
				depsLockFilePath: path.join(__dirname, '../../../yarn.lock'),
				minify: true,
				treeShaking: true,
				sourceMap: false,
				format: 'cjs',
				mainFields: ['module', 'main']
			},
			environment: envVars
		});
		
		// Grant permissions to deletion Lambda
		galleries.grantReadWriteData(galleryExpiryDeletionFn);
		transactions.grantReadWriteData(galleryExpiryDeletionFn);
		orders.grantReadWriteData(galleryExpiryDeletionFn);
		images.grantReadWriteData(galleryExpiryDeletionFn);
		galleriesBucket.grantReadWrite(galleryExpiryDeletionFn);
		galleryExpiryDeletionFn.addToRolePolicy(new PolicyStatement({
			actions: ['ses:SendEmail', 'ses:SendRawEmail'],
			resources: ['*']
		}));
		galleryExpiryDeletionFn.addToRolePolicy(new PolicyStatement({
			actions: ['cognito-idp:AdminGetUser'],
			resources: [userPool.userPoolArn]
		}));
		galleryExpiryDeletionFn.addToRolePolicy(ssmPolicy);
		
		// Dead Letter Queue for failed schedule executions
		const galleryExpiryDLQ = new Queue(this, 'GalleryExpiryDLQ', {
			queueName: `PhotoHub-${props.stage}-GalleryExpiryDLQ`,
			encryption: QueueEncryption.SQS_MANAGED,
			retentionPeriod: Duration.days(14)
		});
		
		// IAM role for EventBridge Scheduler to invoke deletion Lambda
		const schedulerRole = new Role(this, 'GalleryExpirySchedulerRole', {
			assumedBy: new ServicePrincipal('scheduler.amazonaws.com'),
			description: 'Role for EventBridge Scheduler to invoke gallery expiry deletion Lambda'
		});
		galleryExpiryDeletionFn.grantInvoke(schedulerRole);
		
		// Grant Lambda functions permission to create/cancel schedules
		const schedulerPolicy = new PolicyStatement({
			actions: [
				'scheduler:CreateSchedule',
				'scheduler:DeleteSchedule',
				'scheduler:GetSchedule',
				'scheduler:UpdateSchedule'
			],
			resources: [`arn:aws:scheduler:${this.region}:${this.account}:schedule/default/gallery-expiry-*`]
		});
		
		// Grant IAM PassRole permission so Lambda can pass the scheduler role to EventBridge Scheduler
		const passRolePolicy = new PolicyStatement({
			actions: ['iam:PassRole'],
			resources: [schedulerRole.roleArn]
		});
		
		// Grant schedule management permissions to Lambda functions that create schedules
		apiFn.addToRolePolicy(schedulerPolicy);
		apiFn.addToRolePolicy(passRolePolicy);
		expiryFn.addToRolePolicy(schedulerPolicy);
		expiryFn.addToRolePolicy(passRolePolicy);
		
		// Add environment variables for schedule management
		envVars['GALLERY_EXPIRY_DELETION_LAMBDA_ARN'] = galleryExpiryDeletionFn.functionArn;
		envVars['GALLERY_EXPIRY_SCHEDULE_ROLE_ARN'] = schedulerRole.roleArn;
		envVars['GALLERY_EXPIRY_DLQ_ARN'] = galleryExpiryDLQ.queueArn;
		apiFn.addEnvironment('GALLERY_EXPIRY_DELETION_LAMBDA_ARN', galleryExpiryDeletionFn.functionArn);
		apiFn.addEnvironment('GALLERY_EXPIRY_SCHEDULE_ROLE_ARN', schedulerRole.roleArn);
		apiFn.addEnvironment('GALLERY_EXPIRY_DLQ_ARN', galleryExpiryDLQ.queueArn);
		expiryFn.addEnvironment('GALLERY_EXPIRY_DELETION_LAMBDA_ARN', galleryExpiryDeletionFn.functionArn);
		expiryFn.addEnvironment('GALLERY_EXPIRY_SCHEDULE_ROLE_ARN', schedulerRole.roleArn);
		expiryFn.addEnvironment('GALLERY_EXPIRY_DLQ_ARN', galleryExpiryDLQ.queueArn);
		// paymentsWebhookFn also needs these variables (webhook.ts reads them when processing checkout.session.completed)
		paymentsWebhookFn.addEnvironment('GALLERY_EXPIRY_DELETION_LAMBDA_ARN', galleryExpiryDeletionFn.functionArn);
		paymentsWebhookFn.addEnvironment('GALLERY_EXPIRY_SCHEDULE_ROLE_ARN', schedulerRole.roleArn);
		paymentsWebhookFn.addEnvironment('GALLERY_EXPIRY_DLQ_ARN', galleryExpiryDLQ.queueArn);
		
		// CloudWatch alarms for gallery expiry deletion
		const expiryDeletionErrorAlarm = new Alarm(this, 'GalleryExpiryDeletionErrorAlarm', {
			alarmName: `PhotoCloud-${props.stage}-GalleryExpiryDeletion-Errors`,
			alarmDescription: 'Alert when gallery expiry deletion Lambda has errors',
			metric: galleryExpiryDeletionFn.metricErrors({
				statistic: Statistic.SUM,
				period: Duration.minutes(5)
			}),
			threshold: 1,
			comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
			evaluationPeriods: 1,
			treatMissingData: TreatMissingData.NOT_BREACHING
		});
		
		const expiryDLQAlarm = new Alarm(this, 'GalleryExpiryDLQAlarm', {
			alarmName: `PhotoCloud-${props.stage}-GalleryExpiryDLQ-Messages`,
			alarmDescription: 'Alert when gallery expiry DLQ has messages (failed deletions)',
			metric: galleryExpiryDLQ.metricApproximateNumberOfMessagesVisible({
				statistic: Statistic.SUM,
				period: Duration.minutes(5)
			}),
			threshold: 1,
			comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
			evaluationPeriods: 1,
			treatMissingData: TreatMissingData.NOT_BREACHING
		});
		
		// Subscribe alarms to SNS topic if cost alerts topic exists (for production)
		// Note: Cost alerts topic is created later in the stack, so we'll reference it by name
		// For now, alarms are created but not subscribed - can be manually subscribed or added after topic creation

		// User Deletion System
		// Dead Letter Queue for failed user deletion schedule executions
		const userDeletionDLQ = new Queue(this, 'UserDeletionDLQ', {
			queueName: `PhotoHub-${props.stage}-UserDeletionDLQ`,
			encryption: QueueEncryption.SQS_MANAGED,
			retentionPeriod: Duration.days(14), // Retain failed jobs for 14 days for debugging
			visibilityTimeout: Duration.minutes(16) // Slightly longer than Lambda timeout (15 minutes)
		});

		// PerformUserDeletion Lambda - Main Lambda that performs actual user deletion
		const performUserDeletionFn = new NodejsFunction(this, 'PerformUserDeletionFn', {
			entry: path.join(__dirname, '../../../backend/functions/users/performUserDeletion.ts'),
			handler: 'handler',
			runtime: Runtime.NODEJS_20_X,
			memorySize: 1024, // Increased memory for faster processing
			timeout: Duration.minutes(15), // Maximum Lambda timeout for very large user accounts
			deadLetterQueue: userDeletionDLQ,
			layers: [awsSdkLayer],
			bundling: {
				externalModules: [
					'aws-sdk',
					'@aws-sdk/client-cloudfront',
					'@aws-sdk/client-cognito-identity-provider',
					'@aws-sdk/client-dynamodb',
					'@aws-sdk/client-lambda',
					'@aws-sdk/client-s3',
					'@aws-sdk/client-scheduler',
					'@aws-sdk/client-ses',
					'@aws-sdk/client-sqs',
					'@aws-sdk/client-ssm',
					'@aws-sdk/lib-dynamodb',
					'@aws-sdk/s3-request-presigner',
					'express'
				],
				depsLockFilePath: path.join(__dirname, '../../../yarn.lock'),
				minify: true,
				treeShaking: true,
				sourceMap: false,
				format: 'cjs',
				mainFields: ['module', 'main']
			},
			environment: envVars
		});

		// Grant permissions to PerformUserDeletion Lambda
		users.grantReadWriteData(performUserDeletionFn);
		galleries.grantReadWriteData(performUserDeletionFn);
		orders.grantReadWriteData(performUserDeletionFn);
		packages.grantReadWriteData(performUserDeletionFn);
		clients.grantReadWriteData(performUserDeletionFn);
		images.grantReadWriteData(performUserDeletionFn);
		wallet.grantReadWriteData(performUserDeletionFn);
		walletLedger.grantReadWriteData(performUserDeletionFn);
		transactions.grantReadWriteData(performUserDeletionFn);
		galleriesBucket.grantReadWrite(performUserDeletionFn);
		performUserDeletionFn.addToRolePolicy(new PolicyStatement({
			actions: ['ses:SendEmail', 'ses:SendRawEmail'],
			resources: ['*']
		}));
		performUserDeletionFn.addToRolePolicy(new PolicyStatement({
			actions: ['cognito-idp:AdminDeleteUser', 'cognito-idp:AdminGetUser'],
			resources: [userPool.userPoolArn]
		}));
		// Grant EventBridge Scheduler permission to delete schedules
		// User deletion schedules
		performUserDeletionFn.addToRolePolicy(new PolicyStatement({
			actions: ['scheduler:DeleteSchedule'],
			resources: [`arn:aws:scheduler:${this.region}:${this.account}:schedule/default/user-deletion-*`]
		}));
		// Gallery expiry schedules (needed when deleting galleries during user deletion)
		performUserDeletionFn.addToRolePolicy(new PolicyStatement({
			actions: ['scheduler:DeleteSchedule'],
			resources: [`arn:aws:scheduler:${this.region}:${this.account}:schedule/default/gallery-expiry-*`]
		}));
		performUserDeletionFn.addToRolePolicy(ssmPolicy);

		// IAM role for EventBridge Scheduler to invoke PerformUserDeletion Lambda
		const userDeletionSchedulerRole = new Role(this, 'UserDeletionSchedulerRole', {
			assumedBy: new ServicePrincipal('scheduler.amazonaws.com'),
			description: 'Role for EventBridge Scheduler to invoke user deletion Lambda'
		});
		performUserDeletionFn.grantInvoke(userDeletionSchedulerRole);

		// InactivityScanner Lambda - Scans for inactive users and schedules deletions
		const inactivityScannerFn = new NodejsFunction(this, 'InactivityScannerFn', {
			entry: path.join(__dirname, '../../../backend/functions/users/inactivityScanner.ts'),
			handler: 'handler',
			runtime: Runtime.NODEJS_20_X,
			memorySize: 256,
			timeout: Duration.minutes(5),
			layers: [awsSdkLayer],
			bundling: {
				externalModules: [
					'aws-sdk',
					'@aws-sdk/client-dynamodb',
					'@aws-sdk/client-scheduler',
					'@aws-sdk/client-ses',
					'@aws-sdk/client-ssm',
					'@aws-sdk/lib-dynamodb'
				],
				depsLockFilePath: path.join(__dirname, '../../../yarn.lock'),
				minify: true,
				treeShaking: true,
				sourceMap: false,
				format: 'cjs',
				mainFields: ['module', 'main']
			},
			environment: {
				...envVars,
				USER_DELETION_LAMBDA_ARN: performUserDeletionFn.functionArn,
				USER_DELETION_FN_NAME: performUserDeletionFn.functionName,
				USER_DELETION_SCHEDULE_ROLE_ARN: userDeletionSchedulerRole.roleArn,
				USER_DELETION_DLQ_ARN: userDeletionDLQ.queueArn
			}
		});

		// Grant permissions to InactivityScanner Lambda
		users.grantReadWriteData(inactivityScannerFn);
		inactivityScannerFn.addToRolePolicy(new PolicyStatement({
			actions: ['ses:SendEmail', 'ses:SendRawEmail'],
			resources: ['*']
		}));
		// Grant EventBridge Scheduler permissions to create/cancel schedules
		inactivityScannerFn.addToRolePolicy(new PolicyStatement({
			actions: [
				'scheduler:CreateSchedule',
				'scheduler:DeleteSchedule',
				'scheduler:GetSchedule',
				'scheduler:UpdateSchedule'
			],
			resources: [`arn:aws:scheduler:${this.region}:${this.account}:schedule/default/user-deletion-*`]
		}));
		// Grant IAM PassRole permission so Lambda can pass the scheduler role to EventBridge Scheduler
		inactivityScannerFn.addToRolePolicy(new PolicyStatement({
			actions: ['iam:PassRole'],
			resources: [userDeletionSchedulerRole.roleArn]
		}));
		inactivityScannerFn.addToRolePolicy(ssmPolicy);
		envVars['INACTIVITY_SCANNER_FN_NAME'] = inactivityScannerFn.functionName;
		// Update API Lambda environment with inactivity scanner function name (for dev endpoints)
		// This must be done after inactivityScannerFn is created
		// Using addEnvironment() to add the environment variable
		apiFn.addEnvironment('INACTIVITY_SCANNER_FN_NAME', inactivityScannerFn.functionName);

		// EventBridge Rule for InactivityScanner - runs daily at 2 AM UTC
		// Using Schedule.expression() with raw cron string to avoid CDK's automatic weekDay default
		new Rule(this, 'InactivityScannerSchedule', {
			schedule: Schedule.expression('cron(0 2 * * ? *)'), // 2 AM UTC daily (minute hour day month weekDay year)
			targets: [new LambdaFunction(inactivityScannerFn)]
		});

		// PostAuthentication Lambda - Updates lastLoginAt and cancels inactivity deletions
		const postAuthenticationFn = new NodejsFunction(this, 'PostAuthenticationFn', {
			entry: path.join(__dirname, '../../../backend/functions/auth/postAuthentication.ts'),
			handler: 'handler',
			runtime: Runtime.NODEJS_20_X,
			memorySize: 256,
			timeout: Duration.seconds(10),
			layers: [awsSdkLayer],
			bundling: {
				externalModules: [
					'aws-sdk',
					'@aws-sdk/client-dynamodb',
					'@aws-sdk/client-scheduler',
					'@aws-sdk/client-ssm',
					'@aws-sdk/lib-dynamodb'
				],
				depsLockFilePath: path.join(__dirname, '../../../yarn.lock'),
				minify: true,
				treeShaking: true,
				sourceMap: false,
				format: 'cjs',
				mainFields: ['module', 'main']
			},
			environment: envVars
		});

		// Grant permissions to PostAuthentication Lambda
		users.grantReadWriteData(postAuthenticationFn);
		// Grant EventBridge Scheduler permission to cancel schedules
		postAuthenticationFn.addToRolePolicy(new PolicyStatement({
			actions: ['scheduler:DeleteSchedule'],
			resources: [`arn:aws:scheduler:${this.region}:${this.account}:schedule/default/user-deletion-*`]
		}));
		postAuthenticationFn.addToRolePolicy(ssmPolicy);

		// Note: Cognito Lambda trigger permission will be granted automatically when the trigger is configured
		// via AWS Console or CLI. The trigger configuration process grants the necessary permission.
		// We don't create the permission here to avoid circular dependency issues in CDK.
		// 
		// To configure the trigger after deployment:
		// 1. AWS Console: Cognito > User Pools > <Pool> > User pool properties > Lambda triggers > Post authentication
		// 2. AWS CLI: aws cognito-idp update-user-pool --user-pool-id <POOL_ID> --lambda-config PostAuthentication=<LAMBDA_ARN>
		//
		// The Lambda ARN is available in stack outputs: PostAuthenticationLambdaArn

		// Grant API Lambda permission to create/cancel user deletion schedules
		// (API Lambda handles manual deletion requests)
		apiFn.addToRolePolicy(new PolicyStatement({
			actions: [
				'scheduler:CreateSchedule',
				'scheduler:DeleteSchedule',
				'scheduler:GetSchedule',
				'scheduler:UpdateSchedule'
			],
			resources: [`arn:aws:scheduler:${this.region}:${this.account}:schedule/default/user-deletion-*`]
		}));
		apiFn.addToRolePolicy(new PolicyStatement({
			actions: ['iam:PassRole'],
			resources: [userDeletionSchedulerRole.roleArn]
		}));
		// Grant auth Lambda scheduler permissions for dev endpoints (trigger-deletion, etc.)
		// These endpoints are handled by authFn but need to create user deletion schedules
		authFn.addToRolePolicy(new PolicyStatement({
			actions: [
				'scheduler:CreateSchedule',
				'scheduler:DeleteSchedule',
				'scheduler:GetSchedule',
				'scheduler:UpdateSchedule'
			],
			resources: [`arn:aws:scheduler:${this.region}:${this.account}:schedule/default/user-deletion-*`]
		}));
		authFn.addToRolePolicy(new PolicyStatement({
			actions: ['iam:PassRole'],
			resources: [userDeletionSchedulerRole.roleArn]
		}));
		// Grant API Lambda permission to invoke PerformUserDeletion Lambda (for dev endpoints)
		performUserDeletionFn.grantInvoke(apiFn);
		// Update API Lambda environment with user deletion function name (for dev endpoints)
		apiFn.addEnvironment('USER_DELETION_FN_NAME', performUserDeletionFn.functionName);
		apiFn.addEnvironment('USER_DELETION_LAMBDA_ARN', performUserDeletionFn.functionArn);
		apiFn.addEnvironment('USER_DELETION_SCHEDULE_ROLE_ARN', userDeletionSchedulerRole.roleArn);
		apiFn.addEnvironment('USER_DELETION_DLQ_ARN', userDeletionDLQ.queueArn);

		// Create SSM Parameters for user deletion configuration
		// These are read at runtime by Lambda functions
		const userDeletionLambdaArnParam = new StringParameter(this, 'UserDeletionLambdaArnParam', {
			parameterName: `${ssmParameterPrefix}/UserDeletionLambdaArn`,
			stringValue: performUserDeletionFn.functionArn,
			description: 'ARN of PerformUserDeletion Lambda function'
		});

		const userDeletionScheduleRoleArnParam = new StringParameter(this, 'UserDeletionScheduleRoleArnParam', {
			parameterName: `${ssmParameterPrefix}/UserDeletionScheduleRoleArn`,
			stringValue: userDeletionSchedulerRole.roleArn,
			description: 'IAM role ARN for EventBridge Scheduler to invoke user deletion Lambda'
		});

		const userDeletionDlqArnParam = new StringParameter(this, 'UserDeletionDlqArnParam', {
			parameterName: `${ssmParameterPrefix}/UserDeletionDlqArn`,
			stringValue: userDeletionDLQ.queueArn,
			description: 'Dead Letter Queue ARN for failed user deletion schedule executions'
		});

		// Create SSM Parameter for inactivity scanner function name (for dev endpoints)
		// Using SSM instead of environment variable because addEnvironment() isn't working reliably
		const inactivityScannerFnNameParam = new StringParameter(this, 'InactivityScannerFnNameParam', {
			parameterName: `${ssmParameterPrefix}/InactivityScannerFnName`,
			stringValue: inactivityScannerFn.functionName,
			description: 'Function name of InactivityScanner Lambda (for dev endpoints)'
		});

		// CloudWatch alarms for user deletion
		const userDeletionErrorAlarm = new Alarm(this, 'UserDeletionErrorAlarm', {
			alarmName: `PhotoCloud-${props.stage}-UserDeletion-Errors`,
			alarmDescription: 'Alert when user deletion Lambda has errors',
			metric: performUserDeletionFn.metricErrors({
				statistic: Statistic.SUM,
				period: Duration.minutes(5)
			}),
			threshold: 1,
			comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
			evaluationPeriods: 1,
			treatMissingData: TreatMissingData.NOT_BREACHING
		});

		const userDeletionDLQAlarm = new Alarm(this, 'UserDeletionDLQAlarm', {
			alarmName: `PhotoCloud-${props.stage}-UserDeletionDLQ-Messages`,
			alarmDescription: 'Alert when user deletion DLQ has messages (failed deletions)',
			metric: userDeletionDLQ.metricApproximateNumberOfMessagesVisible({
				statistic: Statistic.SUM,
				period: Duration.minutes(5)
			}),
			threshold: 1,
			comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
			evaluationPeriods: 1,
			treatMissingData: TreatMissingData.NOT_BREACHING
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
		transactionExpiryFn.addToRolePolicy(ssmPolicy);
		// Run every 15 minutes to check for expired wallet top-ups
		// Also checks gallery transactions (3 days expiry)
		new Rule(this, 'TransactionExpirySchedule', {
			schedule: Schedule.rate(Duration.minutes(15)),
			targets: [new LambdaFunction(transactionExpiryFn)]
		});

		// ZIP cleanup: No longer needed
		// ZIP files now expire automatically via S3 Expires header set to match gallery expiration
		// This ensures ZIPs are deleted when galleries expire, eliminating the need for scheduled cleanup

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
			layers: [awsSdkLayer],
			bundling: {
				externalModules: [
					'aws-sdk',
					'@aws-sdk/client-cloudfront',
					'@aws-sdk/client-cognito-identity-provider',
					'@aws-sdk/client-dynamodb',
					'@aws-sdk/client-lambda',
					'@aws-sdk/client-s3',
					'@aws-sdk/client-scheduler',
					'@aws-sdk/client-ses',
					'@aws-sdk/client-sqs',
					'@aws-sdk/client-ssm',
					'@aws-sdk/lib-dynamodb',
					'@aws-sdk/s3-request-presigner',
					'express'
				],
				depsLockFilePath: path.join(__dirname, '../../../yarn.lock'),
				minify: true,
				treeShaking: true,
				sourceMap: false,
				format: 'cjs',
				mainFields: ['module', 'main']
			},
			environment: envVars
		});
		galleriesBucket.grantReadWrite(deleteBatchFn);
		// Grant permissions to read/write galleries (for storage usage updates) and orders (for order status updates)
		galleries.grantReadWriteData(deleteBatchFn);
		orders.grantReadWriteData(deleteBatchFn);
		images.grantReadWriteData(deleteBatchFn);
		// Storage recalculation is now on-demand - no need to invoke Lambda after deletes
		
		// Configure Lambda to consume from SQS with batching
		// Batch size: 10 delete operations per invocation (optimal balance: cost vs memory/timeout)
		// Note: maxConcurrency removed temporarily to avoid CloudFormation validation issues
		deleteBatchFn.addEventSource(new SqsEventSource(deleteQueue, {
			batchSize: 10, // Process up to 10 delete operations per Lambda invocation
			maxBatchingWindow: Duration.seconds(5) // Wait up to 5 seconds to batch more operations
		}));
		
		// Grant Lambda permission to consume from queue
		deleteQueue.grantConsumeMessages(deleteBatchFn);
		
		// Store function names and queue URLs in environment
		envVars['DELETE_BATCH_FN_NAME'] = deleteBatchFn.functionName;
		envVars['DELETE_QUEUE_URL'] = deleteQueue.queueUrl;
		
		// Grant API Lambda permission to invoke batch delete Lambda (for deletePhoto, deleteFinalImage, and batch delete endpoints)
		deleteBatchFn.grantInvoke(apiFn);
		
		// Update API Lambda environment with delete-related variables (added after apiFn was created)
		apiFn.addEnvironment('DELETE_BATCH_FN_NAME', deleteBatchFn.functionName);
		apiFn.addEnvironment('DELETE_QUEUE_URL', deleteQueue.queueUrl);
		// Note: INACTIVITY_SCANNER_FN_NAME is added earlier, right after inactivityScannerFn is created
		// Grant API Lambda permission to invoke InactivityScanner Lambda (for dev endpoints)
		inactivityScannerFn.grantInvoke(apiFn);
		
		// CloudFront distribution for previews/* (use OAC for bucket access)
		// S3BucketOrigin.withOriginAccessControl() automatically creates OAC and bucket policy
		// We explicitly add bucket policy as well to ensure it's correctly configured
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
		
		// Create CloudFront distribution with OAC
		// S3BucketOrigin.withOriginAccessControl() automatically creates OAC and sets up bucket policy
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
		
		// Explicitly add bucket policy for CloudFront OAC access to ensure it works correctly
		// This is a backup in case the automatic bucket policy setup from withOriginAccessControl() fails
		// OAC uses CloudFront service principal with distribution ARN condition
		// Note: We add this AFTER distribution creation to ensure we have the distribution ARN
		// The bucket policy format matches AWS documentation for OAC:
		// https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-s3.html
		galleriesBucket.addToResourcePolicy(new PolicyStatement({
			sid: 'AllowCloudFrontOACAccess',
			effect: 'Allow',
			principals: [new ServicePrincipal('cloudfront.amazonaws.com')],
			actions: ['s3:GetObject'],
			resources: [`${galleriesBucket.bucketArn}/*`],
			conditions: {
				StringEquals: {
					'AWS:SourceArn': dist.distributionArn
				}
			}
		}));
		
		// Ensure Lambda functions can still generate presigned URLs
		// Presigned URLs use temporary STS credentials (ASIA...) from the Lambda role
		// When accessed from browsers, S3 validates the signature AND checks bucket policy
		// The bucket policy must allow the Lambda role principal for presigned URLs to work
		// IMPORTANT: Presigned URLs signed with temporary credentials need the role ARN in bucket policy
		// We add this AFTER CloudFront OAC setup to ensure both CloudFront and presigned URLs work
		// Note: Both GetObject (for reading) and PutObject (for uploading) are needed for presigned URLs
		galleriesBucket.addToResourcePolicy(new PolicyStatement({
			sid: 'AllowLambdaPresignedUrls',
			effect: 'Allow',
			principals: [apiFn.role!],
			actions: ['s3:GetObject', 's3:PutObject'],
			resources: [`${galleriesBucket.bucketArn}/*`]
			// No conditions needed - presigned URLs are accessed from browsers/clients
			// The role ARN principal allows temporary credentials from that role to access objects
		}));
		// Add CloudFront domain and distribution ID to env vars after distribution is created
		envVars.CLOUDFRONT_DOMAIN = dist.distributionDomainName;
		envVars.CLOUDFRONT_DISTRIBUTION_ID = dist.distributionId;
		// Update API Lambda environment with CloudFront domain and distribution ID
		apiFn.addEnvironment('CLOUDFRONT_DOMAIN', dist.distributionDomainName);
		apiFn.addEnvironment('CLOUDFRONT_DISTRIBUTION_ID', dist.distributionId);
		
		// Store CloudFront domain in SSM Parameter Store (Lambda functions read from SSM)
		const cloudfrontDomainParam = new StringParameter(this, 'CloudFrontDomainParam', {
			parameterName: `${ssmParameterPrefix}/CloudFrontDomain`,
			stringValue: dist.distributionDomainName,
			description: 'CloudFront distribution domain name for image CDN URLs'
		});
		
		const cloudfrontDistributionIdParam = new StringParameter(this, 'CloudFrontDistributionIdParam', {
			parameterName: `${ssmParameterPrefix}/CloudFrontDistributionId`,
			stringValue: dist.distributionId,
			description: 'CloudFront distribution ID for cache invalidation'
		});

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
		new CfnOutput(this, 'PostAuthenticationLambdaArn', {
			value: postAuthenticationFn.functionArn,
			description: 'ARN of PostAuthentication Lambda - configure this as Post Authentication trigger in Cognito User Pool'
		});
	}
}

