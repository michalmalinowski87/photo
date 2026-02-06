// @ts-nocheck
import { Construct } from 'constructs';
import { Stack, StackProps, CfnOutput, Duration, RemovalPolicy } from 'aws-cdk-lib';
import { Bucket, BlockPublicAccess, HttpMethods, EventType, CfnBucket, ObjectOwnership } from 'aws-cdk-lib/aws-s3';
import { LambdaDestination } from 'aws-cdk-lib/aws-s3-notifications';
import { AttributeType, BillingMode, Table, CfnTable, StreamViewType } from 'aws-cdk-lib/aws-dynamodb';
import { UserPool, UserPoolClient, CfnUserPool } from 'aws-cdk-lib/aws-cognito';
import { HttpApi, CorsHttpMethod, HttpMethod, CfnIntegration, CfnRoute, CfnAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { HttpUserPoolAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import { Runtime, LayerVersion, Code, StartingPosition, CfnFunction } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Rule, Schedule, EventBus } from 'aws-cdk-lib/aws-events';
import { LambdaFunction } from 'aws-cdk-lib/aws-events-targets';
import { Distribution, AllowedMethods, ViewerProtocolPolicy, CachePolicy, PriceClass, CacheCookieBehavior, CacheHeaderBehavior, CacheQueryStringBehavior, ResponseHeadersPolicy, HeadersFrameOption, HeadersReferrerPolicy } from 'aws-cdk-lib/aws-cloudfront';
import { S3BucketOrigin } from 'aws-cdk-lib/aws-cloudfront-origins';
import { Alarm, ComparisonOperator, Metric, Statistic, TreatMissingData } from 'aws-cdk-lib/aws-cloudwatch';
import { SnsAction } from 'aws-cdk-lib/aws-cloudwatch-actions';
import { Topic } from 'aws-cdk-lib/aws-sns';
import { EmailSubscription } from 'aws-cdk-lib/aws-sns-subscriptions';
import { Queue, QueueEncryption } from 'aws-cdk-lib/aws-sqs';
import { Map, StateMachine, Chain } from 'aws-cdk-lib/aws-stepfunctions';
import { LambdaInvoke } from 'aws-cdk-lib/aws-stepfunctions-tasks';
import { SqsEventSource, DynamoEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import { Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { StringParameter, ParameterType, CfnParameter } from 'aws-cdk-lib/aws-ssm';
import * as path from 'path';


interface AppStackProps extends StackProps {
	stage: string;
}

/**
 * Creates a verification code email template matching PixiProof design system
 * Uses the same colors, fonts, and structure as other PixiProof emails
 * The {####} placeholder will be replaced by Cognito with the actual code
 */
function createVerificationCodeEmailTemplate(): string {
	// PixiProof design system colors (matching backend/lib/src/email.ts)
	const COLORS = {
		brand: {
			accent: '#8B6F57', // photographer-accent
			accentLight: '#D2B79A', // photographer-accentLight
		},
		surface: {
			background: '#FFFAF5', // photographer-background
			card: '#FFFFFF', // photographer-surface
			elevated: '#F6EFE7', // photographer-elevated
			border: '#E3D3C4', // photographer-border
		},
		text: {
			heading: '#1E1A17', // photographer-heading
			body: '#2D241F', // photographer-text
			muted: '#5A4D42', // photographer-mutedText
		},
	};

	return `<!DOCTYPE html>
<html lang="pl">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<meta http-equiv="X-UA-Compatible" content="IE=edge">
	<meta name="color-scheme" content="light">
	<meta name="supported-color-schemes" content="light">
	<title>PixiProof</title>
</head>
<body style="margin: 0; padding: 0; font-family: Outfit, Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: ${COLORS.surface.background};">
	<!-- Preheader (hidden) -->
	<div style="display: none; font-size: 1px; line-height: 1px; max-height: 0px; max-width: 0px; opacity: 0; overflow: hidden; mso-hide: all;">
		Powiadomienie od PixiProof.
	</div>
	<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: ${COLORS.surface.background};">
		<tr>
			<td align="center" style="padding: 40px 20px;">
				<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width: 600px; background-color: ${COLORS.surface.card}; border-radius: 16px; box-shadow: 0px 1px 3px 0px rgba(30, 26, 23, 0.10), 0px 1px 2px 0px rgba(30, 26, 23, 0.06); overflow: hidden;">
					<!-- Content -->
					<tr>
						<td style="padding: 32px 40px;">
							<h2 style="margin: 0 0 14px 0; font-size: 22px; font-weight: 800; color: ${COLORS.text.heading}; line-height: 1.25; letter-spacing: -0.02em; font-family: Outfit, Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">Weryfikuj swoje konto</h2>
							<p style="margin: 0 0 16px 0; font-size: 16px; color: ${COLORS.text.body}; line-height: 1.7; font-family: Outfit, Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">Dziękujemy za rejestrację! Aby dokończyć tworzenie konta, wprowadź poniższy kod weryfikacyjny:</p>
							<div style="background-color: ${COLORS.surface.elevated}; border: 2px dashed ${COLORS.brand.accent}; border-radius: 12px; padding: 24px; margin: 32px 0; text-align: center;">
								<p style="margin: 0; font-size: 32px; font-weight: 800; letter-spacing: 8px; color: ${COLORS.brand.accent}; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;">{####}</p>
							</div>
							<p style="margin: 0; font-size: 13px; color: ${COLORS.text.muted}; line-height: 1.6; font-family: Outfit, Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">Ten kod jest ważny przez 15 minut. Jeśli nie rejestrowałeś się w PixiProof, możesz zignorować tę wiadomość.</p>
						</td>
					</tr>
					<!-- Footer -->
					<tr>
						<td style="padding: 22px 40px; border-top: 1px solid ${COLORS.surface.border}; background-color: ${COLORS.surface.background};">
							<p style="margin: 0; font-size: 13px; color: ${COLORS.text.muted}; line-height: 1.6; font-family: Outfit, Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
								Zespół PixiProof<br>
								<small style="color: ${COLORS.text.muted};">Ta wiadomość została wysłana automatycznie. Prosimy nie odpowiadać na ten e-mail.</small>
							</p>
						</td>
					</tr>
				</table>
			</td>
		</tr>
	</table>
</body>
</html>`;
}

/**
 * Creates an invitation email template for AdminCreateUser matching PixiProof design system
 * Uses the same colors, fonts, and structure as other PixiProof emails
 * Placeholders: {username} for username, {####} for temporary password
 */
function createInvitationEmailTemplate(): string {
	// PixiProof design system colors (matching backend/lib/src/email.ts)
	const COLORS = {
		brand: {
			accent: '#8B6F57', // photographer-accent
			accentLight: '#D2B79A', // photographer-accentLight
		},
		surface: {
			background: '#FFFAF5', // photographer-background
			card: '#FFFFFF', // photographer-surface
			elevated: '#F6EFE7', // photographer-elevated
			border: '#E3D3C4', // photographer-border
		},
		text: {
			heading: '#1E1A17', // photographer-heading
			body: '#2D241F', // photographer-text
			muted: '#5A4D42', // photographer-mutedText
		},
	};

	return `<!DOCTYPE html>
<html lang="pl">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<meta http-equiv="X-UA-Compatible" content="IE=edge">
	<meta name="color-scheme" content="light">
	<meta name="supported-color-schemes" content="light">
	<title>PixiProof</title>
</head>
<body style="margin: 0; padding: 0; font-family: Outfit, Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: ${COLORS.surface.background};">
	<!-- Preheader (hidden) -->
	<div style="display: none; font-size: 1px; line-height: 1px; max-height: 0px; max-width: 0px; opacity: 0; overflow: hidden; mso-hide: all;">
		Powiadomienie od PixiProof.
	</div>
	<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: ${COLORS.surface.background};">
		<tr>
			<td align="center" style="padding: 40px 20px;">
				<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width: 600px; background-color: ${COLORS.surface.card}; border-radius: 16px; box-shadow: 0px 1px 3px 0px rgba(30, 26, 23, 0.10), 0px 1px 2px 0px rgba(30, 26, 23, 0.06); overflow: hidden;">
					<!-- Content -->
					<tr>
						<td style="padding: 32px 40px;">
							<h2 style="margin: 0 0 14px 0; font-size: 22px; font-weight: 800; color: ${COLORS.text.heading}; line-height: 1.25; letter-spacing: -0.02em; font-family: Outfit, Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">Witaj w PixiProof!</h2>
							<p style="margin: 0 0 16px 0; font-size: 16px; color: ${COLORS.text.body}; line-height: 1.7; font-family: Outfit, Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">Twoje konto zostało utworzone. Poniżej znajdziesz dane potrzebne do pierwszego logowania:</p>
							<div style="background-color: ${COLORS.surface.elevated}; border: 1px solid ${COLORS.surface.border}; border-radius: 12px; padding: 20px; margin: 24px 0;">
								<p style="margin: 0 0 12px 0; font-size: 14px; color: ${COLORS.text.muted}; font-weight: 800; font-family: Outfit, Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">Nazwa użytkownika:</p>
								<p style="margin: 0 0 20px 0; font-size: 16px; color: ${COLORS.text.heading}; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;">{username}</p>
								<p style="margin: 0 0 12px 0; font-size: 14px; color: ${COLORS.text.muted}; font-weight: 800; font-family: Outfit, Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">Tymczasowe hasło:</p>
								<div style="background-color: ${COLORS.surface.card}; border: 2px dashed ${COLORS.brand.accent}; border-radius: 8px; padding: 16px; text-align: center; margin-top: 8px;">
									<p style="margin: 0; font-size: 20px; font-weight: 800; letter-spacing: 2px; color: ${COLORS.brand.accent}; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;">{####}</p>
								</div>
							</div>
							<p style="margin: 0 0 16px 0; font-size: 16px; color: ${COLORS.text.body}; line-height: 1.7; font-family: Outfit, Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">Zaloguj się używając powyższych danych. Po pierwszym logowaniu zostaniesz poproszony o zmianę hasła.</p>
							<p style="margin: 0; font-size: 13px; color: ${COLORS.text.muted}; line-height: 1.6; font-family: Outfit, Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">Jeśli nie spodziewałeś się tej wiadomości, możesz ją zignorować.</p>
						</td>
					</tr>
					<!-- Footer -->
					<tr>
						<td style="padding: 22px 40px; border-top: 1px solid ${COLORS.surface.border}; background-color: ${COLORS.surface.background};">
							<p style="margin: 0; font-size: 13px; color: ${COLORS.text.muted}; line-height: 1.6; font-family: Outfit, Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
								Zespół PixiProof<br>
								<small style="color: ${COLORS.text.muted};">Ta wiadomość została wysłana automatycznie. Prosimy nie odpowiadać na ten e-mail.</small>
							</p>
						</td>
					</tr>
				</table>
			</td>
		</tr>
	</table>
</body>
</html>`;
}

export class AppStack extends Stack {
	constructor(scope: Construct, id: string, props: AppStackProps) {
		super(scope, id, props);

		function requireEnv(name: string): string {
			const value = process.env[name];
			if (!value || value.trim() === '') {
				throw new Error(
					`Missing required environment variable: ${name}. ` +
						`This is required to deploy the CDK stack because it is written into SSM Parameter Store.`
				);
			}
			return value.trim();
		}

		// Helper function to generate environment-prefixed resource names
		// Format: {stage}-{resourceName} (e.g., dev-apiLambda, prod-apiLambda)
		const prefixName = (resourceName: string): string => {
			return `${props.stage}-${resourceName}`;
		};

		const galleriesBucket = new Bucket(this, 'GalleriesBucket', {
			bucketName: prefixName('galleries-bucket'),
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
			tableName: prefixName('galleries'),
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
		// Removed state-createdAt-index: expiry uses Scan with FilterExpression to reduce GSI cost

		// Note: TTL was previously enabled for gallery expiration, but is no longer used
		// Gallery expiration is now handled by EventBridge Scheduler for precise timing

		const payments = new Table(this, 'PaymentsTable', {
			tableName: prefixName('payments'),
			partitionKey: { name: 'paymentId', type: AttributeType.STRING },
			billingMode: BillingMode.PAY_PER_REQUEST,
			removalPolicy: RemovalPolicy.RETAIN
		});

		const wallet = new Table(this, 'WalletsTable', {
			tableName: prefixName('wallets'),
			partitionKey: { name: 'userId', type: AttributeType.STRING },
			billingMode: BillingMode.PAY_PER_REQUEST,
			removalPolicy: RemovalPolicy.RETAIN
		});

		const walletLedger = new Table(this, 'WalletLedgerTable', {
			tableName: prefixName('wallet-ledger'),
			partitionKey: { name: 'userId', type: AttributeType.STRING },
			sortKey: { name: 'txnId', type: AttributeType.STRING },
			billingMode: BillingMode.PAY_PER_REQUEST,
			removalPolicy: RemovalPolicy.RETAIN
		});
	const orders = new Table(this, 'OrdersTable', {
		tableName: prefixName('orders'),
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
		tableName: prefixName('transactions'),
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
	// Removed status-createdAt-index: expiry uses Scan with FilterExpression to reduce GSI cost

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
		tableName: prefixName('clients'),
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
		tableName: prefixName('packages'),
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
		tableName: prefixName('notifications'),
		partitionKey: { name: 'userId', type: AttributeType.STRING },
		sortKey: { name: 'notificationId', type: AttributeType.STRING },
		billingMode: BillingMode.PAY_PER_REQUEST,
		removalPolicy: RemovalPolicy.RETAIN
	});

	const users = new Table(this, 'UsersTable', {
		tableName: prefixName('users'),
		partitionKey: { name: 'userId', type: AttributeType.STRING },
		billingMode: BillingMode.PAY_PER_REQUEST,
		removalPolicy: RemovalPolicy.RETAIN
	});
	// GSI to look up userId by referral code (one-to-one; used at signup and checkout)
	users.addGlobalSecondaryIndex({
		indexName: 'referralCode-index',
		partitionKey: { name: 'referralCode', type: AttributeType.STRING }
	});

	// Reserved subdomains registry (enforces uniqueness for photographer tenant subdomains).
	// Partition key is the subdomain itself (lowercased).
	const subdomains = new Table(this, 'SubdomainsTable', {
		tableName: prefixName('subdomains'),
		partitionKey: { name: 'subdomain', type: AttributeType.STRING },
		billingMode: BillingMode.PAY_PER_REQUEST,
		removalPolicy: RemovalPolicy.RETAIN
	});

	const emailCodeRateLimit = new Table(this, 'EmailCodeRateLimitTable', {
		tableName: prefixName('email-code-rate-limit'),
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

	const referralCodeValidation = new Table(this, 'ReferralCodeValidationTable', {
		tableName: prefixName('referral-code-validation'),
		partitionKey: { name: 'clientId', type: AttributeType.STRING },
		billingMode: BillingMode.PAY_PER_REQUEST,
		removalPolicy: RemovalPolicy.RETAIN
	});
	// Enable TTL on the referral code validation table to automatically clean up shadow-banned clients (by IP)
	const referralCodeValidationCfnTable = referralCodeValidation.node.defaultChild as CfnTable;
	referralCodeValidationCfnTable.timeToLiveSpecification = {
		enabled: true,
		attributeName: 'ttl'
	};

	const images = new Table(this, 'ImagesTable', {
		tableName: prefixName('images'),
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
			userPoolName: prefixName('photographers-user-pool'),
			selfSignUpEnabled: true,
			signInAliases: { email: true },
			autoVerify: { email: true }, // REQUIRED: AutoVerifiedAttributes must include email for ResendConfirmationCode to work
			// According to AWS docs: "Amazon Cognito sends confirmation codes to the user attribute 
			// in the AutoVerifiedAttributes property of your user pool"
			// This doesn't auto-verify the email - it tells Cognito to send verification codes TO the email
		// Customize email verification templates (for signup) - styled HTML email matching PixiProof design system
		userVerificationEmailSubject: 'Zweryfikuj swoje konto PixiProof',
		userVerificationEmailBody: createVerificationCodeEmailTemplate()
		});
		
		// Customize email templates using CfnUserPool for full control
		// Cognito uses VerificationMessageTemplate for code-based verification (both signup and password reset)
		const cfnUserPool = userPool.node.defaultChild as CfnUserPool;
		// Explicitly set AutoVerifiedAttributes to ensure ResendConfirmationCode works
		// This is critical - without this, ResendConfirmationCode will fail with "Auto verification not turned on"
		cfnUserPool.addPropertyOverride('AutoVerifiedAttributes', ['email']);
		
		// Override verification email template - this affects both signup verification and password reset
		// Styled HTML email template matching PixiProof design system
		cfnUserPool.addPropertyOverride('VerificationMessageTemplate.EmailSubject', 'Zweryfikuj swoje konto PixiProof');
		cfnUserPool.addPropertyOverride('VerificationMessageTemplate.EmailMessage', createVerificationCodeEmailTemplate());
		
		// Override invitation email template (for AdminCreateUser)
		// This is sent when admins create users - includes temporary password
		cfnUserPool.addPropertyOverride('AdminCreateUserConfig.InviteMessageTemplate.EmailSubject', 'Witaj w PixiProof');
		cfnUserPool.addPropertyOverride('AdminCreateUserConfig.InviteMessageTemplate.EmailMessage', createInvitationEmailTemplate());
		
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
			userPoolClientName: prefixName('photographers-user-pool-client'),
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
				domainPrefix: `pixiproof-${props.stage}`
			}
		});

		const httpApi = new HttpApi(this, 'Api', {
			apiName: prefixName('api'),
			corsPreflight: {
				allowHeaders: ['*'],
				allowMethods: [CorsHttpMethod.ANY],
				allowOrigins: ['*']
			}
		});

		// Create authorizer using CfnAuthorizer so we can reference it in CfnRoute
		// This allows us to use CfnRoute for all routes (avoiding auto-permissions)
		const authorizerResource = new CfnAuthorizer(this, 'CognitoAuthorizer', {
			apiId: httpApi.apiId,
			authorizerType: 'JWT',
			identitySource: ['$request.header.Authorization'],
			name: 'CognitoAuthorizer',
			jwtConfiguration: {
				audience: [userPoolClient.userPoolClientId],
				issuer: `https://cognito-idp.${this.region}.amazonaws.com/${userPool.userPoolId}`
			}
		});
		
		// Keep HttpUserPoolAuthorizer for backward compatibility (not used directly)
		const authorizer = new HttpUserPoolAuthorizer('CognitoAuthorizerLegacy', userPool, {
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
			layerVersionName: `PixiProof-${props.stage}-aws-sdk-layer`
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

		// Validate env vars that are written into SSM Parameter Store
		const stripeKeyFromEnv = requireEnv('STRIPE_SECRET_KEY');
		console.log('✓ STRIPE_SECRET_KEY is available at CDK synthesis time (length:', stripeKeyFromEnv.length, 'chars)');
		const stripeWebhookSecretFromEnv = requireEnv('STRIPE_WEBHOOK_SECRET');
		const senderEmailFromEnv = requireEnv('SENDER_EMAIL');
		const publicApiUrlFromEnv = requireEnv('PUBLIC_API_URL');
		const publicGalleryUrlFromEnv = requireEnv('PUBLIC_GALLERY_URL');
		const publicDashboardUrlFromEnv = requireEnv('PUBLIC_DASHBOARD_URL');
		const publicLandingUrlFromEnv = requireEnv('PUBLIC_LANDING_URL');

		// Create SSM parameters for configurable values (can be changed without redeploying)
		// These parameters are read at runtime by Lambda functions
		const ssmParameterPrefix = `/PixiProof/${props.stage}`;
		
		// JWT Secret - SecureString for encryption
		// Note: Using StringParameter without type property - CDK will create as String type
		// For SecureString, parameters should be created manually or migrated to Secrets Manager
		const jwtSecretParam = new StringParameter(this, 'JwtSecretParam', {
			parameterName: `${ssmParameterPrefix}/JwtSecret`,
			stringValue: jwtSecret,
			description: 'JWT secret for client gallery authentication'
		});

		// Client gallery password encryption secret (used to encrypt `clientPasswordEncryptionSecret` in DynamoDB).
		// NOTE: This parameter must be created manually as SecureString (CDK cannot create SecureString parameters).
		// Run: ./scripts/migrate-secrets-to-secure-string.sh <stage>
		// Or manually: aws ssm put-parameter --name "/PixiProof/{stage}/GalleryPasswordEncryptionSecret" --type "SecureString" --value "<secret>"
		// Lambda functions use kms:Decrypt via SSM with WithDecryption=true (see kmsDecryptPolicy and ssm-config.ts).
		// The parameter is referenced but not created by CDK (similar to CloudFrontPrivateKey).

		// Stripe configuration - stored as SecureString in SSM (encrypted at rest).
		// NOTE: These parameters must be created manually as SecureString (CDK cannot create SecureString parameters).
		// Run: ./scripts/migrate-secrets-to-secure-string.sh <stage>
		// Or manually:
		//   aws ssm put-parameter --name "/PixiProof/{stage}/StripeSecretKey" --type "SecureString" --value "<key>"
		//   aws ssm put-parameter --name "/PixiProof/{stage}/StripeWebhookSecret" --type "SecureString" --value "<secret>"
		// The parameters are referenced but not created by CDK (similar to CloudFrontPrivateKey).

		// Stripe payment methods configuration
		// Default payment methods: card, blik, p24, paypal
		// Note: apple_pay and google_pay are not valid payment method types for Stripe Checkout
		// They are automatically available when using 'card' if the customer's browser supports them
		// Can be customized per environment via SSM Parameter Store
		const defaultPaymentMethods = JSON.stringify(['card', 'blik', 'p24', 'paypal']);
		const stripePaymentMethodsParam = new StringParameter(this, 'StripePaymentMethodsParam', {
			parameterName: `${ssmParameterPrefix}/StripePaymentMethods`,
			stringValue: defaultPaymentMethods,
			description: 'JSON array of enabled Stripe payment methods (e.g., ["card","blik","p24","paypal"])'
		});

		// Email configuration
		const senderEmailParam = new StringParameter(this, 'SenderEmailParam', {
			parameterName: `${ssmParameterPrefix}/SenderEmail`,
			stringValue: senderEmailFromEnv,
			description: 'SES verified sender email address'
		});

		// Public URLs configuration
		const publicApiUrlParam = new StringParameter(this, 'PublicApiUrlParam', {
			parameterName: `${ssmParameterPrefix}/PublicApiUrl`,
			stringValue: publicApiUrlFromEnv,
			description: 'Public API Gateway URL'
		});

		const publicGalleryUrlParam = new StringParameter(this, 'PublicGalleryUrlParam', {
			parameterName: `${ssmParameterPrefix}/PublicGalleryUrl`,
			stringValue: publicGalleryUrlFromEnv,
			description: 'Public gallery frontend URL'
		});

		const publicDashboardUrlParam = new StringParameter(this, 'PublicDashboardUrlParam', {
			parameterName: `${ssmParameterPrefix}/PublicDashboardUrl`,
			stringValue: publicDashboardUrlFromEnv,
			description: 'Public dashboard frontend URL'
		});

		const publicLandingUrlParam = new StringParameter(this, 'PublicLandingUrlParam', {
			parameterName: `${ssmParameterPrefix}/PublicLandingUrl`,
			stringValue: publicLandingUrlFromEnv,
			description: 'Public landing (website) URL'
		});

		// CORS Origins configuration
		const corsOriginsParam = new StringParameter(this, 'CorsOriginsParam', {
			parameterName: `${ssmParameterPrefix}/CorsOrigins`,
			stringValue: corsOrigins.join(','),
			description: 'Comma-separated list of allowed CORS origins'
		});

		// Company and legal document configuration (for legal pages and PDFs)
		const companyNameParam = new StringParameter(this, 'CompanyNameParam', {
			parameterName: `${ssmParameterPrefix}/CompanyName`,
			stringValue: process.env.COMPANY_NAME ?? 'TBA',
			description: 'Company name for legal documents'
		});
		const companyTaxIdParam = new StringParameter(this, 'CompanyTaxIdParam', {
			parameterName: `${ssmParameterPrefix}/CompanyTaxId`,
			stringValue: process.env.COMPANY_TAX_ID ?? 'TBA',
			description: 'Company tax ID (NIP) for legal documents'
		});
		const companyAddressParam = new StringParameter(this, 'CompanyAddressParam', {
			parameterName: `${ssmParameterPrefix}/CompanyAddress`,
			stringValue: process.env.COMPANY_ADDRESS ?? 'TBA',
			description: 'Company address for legal documents'
		});
		const companyEmailParam = new StringParameter(this, 'CompanyEmailParam', {
			parameterName: `${ssmParameterPrefix}/CompanyEmail`,
			stringValue: process.env.COMPANY_EMAIL ?? 'TBA',
			description: 'Company contact email for legal documents'
		});
		const legalDocumentPublicationDateParam = new StringParameter(this, 'LegalDocumentPublicationDateParam', {
			parameterName: `${ssmParameterPrefix}/LegalDocumentPublicationDate`,
			stringValue: process.env.LEGAL_DOCUMENT_PUBLICATION_DATE ?? '02.02.2026',
			description: 'Legal document publication date (e.g. 02.02.2026)'
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

		// KMS policy for decrypting SecureString parameters (e.g., CloudFrontPrivateKey)
		// AWS SSM uses the default AWS managed key (alias/aws/ssm) for SecureString parameters
		// This policy allows Lambda functions to decrypt SecureString parameters via SSM
		const kmsDecryptPolicy = new PolicyStatement({
			actions: [
				'kms:Decrypt'
			],
			resources: [
				`arn:aws:kms:${this.region}:${this.account}:key/*`
			],
			conditions: {
				StringEquals: {
					'kms:ViaService': `ssm.${this.region}.amazonaws.com`
				}
			}
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
			SUBDOMAINS_TABLE: subdomains.tableName,
			EMAIL_CODE_RATE_LIMIT_TABLE: emailCodeRateLimit.tableName,
			REFERRAL_CODE_VALIDATION_TABLE: referralCodeValidation.tableName,
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
			queueName: `PixiProof-${props.stage}-ZipGenerationDLQ`,
			encryption: QueueEncryption.SQS_MANAGED,
			retentionPeriod: Duration.days(14), // Retain failed jobs for 14 days for debugging
			visibilityTimeout: Duration.minutes(16) // Slightly longer than Lambda timeout
		});
		
		const zipFn = new NodejsFunction(this, 'DownloadsZipFn', {
			functionName: prefixName('downloadsZip'),
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
		zipFn.addToRolePolicy(kmsDecryptPolicy);

		// ZIP Chunk Worker - copies raw files to temp prefix, invoked by Step Functions Map
		const zipChunkWorkerFn = new NodejsFunction(this, 'ZipChunkWorkerFn', {
			functionName: prefixName('zipChunkWorker'),
			entry: path.join(__dirname, '../../../backend/functions/downloads/zipChunkWorker.ts'),
			handler: 'handler',
			runtime: Runtime.NODEJS_20_X,
			memorySize: 1024,
			timeout: Duration.minutes(15),
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
				GALLERIES_BUCKET: galleriesBucket.bucketName
			}
		});
		galleriesBucket.grantReadWrite(zipChunkWorkerFn);

		// ZIP Merge - streams raw files from temp prefix into final ZIP, invoked after Map completes
		// 3008 MB: max allowed in many accounts - ~3x CPU vs 1024 MB for (de)compression/parse
		// Note: ARM64 reverted - CloudWatch Lambda agent extension is x86-only, causes Extension.Crash
		const zipMergeFn = new NodejsFunction(this, 'ZipMergeFn', {
			functionName: prefixName('zipMerge'),
			entry: path.join(__dirname, '../../../backend/functions/downloads/zipMerge.ts'),
			handler: 'handler',
			runtime: Runtime.NODEJS_20_X,
			memorySize: 3008,
			timeout: Duration.minutes(15),
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
				GALLERIES_BUCKET: galleriesBucket.bucketName,
				ORDERS_TABLE: orders.tableName,
				GALLERIES_TABLE: galleries.tableName
			}
		});
		galleriesBucket.grantReadWrite(zipMergeFn);
		orders.grantReadWriteData(zipMergeFn);
		galleries.grantReadData(zipMergeFn);

		// Step Function: Map (parallel chunk workers) -> Merge
		// ItemSelector merges parent state with current item so Lambda gets full context
		const workerTask = new LambdaInvoke(this, 'ZipChunkWorkerTask', {
			lambdaFunction: zipChunkWorkerFn,
			payload: {
				'galleryId.$': '$.galleryId',
				'orderId.$': '$.orderId',
				'type.$': '$.type',
				'runId.$': '$.runId',
				'workerCount.$': '$.workerCount',
				'chunkIndex.$': '$.chunkIndex',
				'keys.$': '$.keys'
			},
			resultSelector: {
				'chunkIndex.$': '$.Payload.chunkIndex',
				'filesAdded.$': '$.Payload.filesAdded',
				'durationMs.$': '$.Payload.durationMs'
			}
		});
		const zipMapState = new Map(this, 'ZipChunkMap', {
			itemsPath: '$.chunkItems',
			maxConcurrency: 4, // Avoid Lambda 429; many accounts have low burst limits
			resultPath: '$.chunkResults',
			itemSelector: {
				'galleryId.$': '$.galleryId',
				'orderId.$': '$.orderId',
				'type.$': '$.type',
				'runId.$': '$.runId',
				'workerCount.$': '$.workerCount',
				'chunkIndex.$': '$$.Map.Item.Value.chunkIndex',
				'keys.$': '$$.Map.Item.Value.keys'
			}
		});
		zipMapState.iterator(workerTask);
		const mergeTask = new LambdaInvoke(this, 'ZipMergeTask', {
			lambdaFunction: zipMergeFn,
			payload: {
				'galleryId.$': '$.galleryId',
				'orderId.$': '$.orderId',
				'type.$': '$.type',
				'runId.$': '$.runId',
				'workerCount.$': '$.workerCount',
				'finalFilesHash.$': '$.finalFilesHash',
				'selectedKeysHash.$': '$.selectedKeysHash',
				'chunkResults.$': '$.chunkResults'
			}
		});
		const zipStateMachine = new StateMachine(this, 'ZipChunkedStateMachine', {
			stateMachineName: prefixName('zipChunkedStateMachine'),
			definition: zipMapState.next(mergeTask)
		});

		// ZIP Router - dispatches to single createZip or chunked Step Function
		const zipRouterFn = new NodejsFunction(this, 'ZipRouterFn', {
			functionName: prefixName('zipRouter'),
			entry: path.join(__dirname, '../../../backend/functions/downloads/zipRouter.ts'),
			handler: 'handler',
			runtime: Runtime.NODEJS_20_X,
			memorySize: 256, // Optimized from 512MB - 22% utilization (111MB used), sufficient for routing logic
			timeout: Duration.minutes(2),
			layers: [awsSdkLayer],
			bundling: {
				externalModules: [
					'aws-sdk',
					'@aws-sdk/client-dynamodb',
					'@aws-sdk/client-lambda',
					'@aws-sdk/client-sfn',
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
				CREATE_ZIP_FN_NAME: zipFn.functionName,
				ZIP_STEP_FUNCTION_ARN: zipStateMachine.stateMachineArn,
				ZIP_CHUNK_THRESHOLD: '100',
				IMAGES_TABLE: images.tableName,
				GALLERIES_BUCKET: galleriesBucket.bucketName
			}
		});
		zipFn.grantInvoke(zipRouterFn);
		zipStateMachine.grantStartExecution(zipRouterFn);
		images.grantReadData(zipRouterFn);
		zipRouterFn.addToRolePolicy(new PolicyStatement({
			actions: ['dynamodb:Query'],
			resources: [images.tableArn, `${images.tableArn}/index/*`]
		}));

		envVars['DOWNLOADS_ZIP_FN_NAME'] = zipRouterFn.functionName;

		// Lambda function to handle order delivery (pre-generate finals ZIP and trigger cleanup)
		const onOrderDeliveredFn = new NodejsFunction(this, 'OnOrderDeliveredFn', {
			functionName: prefixName('onOrderDelivered'),
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
				DOWNLOADS_ZIP_FN_NAME: zipRouterFn.functionName,
				CLEANUP_DELIVERED_ORDER_FN_NAME: '' // Will be set after cleanup function is created
			}
		});
		orders.grantReadWriteData(onOrderDeliveredFn);
		images.grantReadData(onOrderDeliveredFn);
		galleriesBucket.grantRead(onOrderDeliveredFn);
		zipRouterFn.grantInvoke(onOrderDeliveredFn);
		envVars['ON_ORDER_DELIVERED_FN_NAME'] = onOrderDeliveredFn.functionName;
		
		// Lambda function to cleanup originals/finals after order is delivered
		const cleanupDeliveredOrderFn = new NodejsFunction(this, 'CleanupDeliveredOrderFn', {
			functionName: prefixName('cleanupDeliveredOrder'),
			entry: path.join(__dirname, '../../../backend/functions/orders/cleanupDeliveredOrder.ts'),
			handler: 'handler',
			runtime: Runtime.NODEJS_20_X,
			memorySize: 256, // Optimized from 512MB - 18% utilization (93MB used), sufficient for S3 batch deletes
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
			functionName: prefixName('orderDeliveredStreamProcessor'),
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
			functionName: prefixName('orderStatusChangeProcessor'),
			entry: path.join(__dirname, '../../../backend/functions/orders/onOrderStatusChange.ts'),
			handler: 'handler',
			runtime: Runtime.NODEJS_20_X,
			memorySize: 256, // Optimized from 512MB - 17% utilization (88MB used), sufficient for DynamoDB operations
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
				DOWNLOADS_ZIP_FN_NAME: zipRouterFn.functionName,
				ORDERS_TABLE: orders.tableName,
				GALLERIES_BUCKET: galleriesBucket.bucketName
			}
		});
		orders.grantReadWriteData(orderStatusChangeProcessor);
		zipRouterFn.grantInvoke(orderStatusChangeProcessor);
		
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

		// CloudWatch alarm for Step Function ZIP chunked flow failures
		const zipStepFnAlarm = new Alarm(this, 'ZipStepFunctionFailedAlarm', {
			alarmName: `PhotoCloud-${props.stage}-ZipStepFunction-Failed`,
			alarmDescription: 'Alert when ZIP chunked Step Function executions fail',
			metric: new Metric({
				namespace: 'AWS/States',
				metricName: 'ExecutionsFailed',
				dimensionsMap: { StateMachineArn: zipStateMachine.stateMachineArn },
				statistic: Statistic.SUM,
				period: Duration.minutes(5)
			}),
			threshold: 1,
			evaluationPeriods: 1,
			comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
			treatMissingData: TreatMissingData.NOT_BREACHING
		});

		// CloudWatch alarm for ZipMerge Lambda errors
		const zipMergeAlarm = new Alarm(this, 'ZipMergeErrorsAlarm', {
			alarmName: `PhotoCloud-${props.stage}-ZipMerge-Errors`,
			alarmDescription: 'Alert when ZipMerge Lambda reports errors',
			metric: zipMergeFn.metricErrors({
				statistic: Statistic.SUM,
				period: Duration.minutes(5)
			}),
			threshold: 1,
			evaluationPeriods: 1,
			comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
			treatMissingData: TreatMissingData.NOT_BREACHING
		});

		// ZIP Chunked Failure Handler - triggered by EventBridge when Step Function fails
		// Clears generating flags and sets error state so UI shows failure + retry
		const zipChunkedFailureHandlerFn = new NodejsFunction(this, 'ZipChunkedFailureHandlerFn', {
			functionName: prefixName('zipChunkedFailureHandler'),
			entry: path.join(__dirname, '../../../backend/functions/downloads/zipChunkedFailureHandler.ts'),
			handler: 'handler',
			runtime: Runtime.NODEJS_20_X,
			memorySize: 256,
			timeout: Duration.seconds(30),
			layers: [awsSdkLayer],
			bundling: {
				externalModules: [
					'aws-sdk',
					'@aws-sdk/client-dynamodb',
					'@aws-sdk/client-s3',
					'@aws-sdk/client-sfn',
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
				ORDERS_TABLE: orders.tableName,
				GALLERIES_BUCKET: galleriesBucket.bucketName,
				ZIP_STEP_FUNCTION_ARN: zipStateMachine.stateMachineArn
			}
		});
		orders.grantReadWriteData(zipChunkedFailureHandlerFn);
		galleriesBucket.grantReadWrite(zipChunkedFailureHandlerFn);
		zipChunkedFailureHandlerFn.addToRolePolicy(new PolicyStatement({
			actions: ['states:DescribeExecution'],
			resources: [`${zipStateMachine.stateMachineArn.replace(':stateMachine:', ':execution:')}:*`]
		}));

		// EventBridge rule: Step Function execution failed -> invoke failure handler
		// DLQ captures events when Lambda fails after retries - alerts on silent failures
		const zipFailureHandlerDLQ = new Queue(this, 'ZipFailureHandlerDLQ', {
			queueName: `PixiProof-${props.stage}-ZipFailureHandlerDLQ`,
			encryption: QueueEncryption.SQS_MANAGED,
			retentionPeriod: Duration.days(14),
			visibilityTimeout: Duration.minutes(1)
		});
		const zipStepFnFailedRule = new Rule(this, 'ZipStepFunctionFailedRule', {
			eventPattern: {
				source: ['aws.states'],
				'detail-type': ['Step Functions Execution Status Change'],
				detail: {
					status: ['FAILED'],
					stateMachineArn: [zipStateMachine.stateMachineArn]
				}
			},
			description: 'Trigger ZIP failure handler when chunked Step Function fails'
		});
		zipStepFnFailedRule.addTarget(new LambdaFunction(zipChunkedFailureHandlerFn, {
			deadLetterQueue: zipFailureHandlerDLQ,
			retryAttempts: 3,
			maxEventAge: Duration.hours(2)
		}));

		// CloudWatch alarm for failure handler DLQ - events failed to reach Lambda or Lambda failed after retries
		new Alarm(this, 'ZipFailureHandlerDLQAlarm', {
			alarmName: `PhotoCloud-${props.stage}-ZipFailureHandler-DLQ`,
			alarmDescription: 'Alert when ZIP failure handler DLQ has messages (chunked failure not reported to UI)',
			metric: zipFailureHandlerDLQ.metricApproximateNumberOfMessagesVisible({
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
			functionName: prefixName('authLambda'),
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
		referralCodeValidation.grantReadWriteData(authFn);
		users.grantReadWriteData(authFn);
		subdomains.grantReadWriteData(authFn);
		// Galleries + Orders for dev triggerUserDeletion (update delivered galleries expiry, check orders)
		galleries.grantReadWriteData(authFn);
		orders.grantReadData(authFn);

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

		// KMS permissions for decrypting SecureString parameters (e.g., CloudFrontPrivateKey)
		authFn.addToRolePolicy(new PolicyStatement({
			actions: [
				'kms:Decrypt'
			],
			resources: [
				`arn:aws:kms:${this.region}:${this.account}:key/*`
			],
			conditions: {
				StringEquals: {
					'kms:ViaService': `ssm.${this.region}.amazonaws.com`
				}
			}
		}));

		// SES permissions for welcome email (confirm-signup sends email with PDF attachments)
		authFn.addToRolePolicy(new PolicyStatement({
			actions: ['ses:SendEmail', 'ses:SendRawEmail'],
			resources: ['*']
		}));

		// Single API Lambda function - handles all HTTP endpoints via Express router (except auth)
		const apiFn = new NodejsFunction(this, 'ApiFunction', {
			functionName: prefixName('apiLambda'),
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
		referralCodeValidation.grantReadWriteData(apiFn);

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

		// KMS permissions for decrypting SecureString parameters (e.g., CloudFrontPrivateKey)
		// AWS SSM uses the default AWS managed key (alias/aws/ssm) for SecureString parameters
		apiFn.addToRolePolicy(new PolicyStatement({
			actions: [
				'kms:Decrypt'
			],
			resources: [
				`arn:aws:kms:${this.region}:${this.account}:key/*`
			],
			conditions: {
				StringEquals: {
					'kms:ViaService': `ssm.${this.region}.amazonaws.com`
				}
			}
		}));

		// Lambda invoke permissions (for zip generation functions)
		zipFn.grantInvoke(apiFn);
		zipRouterFn.grantInvoke(apiFn);
		onOrderDeliveredFn.grantInvoke(apiFn);

		// Create a single wildcard permission for HTTP API to invoke the Lambda
		// This replaces individual permissions per route, avoiding the 20KB policy size limit
		// Based on AWS support recommendation: use wildcard SourceArn instead of per-route permissions
		apiFn.addPermission('AllowHttpApiInvoke', {
			principal: new ServicePrincipal('apigateway.amazonaws.com'),
			sourceArn: Stack.of(this).formatArn({
				service: 'execute-api',
				resource: httpApi.apiId,
				resourceName: '*/*'
			})
		});

		// Add wildcard permission for authFn to avoid policy size limit
		authFn.addPermission('AllowHttpApiInvoke', {
			principal: new ServicePrincipal('apigateway.amazonaws.com'),
			sourceArn: Stack.of(this).formatArn({
				service: 'execute-api',
				resource: httpApi.apiId,
				resourceName: '*/*'
			})
		});

		// Helper function to add routes using CfnIntegration (doesn't auto-create permissions)
		// This prevents Lambda policy size from exceeding 20KB limit when many routes exist
		const addRouteWithoutPermission = (
			id: string,
			path: string,
			methods: HttpMethod[],
			lambdaFn: NodejsFunction,
			useAuthorizer: boolean = false
		) => {
			const integration = new CfnIntegration(this, `${id}Integration`, {
				apiId: httpApi.apiId,
				integrationType: 'AWS_PROXY',
				integrationUri: lambdaFn.functionArn,
				payloadFormatVersion: '1.0'
			});

			// Create a route for each HTTP method
			methods.forEach((method, index) => {
				new CfnRoute(this, `${id}Route${index}`, {
					apiId: httpApi.apiId,
					routeKey: `${method} ${path}`,
					target: `integrations/${integration.ref}`,
					authorizerId: useAuthorizer ? authorizerResource.ref : undefined,
					authorizationType: useAuthorizer ? 'JWT' : undefined
				});
			});
		};

		// Explicit OPTIONS route for CORS preflight - must come before catch-all route
		// API Gateway HTTP API v2's built-in CORS may not work correctly with authorizers,
		// so we handle OPTIONS explicitly to ensure preflight requests succeed
		// Using CfnIntegration to avoid auto-creating Lambda permissions
		addRouteWithoutPermission('ApiOptions', '/{proxy+}', [HttpMethod.OPTIONS], apiFn);

		// Auth routes - handled by separate auth Lambda
		// Public auth endpoints (signup, password reset) - no authorizer required
		addRouteWithoutPermission('AuthPublic', '/auth/public/{proxy+}', 
			[HttpMethod.GET, HttpMethod.POST, HttpMethod.PUT, HttpMethod.PATCH, HttpMethod.DELETE, HttpMethod.OPTIONS], 
			authFn);
		// Public undo deletion route - must be public (no authorizer) as it uses token in URL
		// This is the only public /auth route that needs special handling
		// All other /auth routes are handled by the catch-all below
		addRouteWithoutPermission('UserDeletionUndo', '/auth/undo-deletion/{token}', 
			[HttpMethod.GET, HttpMethod.OPTIONS], apiFn);

		// OPTIONS for all /auth endpoints - must be public for CORS preflight
		// This catch-all handles OPTIONS for all /auth routes (including deletion, dev, etc.)
		addRouteWithoutPermission('AuthOptions', '/auth/{proxy+}', [HttpMethod.OPTIONS], authFn);

		// Protected /auth endpoints catch-all - handles all authenticated /auth routes
		// Routes like /auth/request-deletion, /auth/cancel-deletion, /auth/deletion-status,
		// /auth/dev/trigger-inactivity-scanner, /auth/change-password, etc. are all handled here
		// Express routing in the Lambda function handles the actual path matching
		// This consolidates many individual routes into one, saving Lambda permission space
		// Using CfnRoute with authorizer to avoid auto-creating permissions
		addRouteWithoutPermission('Auth', '/auth/{proxy+}', 
			[HttpMethod.GET, HttpMethod.POST, HttpMethod.PUT, HttpMethod.PATCH, HttpMethod.DELETE], 
			authFn, true);
		// Client login endpoint - clients authenticate with gallery password, not Cognito
		addRouteWithoutPermission('ApiClientLogin', '/galleries/{id}/client-login', 
			[HttpMethod.POST, HttpMethod.OPTIONS], apiFn);
		// Public gallery info endpoint (login page): non-sensitive fields only
		addRouteWithoutPermission('ApiGalleryPublicInfo', '/galleries/{id}/public-info', 
			[HttpMethod.GET, HttpMethod.OPTIONS], apiFn);

		// Client gallery endpoints (use client JWT tokens, not Cognito)
		// These endpoints verify client JWT tokens in the Lambda function itself
		// Using CfnIntegration to avoid auto-creating Lambda permissions (wildcard permission covers all routes)
		// Keys-only endpoints first (more specific) - lightweight for Uppy collision detection
		addRouteWithoutPermission('ApiGalleryImageKeys', '/galleries/{id}/images/keys', 
			[HttpMethod.GET, HttpMethod.OPTIONS], apiFn);
		addRouteWithoutPermission('ApiGalleryImages', '/galleries/{id}/images', 
			[HttpMethod.GET, HttpMethod.OPTIONS], apiFn);
		addRouteWithoutPermission('ApiGalleryImagePresignedUrl', '/galleries/{id}/images/{imageKey}/presigned-url', 
			[HttpMethod.GET, HttpMethod.OPTIONS], apiFn);
		addRouteWithoutPermission('ApiGalleryImageDownload', '/galleries/{id}/images/{imageKey}/download', 
			[HttpMethod.GET, HttpMethod.OPTIONS], apiFn);
		addRouteWithoutPermission('ApiGalleryStatus', '/galleries/{id}/status', 
			[HttpMethod.GET, HttpMethod.OPTIONS], apiFn);
		addRouteWithoutPermission('ApiOrdersList', '/galleries/{id}/orders', 
			[HttpMethod.GET, HttpMethod.OPTIONS], apiFn);
		addRouteWithoutPermission('ApiOrdersDelivered', '/galleries/{id}/orders/delivered', 
			[HttpMethod.GET, HttpMethod.OPTIONS], apiFn);
		addRouteWithoutPermission('ApiOrdersClientApproved', '/galleries/{id}/orders/client-approved', 
			[HttpMethod.GET, HttpMethod.OPTIONS], apiFn);
		addRouteWithoutPermission('ApiSelectionsGet', '/galleries/{id}/selections', 
			[HttpMethod.GET, HttpMethod.OPTIONS], apiFn);
		addRouteWithoutPermission('ApiSelectionsApprove', '/galleries/{id}/selections/approve', 
			[HttpMethod.POST, HttpMethod.OPTIONS], apiFn);
		addRouteWithoutPermission('ApiSelectionChangeRequest', '/galleries/{id}/selection-change-request', 
			[HttpMethod.POST, HttpMethod.OPTIONS], apiFn);
		addRouteWithoutPermission('ApiOrdersZip', '/galleries/{id}/orders/{orderId}/zip', 
			[HttpMethod.GET, HttpMethod.OPTIONS], apiFn);
		addRouteWithoutPermission('ApiOrdersZipStatus', '/galleries/{id}/orders/{orderId}/zip/status', 
			[HttpMethod.GET, HttpMethod.OPTIONS], apiFn);
		addRouteWithoutPermission('ApiOrdersFinalImageKeys', '/galleries/{id}/orders/{orderId}/final/images/keys', 
			[HttpMethod.GET, HttpMethod.OPTIONS], apiFn);
		addRouteWithoutPermission('ApiOrdersFinalImages', '/galleries/{id}/orders/{orderId}/final/images', 
			[HttpMethod.GET, HttpMethod.OPTIONS], apiFn);
		addRouteWithoutPermission('ApiOrdersFinalZip', '/galleries/{id}/orders/{orderId}/final/zip', 
			[HttpMethod.GET, HttpMethod.POST, HttpMethod.OPTIONS], apiFn); // Support both GET (new) and POST (backward compatibility)
		addRouteWithoutPermission('ApiOrdersFinalZipStatus', '/galleries/{id}/orders/{orderId}/final/zip/status', 
			[HttpMethod.GET, HttpMethod.OPTIONS], apiFn);

		// Stripe payment functions - separate Lambda functions for better isolation and scaling
		// Created BEFORE catch-all route to ensure they're matched first
		const paymentsCheckoutFn = new NodejsFunction(this, 'PaymentsCheckoutFn', {
			functionName: prefixName('paymentsCheckout'),
			entry: path.join(__dirname, '../../../backend/functions/payments/checkoutCreate.ts'),
			handler: 'handler',
			...defaultFnProps,
			environment: envVars
		});
		const paymentsWebhookFn = new NodejsFunction(this, 'PaymentsWebhookFn', {
			functionName: prefixName('paymentsWebhook'),
			entry: path.join(__dirname, '../../../backend/functions/payments/webhook.ts'),
			handler: 'handler',
			...defaultFnProps,
			environment: envVars
		});
		const paymentsSuccessFn = new NodejsFunction(this, 'PaymentsSuccessFn', {
			functionName: prefixName('paymentsSuccess'),
			entry: path.join(__dirname, '../../../backend/functions/payments/success.ts'),
			handler: 'handler',
			...defaultFnProps,
			environment: envVars
		});
		const paymentsCancelFn = new NodejsFunction(this, 'PaymentsCancelFn', {
			functionName: prefixName('paymentsCancel'),
			entry: path.join(__dirname, '../../../backend/functions/payments/cancel.ts'),
			handler: 'handler',
			...defaultFnProps,
			environment: envVars
		});
		const paymentsCheckStatusFn = new NodejsFunction(this, 'PaymentsCheckStatusFn', {
			functionName: prefixName('paymentsCheckStatus'),
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
		users.grantReadWriteData(paymentsWebhookFn); // Referral: ensureUserReferralCode, getEmailForUser

		// SSM Parameter Store permissions for payment functions
		paymentsCheckoutFn.addToRolePolicy(ssmPolicy);
		paymentsCheckoutFn.addToRolePolicy(kmsDecryptPolicy);
		paymentsWebhookFn.addToRolePolicy(ssmPolicy);
		paymentsWebhookFn.addToRolePolicy(kmsDecryptPolicy);
		paymentsWebhookFn.addToRolePolicy(new PolicyStatement({
			actions: ['ses:SendEmail', 'ses:SendRawEmail'],
			resources: ['*']
		})); // Referral eligibility + referrer reward emails
		paymentsSuccessFn.addToRolePolicy(ssmPolicy);
		paymentsSuccessFn.addToRolePolicy(kmsDecryptPolicy);
		paymentsCancelFn.addToRolePolicy(ssmPolicy);
		paymentsCancelFn.addToRolePolicy(kmsDecryptPolicy);
		paymentsCheckStatusFn.addToRolePolicy(ssmPolicy);
		paymentsCheckStatusFn.addToRolePolicy(kmsDecryptPolicy);

		// Create EventBridge rule for Stripe partner events
		// Stripe sends events directly to EventBridge partner event bus, which routes them to Lambda
		// NOTE: This requires setting up Stripe's AWS EventBridge integration first
		// See: https://stripe.com/docs/stripe-cli/eventbridge
		// The event bus name format is: aws.partner/stripe.com/{account_id}
		// Set STRIPE_EVENTBRIDGE_SOURCE_NAME env var to enable this feature
		// Can be either:
		//   - Event bus name: aws.partner/stripe.com/ed_test_...
		//   - ARN format: arn:aws:events:region::event-source/aws.partner/stripe.com/ed_test_...
		const stripeEventSourceNameRaw = process.env.STRIPE_EVENTBRIDGE_SOURCE_NAME || '';
		
		// Extract event bus name from ARN if ARN format is provided
		// ARN format: arn:aws:events:region::event-source/aws.partner/stripe.com/...
		// Event bus name: aws.partner/stripe.com/...
		let stripeEventSourceName = stripeEventSourceNameRaw.trim();
		if (stripeEventSourceName.startsWith('arn:aws:events:')) {
			// Extract event bus name from ARN
			// ARN format: arn:aws:events:region::event-source/aws.partner/stripe.com/...
			const arnParts = stripeEventSourceName.split('/');
			if (arnParts.length >= 2) {
				// Take everything after the last '/' which should be the event bus name
				stripeEventSourceName = arnParts.slice(1).join('/');
			} else {
				// Fallback: try to extract from ARN structure
				const match = stripeEventSourceName.match(/event-source\/(.+)$/);
				if (match && match[1]) {
					stripeEventSourceName = match[1];
				}
			}
		}
		
		// Only create EventBridge rule if Stripe event bus is configured
		if (stripeEventSourceName && stripeEventSourceName.trim() !== '') {
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
		} else {
			// Log warning that EventBridge integration is not configured
			// Stripe webhooks will need to use HTTP endpoint instead
			console.warn('⚠️  STRIPE_EVENTBRIDGE_SOURCE_NAME not set. Stripe EventBridge rule will not be created.');
			console.warn('   Stripe webhooks will need to use HTTP endpoint: /payments/webhook');
		}

		// Add HTTP webhook route as fallback (used when EventBridge is not configured)
		// If EventBridge is configured, Stripe will send events there; otherwise use HTTP webhook
		httpApi.addRoutes({
			path: '/payments/webhook',
			methods: [HttpMethod.POST],
			integration: new HttpLambdaIntegration('PaymentsWebhookIntegration', paymentsWebhookFn)
			// No authorizer - Stripe webhooks are authenticated via webhook secret verification
		});
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

		// Single catch-all route for all other API endpoints (protected routes)
		// Exclude OPTIONS from catch-all since it's handled separately above
		// Using CfnRoute with authorizer to avoid auto-creating permissions
		addRouteWithoutPermission('Api', '/{proxy+}', 
			[HttpMethod.GET, HttpMethod.POST, HttpMethod.PUT, HttpMethod.PATCH, HttpMethod.DELETE], 
			apiFn, true);

		// Also add root routes (without proxy)
		addRouteWithoutPermission('ApiHealth', '/health', [HttpMethod.GET], apiFn);
		addRouteWithoutPermission('ApiConfig', '/config', [HttpMethod.GET], apiFn);

		// Grant API Lambda permission to invoke zipFn
		apiFn.addToRolePolicy(new PolicyStatement({
			actions: ['lambda:InvokeFunction'],
			resources: [zipFn.functionArn, zipRouterFn.functionArn]
		}));

		// Gallery delete helper - used by expiry event handlers
		const galleriesDeleteHelperFn = new NodejsFunction(this, 'GalleriesDeleteHelperFn', {
			functionName: prefixName('galleriesDeleteHelper'),
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
		galleriesDeleteHelperFn.addToRolePolicy(kmsDecryptPolicy);
		envVars['GALLERIES_DELETE_FN_NAME'] = galleriesDeleteHelperFn.functionName;

		// Remove all individual HTTP Lambda functions - they're now handled by the single API Lambda
		// Keeping only event-triggered and helper functions below

		// Note: DynamoDB Stream handler for TTL deletions has been removed
		// Gallery expiration is now handled by EventBridge Scheduler

		// Expiry reminders schedule - sends warning emails
		// Note: Gallery deletion is handled by EventBridge Scheduler, not DynamoDB TTL
		const expiryFn = new NodejsFunction(this, 'ExpiryCheckFn', {
			functionName: prefixName('expiryCheck'),
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
		expiryFn.addToRolePolicy(kmsDecryptPolicy);
		// Run every 6 hours for more frequent expiry checks and warnings
		new Rule(this, 'ExpirySchedule', {
			schedule: Schedule.rate(Duration.hours(6)),
			targets: [new LambdaFunction(expiryFn)]
		});

		// EventBridge Scheduler-based gallery expiration system
		// Deletion Lambda function - invoked by EventBridge Scheduler at exact expiry time
		const galleryExpiryDeletionFn = new NodejsFunction(this, 'GalleryExpiryDeletionFn', {
			functionName: prefixName('galleryExpiryDeletion'),
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
		galleryExpiryDeletionFn.addToRolePolicy(kmsDecryptPolicy);
		
		// Dead Letter Queue for failed schedule executions
		const galleryExpiryDLQ = new Queue(this, 'GalleryExpiryDLQ', {
			queueName: `PixiProof-${props.stage}-GalleryExpiryDLQ`,
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
		paymentsWebhookFn.addToRolePolicy(schedulerPolicy); // Cancel gallery-expiry schedule when payment completes
		paymentsWebhookFn.addToRolePolicy(passRolePolicy);
		
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
			queueName: `PixiProof-${props.stage}-UserDeletionDLQ`,
			encryption: QueueEncryption.SQS_MANAGED,
			retentionPeriod: Duration.days(14), // Retain failed jobs for 14 days for debugging
			visibilityTimeout: Duration.minutes(16) // Slightly longer than Lambda timeout (15 minutes)
		});

		// PerformUserDeletion Lambda - Main Lambda that performs actual user deletion
		const performUserDeletionFn = new NodejsFunction(this, 'PerformUserDeletionFn', {
			functionName: prefixName('performUserDeletion'),
			entry: path.join(__dirname, '../../../backend/functions/users/performUserDeletion.ts'),
			handler: 'handler',
			runtime: Runtime.NODEJS_20_X,
			memorySize: 512, // Optimized from 1024MB - 10% utilization (104MB used), sufficient for user deletion operations
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
		subdomains.grantReadWriteData(performUserDeletionFn);
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
		performUserDeletionFn.addToRolePolicy(kmsDecryptPolicy);

		// IAM role for EventBridge Scheduler to invoke PerformUserDeletion Lambda
		const userDeletionSchedulerRole = new Role(this, 'UserDeletionSchedulerRole', {
			assumedBy: new ServicePrincipal('scheduler.amazonaws.com'),
			description: 'Role for EventBridge Scheduler to invoke user deletion Lambda'
		});
		performUserDeletionFn.grantInvoke(userDeletionSchedulerRole);

		// InactivityScanner Lambda - Scans for inactive users and schedules deletions
		const inactivityScannerFn = new NodejsFunction(this, 'InactivityScannerFn', {
			functionName: prefixName('inactivityScanner'),
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
		inactivityScannerFn.addToRolePolicy(kmsDecryptPolicy);
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
			functionName: prefixName('postAuthentication'),
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
		postAuthenticationFn.addToRolePolicy(kmsDecryptPolicy);

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
		// Grant API and Auth Lambdas permission to invoke PerformUserDeletion Lambda (for dev endpoints)
		performUserDeletionFn.grantInvoke(apiFn);
		performUserDeletionFn.grantInvoke(authFn);
		// Update API Lambda environment with user deletion function name (for dev endpoints)
		apiFn.addEnvironment('USER_DELETION_FN_NAME', performUserDeletionFn.functionName);
		apiFn.addEnvironment('USER_DELETION_LAMBDA_ARN', performUserDeletionFn.functionArn);
		apiFn.addEnvironment('USER_DELETION_SCHEDULE_ROLE_ARN', userDeletionSchedulerRole.roleArn);
		apiFn.addEnvironment('USER_DELETION_DLQ_ARN', userDeletionDLQ.queueArn);
		// Auth Lambda serves auth routes including dev triggerUserDeletion — same env for SSM fallback
		authFn.addEnvironment('USER_DELETION_FN_NAME', performUserDeletionFn.functionName);
		authFn.addEnvironment('USER_DELETION_LAMBDA_ARN', performUserDeletionFn.functionArn);
		authFn.addEnvironment('USER_DELETION_SCHEDULE_ROLE_ARN', userDeletionSchedulerRole.roleArn);
		authFn.addEnvironment('USER_DELETION_DLQ_ARN', userDeletionDLQ.queueArn);

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
			functionName: prefixName('transactionExpiryCheck'),
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
		transactionExpiryFn.addToRolePolicy(kmsDecryptPolicy);
		// Run every 15 minutes to check for expired wallet top-ups
		// Also checks gallery transactions (3 days expiry)
		new Rule(this, 'TransactionExpirySchedule', {
			schedule: Schedule.rate(Duration.minutes(15)),
			targets: [new LambdaFunction(transactionExpiryFn)]
		});

		// CloudWatch alarm for transaction expiry Lambda errors (post-GSI removal monitoring)
		new Alarm(this, 'TransactionExpiryErrorsAlarm', {
			alarmName: `PhotoCloud-${props.stage}-TransactionExpiry-Errors`,
			alarmDescription: 'Alert when transaction expiry check Lambda reports errors (monitors Scan-based expiry post-GSI removal)',
			metric: transactionExpiryFn.metricErrors({
				statistic: Statistic.SUM,
				period: Duration.minutes(5)
			}),
			threshold: 1,
			evaluationPeriods: 1,
			comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
			treatMissingData: TreatMissingData.NOT_BREACHING
		});

		// CloudWatch alarm for transaction expiry duration > 4 min (timeout is 5 min)
		new Alarm(this, 'TransactionExpiryDurationAlarm', {
			alarmName: `PhotoCloud-${props.stage}-TransactionExpiry-Duration`,
			alarmDescription: 'Alert when transaction expiry check Lambda duration exceeds 4 minutes (possible Scan performance issue)',
			metric: transactionExpiryFn.metricDuration({
				statistic: Statistic.MAXIMUM,
				period: Duration.minutes(5)
			}),
			threshold: 240000, // 4 minutes in ms
			evaluationPeriods: 2,
			comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
			treatMissingData: TreatMissingData.NOT_BREACHING
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
			queueName: `PixiProof-${props.stage}-DeleteOperationsQueue`,
			encryption: QueueEncryption.SQS_MANAGED,
			visibilityTimeout: Duration.minutes(3), // Must be > Lambda timeout (2 min) + processing time
			receiveMessageWaitTime: Duration.seconds(20), // Long polling for cost efficiency
			retentionPeriod: Duration.days(14)
		});

		// Lambda function to process batch deletes
		// Processes deletes in batches (optimal batch size: 6 per batch, 10 batches per invocation)
		// Consumes from SQS queue with batching to reduce invocations
		const deleteBatchFn = new NodejsFunction(this, 'ImagesOnS3DeleteBatchFn', {
			functionName: prefixName('imagesOnS3DeleteBatch'),
			entry: path.join(__dirname, '../../../backend/functions/images/onS3DeleteBatch.ts'),
			handler: 'handler',
			runtime: Runtime.NODEJS_20_X,
			memorySize: 256, // Optimized from 512MB - 21% utilization (107MB used), sufficient for batch delete operations
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
		
		// Create optimized cache policy for images
		// Only includes 'v' query parameter in cache key (for cache-busting on file replacement)
		// This optimizes cache hit ratio by ignoring other query parameters that don't affect content
		// Cache-busting strategy: When image is replaced, lastModified changes, creating new ?v={timestamp} URL
		const imageCachePolicy = new CachePolicy(this, 'ImageCachePolicy', {
			cachePolicyName: `PhotoCloud-${props.stage}-ImageCache`,
			comment: 'Optimized cache policy for images - only includes v query parameter for cache-busting',
			defaultTtl: Duration.days(365), // Long cache for images (respects S3 Cache-Control headers)
			minTtl: Duration.seconds(0),
			maxTtl: Duration.days(365),
			enableAcceptEncodingGzip: true,
			enableAcceptEncodingBrotli: true,
			// Only include 'v' query parameter in cache key (for cache-busting)
			// This improves cache hit ratio by ignoring irrelevant query parameters
			queryStringBehavior: CacheQueryStringBehavior.allowList(...['v']),
			// Forward ETag header for better cache validation (304 Not Modified responses)
			headerBehavior: CacheHeaderBehavior.allowList(...['ETag', 'If-None-Match', 'If-Modified-Since']),
			// Don't include cookies in cache key (standard for images)
			cookieBehavior: CacheCookieBehavior.none()
		});
		
		// Create response headers policy with CORS headers for images
		// This allows canvas operations to work with images from CloudFront
		const corsResponseHeadersPolicy = new ResponseHeadersPolicy(this, 'ImageCorsResponseHeadersPolicy', {
			responseHeadersPolicyName: `PhotoCloud-${props.stage}-ImageCORS`,
			comment: 'CORS headers for images to enable canvas operations',
			corsBehavior: {
				accessControlAllowCredentials: false,
				accessControlAllowHeaders: ['*'],
				accessControlAllowMethods: ['GET', 'HEAD', 'OPTIONS'],
				accessControlAllowOrigins: ['*'], // Allow all origins for images
				accessControlExposeHeaders: ['ETag', 'Content-Length', 'Content-Type'],
				accessControlMaxAge: Duration.seconds(86400), // 24 hours
				originOverride: false
			},
			securityHeadersBehavior: {
				contentTypeOptions: { override: true },
				frameOptions: { frameOption: HeadersFrameOption.DENY, override: true },
				referrerPolicy: { referrerPolicy: HeadersReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN, override: true }
			}
		});

		// Create CloudFront distribution with OAC
		// S3BucketOrigin.withOriginAccessControl() automatically creates OAC and sets up bucket policy
		const s3Origin = S3BucketOrigin.withOriginAccessControl(galleriesBucket, {
			originAccessControlName: `PhotoCloud-${props.stage}-OAC`,
			description: `Origin Access Control for PhotoCloud ${props.stage} galleries bucket`
		});

		const dist = new Distribution(this, 'PreviewsDistribution', {
			defaultBehavior: {
				origin: s3Origin,
				cachePolicy: imageCachePolicy,
				responseHeadersPolicy: corsResponseHeadersPolicy,
				allowedMethods: AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
				viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS
			},
			priceClass: PriceClass.PRICE_CLASS_100,
			comment: `PhotoCloud previews ${props.stage}`
		});

		// Add behavior for ZIP files (galleries/*/zips/*)
		// Uses AWS managed CachingOptimized policy for better cache performance on ZIP files
		dist.addBehavior('galleries/*/zips/*', s3Origin, {
			cachePolicy: CachePolicy.CACHING_OPTIMIZED,
			allowedMethods: AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
			viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS
		});

		// Add behavior for final ZIP files (galleries/*/orders/*/final-zip/*)
		// Uses AWS managed CachingOptimized policy for better cache performance on final ZIP files
		dist.addBehavior('galleries/*/orders/*/final-zip/*', s3Origin, {
			cachePolicy: CachePolicy.CACHING_OPTIMIZED,
			allowedMethods: AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
			viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS
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

		// CloudFront key pair for signed URLs (for ZIP downloads)
		// NOTE: These parameters must be created manually with actual values:
		// 1. Create CloudFront key pair in AWS Console: https://console.aws.amazon.com/cloudfront/v3/home#/public-key
		// 2. Store private key in SSM: aws ssm put-parameter --name "/PixiProof/{stage}/CloudFrontPrivateKey" --type "SecureString" --value "$(cat private-key.pem)"
		// 3. Store key pair ID in SSM: aws ssm put-parameter --name "/PixiProof/{stage}/CloudFrontKeyPairId" --type "String" --value "K1234567890ABC"
		// The parameters are created here as placeholders - actual values must be set manually
		const cloudfrontKeyPairIdParam = new StringParameter(this, 'CloudFrontKeyPairIdParam', {
			parameterName: `${ssmParameterPrefix}/CloudFrontKeyPairId`,
			stringValue: 'PLACEHOLDER', // Must be replaced with actual key pair ID
			description: 'CloudFront key pair ID for signed URLs (ZIP downloads). Must be set manually after creating CloudFront key pair.'
		});

		// CloudFront private key is stored as SecureString in SSM
		// This is created manually via AWS CLI (see comment above)
		// We don't create it here to avoid storing secrets in CDK code

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
		new CfnOutput(this, 'UserPoolDomain', {
			value: userPoolDomain.domainName,
			description: 'Cognito domain (e.g. pixiproof-<stage>.auth.<region>.amazoncognito.com)'
		});
		new CfnOutput(this, 'CognitoHostedUiBaseUrl', {
			value: `https://${userPoolDomain.domainName}`,
			description: 'Cognito Hosted UI base URL for sign-in/sign-up'
		});
		new CfnOutput(this, 'HttpApiUrl', {
			value: httpApi.apiEndpoint,
			description: 'API Gateway URL (API Lambda / backend base URL)'
		});
		new CfnOutput(this, 'PreviewsDomainName', {
			value: dist.distributionDomainName,
			description: 'CloudFront distribution domain (image CDN)'
		});
		new CfnOutput(this, 'PreviewsDistributionId', { value: dist.distributionId });
		new CfnOutput(this, 'PostAuthenticationLambdaArn', {
			value: postAuthenticationFn.functionArn,
			description: 'ARN of PostAuthentication Lambda - configure this as Post Authentication trigger in Cognito User Pool'
		});

		// Explicitly reference StripePaymentMethodsParam to ensure it's created
		// This prevents CDK from optimizing it away if it's not referenced elsewhere
		stripePaymentMethodsParam.parameterName;

		// Note: Routes for apiFn and authFn use CfnIntegration instead of HttpLambdaIntegration
		// to prevent automatic permission creation. This avoids hitting the 20KB Lambda policy
		// size limit when many routes exist. Wildcard permissions are added for both apiFn and
		// authFn to allow API Gateway to invoke them.
		// 
		// Payment routes still use HttpLambdaIntegration since they use separate Lambda functions
		// with only a few routes each, so they won't hit the policy size limit.
	}
}

