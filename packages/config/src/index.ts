export type Stage = 'dev' | 'prod';

export interface EnvConfig {
	stage: Stage;
	awsRegion: string;
	userPoolId: string;
	userPoolClientId: string;
	galleriesBucketName: string;
	paymentCurrency: 'PLN';
}

export interface PricingPackage {
	packageName: string;
	includedCount: number;
	extraPriceCents: number;
}

export const GALLERY_STATES = ['DRAFT', 'PAID_ACTIVE', 'EXPIRED'] as const;
export type GalleryState = typeof GALLERY_STATES[number];

export type SelectionStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'APPROVED' | 'DISABLED';

export interface SelectionStats {
	selectedCount: number;
	overageCount: number;
	overageCents: number;
}

export interface GalleryRecord {
	galleryId: string;
	ownerId: string;
	ownerEmail?: string;
	state: GalleryState;
	selectionEnabled: boolean;
	selectionStatus: SelectionStatus;
	pricingPackage?: PricingPackage;
	plan?: string;
	priceCents?: number;
	storageLimitBytes?: number;
	bytesUsed?: number;
	expiresAt?: string;
	expiryWarning7dSent?: boolean;
	expiryWarning24hSent?: boolean;
	finalAssetsPrefix?: string;
	createdAt: string;
	updatedAt: string;
}

