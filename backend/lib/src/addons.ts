import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

// Addon type constants
export const ADDON_TYPES = {
	BACKUP_STORAGE: 'BACKUP_STORAGE'
	// Future addon types can be added here
} as const;

export type AddonType = typeof ADDON_TYPES[keyof typeof ADDON_TYPES];

// Type-specific config interfaces
export interface BackupStorageConfig {
	priceMultiplier: number; // Percentage as decimal (e.g., 0.3 for 30%)
}

// Union type for all addon configs (extendable for future addon types)
export type AddonConfig = BackupStorageConfig; // | FutureAddonConfig | AnotherAddonConfig

// Base addon record interface
export interface AddonRecord {
	galleryId: string;
	addonId: string; // Format: "{addonType}" (gallery-level)
	addonType: AddonType;
	priceCents: number;
	config: Record<string, any>; // Type-specific configuration document
	purchasedAt: string;
	metadata?: Record<string, any>;
}

/**
 * Check if an addon exists for a gallery
 */
export async function hasAddon(
	galleryId: string,
	addonType: AddonType
): Promise<boolean> {
	const envProc = (globalThis as any).process;
	const addonsTable = envProc?.env?.GALLERY_ADDONS_TABLE as string;
	if (!addonsTable) {
		throw new Error('GALLERY_ADDONS_TABLE environment variable not set');
	}

	const addonId = addonType;
	try {
		const result = await ddb.send(new GetCommand({
			TableName: addonsTable,
			Key: { galleryId, addonId }
		}));
		return !!result.Item;
	} catch (err: any) {
		console.error('Error checking for addon:', err);
		return false;
	}
}

/**
 * Get addon record for a gallery
 */
export async function getAddon(
	galleryId: string,
	addonType: AddonType
): Promise<AddonRecord | null> {
	const envProc = (globalThis as any).process;
	const addonsTable = envProc?.env?.GALLERY_ADDONS_TABLE as string;
	if (!addonsTable) {
		throw new Error('GALLERY_ADDONS_TABLE environment variable not set');
	}

	const addonId = addonType;
	try {
		const result = await ddb.send(new GetCommand({
			TableName: addonsTable,
			Key: { galleryId, addonId }
		}));
		return (result.Item as AddonRecord) || null;
	} catch (err: any) {
		console.error('Error getting addon:', err);
		return null;
	}
}

/**
 * Get all addons for a gallery
 */
export async function getGalleryAddons(
	galleryId: string
): Promise<AddonRecord[]> {
	const envProc = (globalThis as any).process;
	const addonsTable = envProc?.env?.GALLERY_ADDONS_TABLE as string;
	if (!addonsTable) {
		throw new Error('GALLERY_ADDONS_TABLE environment variable not set');
	}

	try {
		const result = await ddb.send(new QueryCommand({
			TableName: addonsTable,
			KeyConditionExpression: 'galleryId = :g',
			ExpressionAttributeValues: {
				':g': galleryId
			}
		}));
		return (result.Items || []) as AddonRecord[];
	} catch (err: any) {
		console.error('Error getting gallery addons:', err);
		return [];
	}
}

/**
 * Create an addon record (gallery-level)
 */
export async function createAddon(
	galleryId: string,
	addonType: AddonType,
	priceCents: number,
	config: Record<string, any>,
	metadata?: Record<string, any>
): Promise<void> {
	const envProc = (globalThis as any).process;
	const addonsTable = envProc?.env?.GALLERY_ADDONS_TABLE as string;
	if (!addonsTable) {
		throw new Error('GALLERY_ADDONS_TABLE environment variable not set');
	}

	const addonId = addonType;
	const now = new Date().toISOString();

	const addon: AddonRecord = {
		galleryId,
		addonId,
		addonType,
		priceCents,
		config,
		purchasedAt: now,
		...(metadata && { metadata })
	};

	await ddb.send(new PutCommand({
		TableName: addonsTable,
		Item: addon
	}));
}

/**
 * Type-specific helper: Get backup storage addon config
 */
export async function getBackupStorageConfig(
	galleryId: string
): Promise<BackupStorageConfig | null> {
	const addon = await getAddon(galleryId, ADDON_TYPES.BACKUP_STORAGE);
	if (!addon) {
		return null;
	}

	// Validate and return config
	const config = addon.config as BackupStorageConfig;
	if (typeof config.priceMultiplier === 'number') {
		return config;
	}

	// Fallback to default if config is invalid
	return { priceMultiplier: 0.3 };
}

/**
 * Type-specific helper: Get backup storage price multiplier
 */
export async function getBackupStoragePriceMultiplier(
	galleryId: string
): Promise<number> {
	const config = await getBackupStorageConfig(galleryId);
	return config?.priceMultiplier ?? 0.3; // Default to 30% if not found
}

/**
 * Type-specific helper: Create backup storage addon
 */
export async function createBackupStorageAddon(
	galleryId: string,
	priceCents: number,
	priceMultiplier: number = 0.3
): Promise<void> {
	const config: BackupStorageConfig = {
		priceMultiplier
	};
	await createAddon(galleryId, ADDON_TYPES.BACKUP_STORAGE, priceCents, config);
}
