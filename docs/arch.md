# PhotoHub Architecture

## Overview

PhotoHub is a serverless SaaS platform for photographers to create secure private galleries with client selection and final delivery. Built on AWS using CDK v2 for infrastructure as code.

## Architecture Components

### Infrastructure (AWS CDK)

- **API Gateway HTTP API**: RESTful API endpoints with Cognito JWT authentication
- **Lambda Functions**: Serverless compute for all business logic
- **DynamoDB Tables**: 
  - `Galleries` - Gallery metadata and configuration
  - `Orders` - Order tracking and billing (includes client selections)
  - `Wallets` - User wallet balances
  - `WalletLedger` - Transaction history
  - `Payments` - Payment records
  - `Users` - User profiles
- **S3 Bucket**: Storage for originals, previews, thumbnails, final assets, ZIPs, and archives
- **CloudFront**: CDN for serving previews and thumbnails
- **Cognito User Pool**: Authentication for photographers
- **SES**: Email notifications
- **EventBridge**: Scheduled tasks (expiry checks)

### Backend Functions

#### Gallery Management
- `galleries/create.ts` - Create new gallery
- `galleries/get.ts` - Get gallery details
- `galleries/list.ts` - List user's galleries (with GSI on ownerId)
- `galleries/delete.ts` - Comprehensive GDPR deletion
- `galleries/setClientPassword.ts` - Set client access password
- `galleries/setSelectionMode.ts` - Enable/disable selection mode
- `galleries/updatePricingPackage.ts` - Update pricing configuration
- `galleries/sendGalleryToClient.ts` - Send gallery invitation to client

#### Selections
- `selections/approveSelection.ts` - Approve selection and create order
- `selections/getSelection.ts` - Get current selection
- `selections/changeRequest.ts` - Request selection changes

#### Orders
- `orders/list.ts` - List orders for a gallery
- `orders/get.ts` - Get order details
- `orders/listDelivered.ts` - List delivered orders for client
- `orders/listFinalImages.ts` - List final images for a specific order
- `orders/uploadFinal.ts` - Upload final processed photos for an order
- `orders/downloadZip.ts` - Get presigned download URL for order ZIP
- `orders/downloadFinalZip.ts` - Download final ZIP for an order
- `orders/regenerateZip.ts` - Regenerate ZIP for an order
- `orders/sendFinalLink.ts` - Send final delivery link to client
- `orders/approveChangeRequest.ts` - Approve client change requests (restores order to CLIENT_SELECTING)
- `orders/markPaid.ts` - Mark order as paid
- `orders/markDepositPaid.ts` - Mark order as deposit paid
- `orders/markCanceled.ts` - Mark order as canceled
- `orders/markRefunded.ts` - Mark order as refunded

#### Uploads & Downloads
- `uploads/presign.ts` - Generate presigned S3 upload URLs
- `downloads/createZip.ts` - Create ZIP of selected photos

#### Image Processing
- `images/onUploadResize.ts` - Generate previews (1200px) and thumbnails (200px) using Sharp

#### Processing
- `processed/complete.ts` - Mark order as delivered and clean originals

#### Payments (Planned)
- `payments/checkoutCreate.ts` - Create Stripe checkout session
- `payments/webhook.ts` - Handle Stripe webhooks

#### Expiry
- `expiry/checkAndNotify.ts` - Scheduled check for expiring galleries

### Frontend Applications

#### Dashboard (`frontend/dashboard`)
- Next.js application for photographers
- Cognito Hosted UI authentication
- Gallery management interface
- Order management
- Wallet management (planned)

#### Client Gallery (`frontend/gallery`)
- Next.js public-facing gallery
- Password-protected access
- Photo selection interface
- Order approval flow

## Data Flow

### Gallery Creation Flow
1. Photographer authenticates via Cognito
2. Creates gallery via `POST /galleries`
3. Sets client password and pricing package
4. Uploads originals via presigned URLs
5. System generates previews/thumbnails automatically

### Client Selection Flow
1. Client accesses gallery with password
2. Views previews via CloudFront
3. Selects photos (stored in memory on frontend)
4. Approves selection via `POST /galleries/{id}/selections/approve`
5. System creates order (with CLIENT_APPROVED status) and generates ZIP
6. Client can request changes (changes order to CHANGES_REQUESTED status)
7. Photographer approves change request (restores order to CLIENT_SELECTING status)
8. Photographer processes and marks delivered (changes order to DELIVERED status)

### GDPR Deletion Flow
1. Photographer requests deletion via `DELETE /galleries/{id}`
2. System deletes all S3 objects (originals, previews, thumbs, final, zips, archive)
3. System deletes all DynamoDB records (orders)
4. System deletes gallery record
5. Returns deletion summary

## Security

- **Authentication**: Cognito JWT for photographer endpoints
- **Authorization**: Owner-only access enforced via `requireOwnerOr403`
- **Client Access**: Password-based (PBKDF2 with salt/iterations)
- **S3**: Private bucket with CloudFront OAI for previews
- **CORS**: Configurable origins via CDK context/environment

## Storage Layout

```
galleries/{galleryId}/
  originals/          # Original uploaded photos
  previews/           # 1200px previews (CloudFront)
  thumbs/             # 200px thumbnails (CloudFront)
  final/              # Processed final photos
  zips/               # Generated ZIP files
  archive/            # Long-term archive ZIPs (Glacier)
```

## Environment Variables

- `STAGE` - Deployment stage (dev/prod)
- `GALLERIES_BUCKET` - S3 bucket name
- `COGNITO_USER_POOL_ID` - Cognito User Pool ID
- `COGNITO_USER_POOL_CLIENT_ID` - Cognito Client ID
- `COGNITO_DOMAIN` - Cognito Hosted UI domain
- `CLOUDFRONT_DOMAIN` - CloudFront distribution domain
- `SENDER_EMAIL` - SES sender email
- `PHOTOGRAPHER_NOTIFY_EMAIL` - Notification email
- Table names for all DynamoDB tables

## Deployment

Infrastructure is deployed via AWS CDK:

```bash
cd infra
yarn build
yarn deploy --context stage=dev
```

Frontend apps are deployed separately (Vercel, CloudFront, etc.) with environment variables pointing to the API.

