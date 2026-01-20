import {
	createCipheriv,
	createDecipheriv,
	pbkdf2Sync,
	randomBytes,
	scryptSync,
	timingSafeEqual,
} from 'crypto';
import { getConfigWithEnvFallback } from './ssm-config';

/**
 * We store a *hash* for authentication (PBKDF2 + per-password random salt),
 * and optionally store a *reversible encrypted* copy for emailing the password later.
 */

const HASH_ITERATIONS = 100_000;
const HASH_KEYLEN_BYTES = 32;
const HASH_DIGEST = 'sha256';

const ENC_PREFIX = 'pc_v1:';
const ENC_SALT_BYTES = 16;
const ENC_IV_BYTES = 12; // recommended for GCM
const ENC_ALGO = 'aes-256-gcm';

export type ClientGalleryPasswordHash = {
	hashHex: string;
	saltHex: string;
	iterations: number;
	algo: 'pbkdf2-sha256';
};

export function hashClientGalleryPassword(passwordPlain: string): ClientGalleryPasswordHash {
	const salt = randomBytes(16).toString('hex');
	const hash = pbkdf2Sync(passwordPlain, salt, HASH_ITERATIONS, HASH_KEYLEN_BYTES, HASH_DIGEST).toString('hex');
	return {
		hashHex: hash,
		saltHex: salt,
		iterations: HASH_ITERATIONS,
		algo: 'pbkdf2-sha256',
	};
}

export function verifyClientGalleryPassword(
	passwordPlain: string,
	stored?: Partial<Pick<ClientGalleryPasswordHash, 'hashHex' | 'saltHex' | 'iterations'>>
): boolean {
	if (!stored?.hashHex || !stored?.saltHex || !stored?.iterations) return false;
	try {
		const calc = pbkdf2Sync(passwordPlain, stored.saltHex, stored.iterations, HASH_KEYLEN_BYTES, HASH_DIGEST);
		const expected = Buffer.from(stored.hashHex, 'hex');
		return expected.length === calc.length && timingSafeEqual(expected, calc);
	} catch {
		return false;
	}
}

/**
 * Encrypts the plaintext password for storage in DynamoDB (for later emailing).
 *
 * Format: `pc_v1:<salt_b64url>:<iv_b64url>:<tag_b64url>:<ciphertext_b64url>`
 * - salt: random, used for scrypt key derivation
 * - iv: random, used for AES-GCM
 * - tag: authentication tag (integrity)
 */
export function encryptClientGalleryPassword(passwordPlain: string, secret: string): string {
	if (!secret) throw new Error('Missing encryption secret');
	const salt = randomBytes(ENC_SALT_BYTES);
	const iv = randomBytes(ENC_IV_BYTES);
	const key = scryptSync(secret, salt, 32);

	const cipher = createCipheriv(ENC_ALGO, key, iv);
	const ciphertext = Buffer.concat([cipher.update(passwordPlain, 'utf8'), cipher.final()]);
	const tag = cipher.getAuthTag();

	return (
		ENC_PREFIX +
		[
			salt.toString('base64url'),
			iv.toString('base64url'),
			tag.toString('base64url'),
			ciphertext.toString('base64url'),
		].join(':')
	);
}

export function isEncryptedClientGalleryPassword(value: unknown): value is string {
	return typeof value === 'string' && value.startsWith(ENC_PREFIX);
}

export function decryptClientGalleryPassword(encrypted: string, secret: string): string {
	if (!secret) throw new Error('Missing encryption secret');
	if (!isEncryptedClientGalleryPassword(encrypted)) throw new Error('Unsupported encrypted password format');

	const parts = encrypted.slice(ENC_PREFIX.length).split(':');
	if (parts.length !== 4) throw new Error('Invalid encrypted password payload');

	const [saltB64, ivB64, tagB64, ctB64] = parts;
	const salt = Buffer.from(saltB64, 'base64url');
	const iv = Buffer.from(ivB64, 'base64url');
	const tag = Buffer.from(tagB64, 'base64url');
	const ciphertext = Buffer.from(ctB64, 'base64url');

	const key = scryptSync(secret, salt, 32);
	const decipher = createDecipheriv(ENC_ALGO, key, iv);
	decipher.setAuthTag(tag);
	const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
	return plaintext.toString('utf8');
}

export async function getGalleryPasswordEncryptionSecret(stage: string): Promise<string | undefined> {
	return getConfigWithEnvFallback(stage, 'GalleryPasswordEncryptionSecret', 'GALLERY_PASSWORD_ENCRYPTION_SECRET');
}

