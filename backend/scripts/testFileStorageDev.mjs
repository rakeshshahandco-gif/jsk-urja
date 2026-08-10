/**
 * DEV-only FileStorageService smoke test against S3 (or local).
 * Never prints AWS credentials.
 *
 * Usage (from backend/):
 *   node --env-file=.env --env-file=.env.local scripts/testFileStorageDev.mjs
 *
 * Force provider:
 *   FILE_STORAGE_PROVIDER=s3 node --env-file=.env --env-file=.env.local scripts/testFileStorageDev.mjs
 */
import { randomUUID } from 'crypto';
import { createFileStorageService } from '../src/services/fileStorage/index.js';

const provider = String(process.env.FILE_STORAGE_PROVIDER || 's3').trim().toLowerCase() || 's3';
const storage = createFileStorageService({ provider });

const bodyText = `JSK CRM FileStorage DEV test ${new Date().toISOString()}`;
const buffer = Buffer.from(bodyText, 'utf8');
const objectKey = `test/file-storage-service/${randomUUID()}-dev-test.txt`;

console.log('PROVIDER', storage.providerName);
console.log('OBJECT_KEY_PREFIX', 'test/file-storage-service/');

const uploaded = await storage.uploadFile({
    companyId: 'dev-test-company',
    financialYearId: 'none',
    module: 'test',
    originalFileName: 'dev-test.txt',
    mimeType: 'text/plain',
    buffer,
    createdBy: 'file-storage-dev-test',
    objectKey,
});

console.log('UPLOAD', uploaded.objectKey ? 'PASS' : 'FAIL');
console.log('CHECKSUM_PRESENT', uploaded.checksum && uploaded.checksum.length === 64 ? 'PASS' : 'FAIL');
console.log('NO_BINARY_IN_META', uploaded.body === undefined && uploaded.buffer === undefined ? 'PASS' : 'FAIL');

const exists1 = await storage.fileExists({ objectKey: uploaded.objectKey });
console.log('EXISTS_AFTER_UPLOAD', exists1 ? 'PASS' : 'FAIL');

const meta = await storage.getMetadata({ objectKey: uploaded.objectKey });
console.log('METADATA', meta?.contentLength != null || meta?.objectKey ? 'PASS' : 'FAIL');

const signed = await storage.getSignedUrl({
    objectKey: uploaded.objectKey,
    expiresInSeconds: 120,
});
console.log('SIGNED_URL', signed?.url ? 'PASS' : 'FAIL');
console.log('SIGNED_EXPIRES', signed?.expiresInSeconds === 120 ? 'PASS' : 'FAIL');

// Access via GetObject (provider) — confirms private read path
const got = await storage.getObject({ objectKey: uploaded.objectKey });
const text = Buffer.isBuffer(got.body) ? got.body.toString('utf8') : '';
console.log('GET_OBJECT', text === bodyText ? 'PASS' : 'FAIL');

// HTTP fetch of signed URL (S3 only)
if (storage.providerName === 's3' && signed?.url?.startsWith('http')) {
    const res = await fetch(signed.url);
    const fetched = await res.text();
    console.log('SIGNED_URL_HTTP', res.ok && fetched === bodyText ? 'PASS' : 'FAIL');

    // Short-expiry confirm
    const short = await storage.getSignedUrl({
        objectKey: uploaded.objectKey,
        expiresInSeconds: 2,
    });
    await new Promise((r) => setTimeout(r, 3500));
    const expiredRes = await fetch(short.url);
    console.log('SIGNED_URL_EXPIRED', expiredRes.ok ? 'FAIL' : 'PASS');
} else {
    console.log('SIGNED_URL_HTTP', 'SKIP');
    console.log('SIGNED_URL_EXPIRED', 'SKIP');
}

await storage.deleteFile({ objectKey: uploaded.objectKey });
const exists2 = await storage.fileExists({ objectKey: uploaded.objectKey });
console.log('DELETE', !exists2 ? 'PASS' : 'FAIL');
console.log('TEMP_REMOVED', !exists2 ? 'YES' : 'NO');

const ok = exists1
    && uploaded.checksum
    && text === bodyText
    && !exists2;

process.exit(ok ? 0 : 1);
