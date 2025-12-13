import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { randomBytes, pbkdf2Sync } from 'crypto';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: 'eu-west-1' }));
const galleriesTable = 'PhotoHub-dev-GalleriesTable3EDF46DA-1484QIJYZKFE';
const galleryId = 'gal_1765569706203_4r1z52';
const originalEmail = 'm.d.malinowski87@gmail.com';
const password = 'password123';

const { hash, salt, iterations } = (() => {
	const s = randomBytes(16).toString('hex');
	const h = pbkdf2Sync(password, s, 100_000, 32, 'sha256').toString('hex');
	return { hash: h, salt: s, iterations: 100000 };
})();

await ddb.send(new UpdateCommand({
	TableName: galleriesTable,
	Key: { galleryId },
	UpdateExpression: 'SET clientEmail = :email, clientPasswordHash = :hash, clientPasswordSalt = :salt, clientPasswordIter = :iter, clientPasswordEncrypted = :enc, updatedAt = :u',
	ExpressionAttributeValues: {
		':email': originalEmail,
		':hash': hash,
		':salt': salt,
		':iter': iterations,
		':enc': Buffer.from(password).toString('base64'),
		':u': new Date().toISOString()
	}
}));

console.log('✅ Restored original client email:', originalEmail);

