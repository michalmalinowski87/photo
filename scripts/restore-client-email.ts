import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { encryptClientGalleryPassword, hashClientGalleryPassword } from '../backend/lib/src/client-gallery-password';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: 'eu-west-1' }));
const galleriesTable = 'dev-galleries'; // Update with actual table name if needed
const galleryId = 'gal_1765569706203_4r1z52';
const originalEmail = 'm.d.malinowski87@gmail.com';
const password = 'password123';

const encSecret = process.env.GALLERY_PASSWORD_ENCRYPTION_SECRET;
if (!encSecret) {
	throw new Error('Missing GALLERY_PASSWORD_ENCRYPTION_SECRET (required to store encrypted gallery passwords).');
}
const { hashHex, saltHex, iterations } = hashClientGalleryPassword(password);

await ddb.send(new UpdateCommand({
	TableName: galleriesTable,
	Key: { galleryId },
	UpdateExpression: 'SET clientEmail = :email, clientPasswordHash = :hash, clientPasswordSalt = :salt, clientPasswordIter = :iter, clientPasswordEncrypted = :enc, updatedAt = :u',
	ExpressionAttributeValues: {
		':email': originalEmail,
		':hash': hashHex,
		':salt': saltHex,
		':iter': iterations,
		':enc': encryptClientGalleryPassword(password, encSecret),
		':u': new Date().toISOString()
	}
}));

console.log('✅ Restored original client email:', originalEmail);







