/**
 * Private S3 provider for FileStorageService.
 * Never logs credentials. Never sets public ACL.
 */
import {
    S3Client,
    PutObjectCommand,
    GetObjectCommand,
    DeleteObjectCommand,
    HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl as awsGetSignedUrl } from '@aws-sdk/s3-request-presigner';
import { STORAGE_PROVIDERS, DEFAULT_SIGNED_URL_EXPIRES_SECONDS } from '../constants.js';
import { assertExactObjectKey } from '../keyBuilder.js';

function requireAwsConfig() {
    const region = String(process.env.AWS_REGION || '').trim();
    const bucket = String(process.env.AWS_S3_BUCKET || '').trim();
    const accessKeyId = String(process.env.AWS_ACCESS_KEY_ID || '').trim();
    const secretAccessKey = String(process.env.AWS_SECRET_ACCESS_KEY || '').trim();

    if (!region) throw new Error('AWS_REGION is required for S3 storage provider');
    if (!bucket) throw new Error('AWS_S3_BUCKET is required for S3 storage provider');
    if (!accessKeyId) throw new Error('AWS_ACCESS_KEY_ID is required for S3 storage provider');
    if (!secretAccessKey) throw new Error('AWS_SECRET_ACCESS_KEY is required for S3 storage provider');

    return { region, bucket, accessKeyId, secretAccessKey };
}

async function streamToBuffer(body) {
    if (!body) return Buffer.alloc(0);
    if (Buffer.isBuffer(body)) return body;
    if (typeof body.transformToByteArray === 'function') {
        return Buffer.from(await body.transformToByteArray());
    }
    const chunks = [];
    for await (const chunk of body) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
}

export function createS3StorageProvider(overrides = {}) {
    const cfg = { ...requireAwsConfig(), ...overrides };
    const client = new S3Client({
        region: cfg.region,
        credentials: {
            accessKeyId: cfg.accessKeyId,
            secretAccessKey: cfg.secretAccessKey,
        },
    });

    return {
        name: STORAGE_PROVIDERS.S3,
        bucket: cfg.bucket,
        region: cfg.region,

        async uploadObject({ objectKey, buffer, mimeType }) {
            const key = assertExactObjectKey(objectKey);
            await client.send(
                new PutObjectCommand({
                    Bucket: cfg.bucket,
                    Key: key,
                    Body: buffer,
                    ContentType: mimeType || 'application/octet-stream',
                    // Explicitly omit ACL — bucket remains private.
                }),
            );
            return {
                storageProvider: STORAGE_PROVIDERS.S3,
                bucket: cfg.bucket,
                objectKey: key,
                mimeType,
                fileSize: buffer.length,
            };
        },

        async getObject({ objectKey }) {
            const key = assertExactObjectKey(objectKey);
            const res = await client.send(
                new GetObjectCommand({
                    Bucket: cfg.bucket,
                    Key: key,
                }),
            );
            const body = await streamToBuffer(res.Body);
            return {
                body,
                contentType: res.ContentType || null,
                contentLength: res.ContentLength ?? body.length,
                eTag: res.ETag || null,
            };
        },

        async deleteObject({ objectKey }) {
            const key = assertExactObjectKey(objectKey);
            await client.send(
                new DeleteObjectCommand({
                    Bucket: cfg.bucket,
                    Key: key,
                }),
            );
        },

        async objectExists({ objectKey }) {
            try {
                await this.getObjectMetadata({ objectKey });
                return true;
            } catch (e) {
                const code = e?.name || e?.Code || '';
                const status = e?.$metadata?.httpStatusCode;
                if (code === 'NotFound' || code === 'NoSuchKey' || status === 404) return false;
                throw e;
            }
        },

        async getObjectMetadata({ objectKey }) {
            const key = assertExactObjectKey(objectKey);
            const res = await client.send(
                new HeadObjectCommand({
                    Bucket: cfg.bucket,
                    Key: key,
                }),
            );
            return {
                objectKey: key,
                bucket: cfg.bucket,
                contentLength: res.ContentLength ?? null,
                contentType: res.ContentType || null,
                lastModified: res.LastModified || null,
                eTag: res.ETag || null,
            };
        },

        async getSignedUrl({
            objectKey,
            expiresInSeconds = DEFAULT_SIGNED_URL_EXPIRES_SECONDS,
            operation = 'getObject',
        }) {
            const key = assertExactObjectKey(objectKey);
            const expires = Math.max(1, Math.min(Number(expiresInSeconds) || DEFAULT_SIGNED_URL_EXPIRES_SECONDS, 3600));
            let command;
            if (operation === 'getObject') {
                command = new GetObjectCommand({ Bucket: cfg.bucket, Key: key });
            } else {
                throw new Error(`unsupported signed URL operation: ${operation}`);
            }
            const url = await awsGetSignedUrl(client, command, { expiresIn: expires });
            return { url, expiresInSeconds: expires };
        },
    };
}

export default createS3StorageProvider;
