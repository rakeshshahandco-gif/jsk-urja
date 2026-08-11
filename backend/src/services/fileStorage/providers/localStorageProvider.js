/**
 * Local filesystem provider for FileStorageService.
 * Does NOT replace existing multer/uploads/WhatsApp paths — isolated under storage/file-storage/.
 */
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { createReadStream } from 'fs';
import { STORAGE_PROVIDERS } from '../constants.js';
import { assertExactObjectKey } from '../keyBuilder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
/** backend/storage/file-storage */
export const LOCAL_FILE_STORAGE_ROOT = path.resolve(__dirname, '../../../../storage/file-storage');

function resolveSafePath(objectKey) {
    const key = assertExactObjectKey(objectKey);
    const abs = path.resolve(LOCAL_FILE_STORAGE_ROOT, ...key.split('/'));
    const root = path.resolve(LOCAL_FILE_STORAGE_ROOT);
    if (!abs.startsWith(root + path.sep) && abs !== root) {
        throw new Error('local object path escapes storage root');
    }
    return abs;
}

export function createLocalStorageProvider({ rootDir = LOCAL_FILE_STORAGE_ROOT } = {}) {
    const root = path.resolve(rootDir);

    return {
        name: STORAGE_PROVIDERS.LOCAL,

        async uploadObject({ objectKey, buffer, mimeType }) {
            const abs = (() => {
                const key = assertExactObjectKey(objectKey);
                const p = path.resolve(root, ...key.split('/'));
                if (!p.startsWith(root + path.sep) && p !== root) {
                    throw new Error('local object path escapes storage root');
                }
                return p;
            })();
            await fs.mkdir(path.dirname(abs), { recursive: true });
            await fs.writeFile(abs, buffer);
            return {
                storageProvider: STORAGE_PROVIDERS.LOCAL,
                bucket: null,
                objectKey: assertExactObjectKey(objectKey),
                mimeType,
                fileSize: buffer.length,
            };
        },

        async getObject({ objectKey }) {
            const abs = resolveSafePath(objectKey);
            const buffer = await fs.readFile(abs);
            return { body: buffer, contentType: null };
        },

        async deleteObject({ objectKey }) {
            const abs = resolveSafePath(objectKey);
            await fs.unlink(abs);
        },

        async objectExists({ objectKey }) {
            try {
                const abs = resolveSafePath(objectKey);
                await fs.access(abs);
                return true;
            } catch {
                return false;
            }
        },

        async getObjectMetadata({ objectKey }) {
            const abs = resolveSafePath(objectKey);
            const st = await fs.stat(abs);
            return {
                objectKey: assertExactObjectKey(objectKey),
                contentLength: st.size,
                contentType: null,
                lastModified: st.mtime,
                eTag: null,
            };
        },

        /**
         * Local "signed URL" is a file:// style path marker for DEV only — not a public URL.
         * Callers should prefer getObject for local provider.
         */
        async getSignedUrl({ objectKey, expiresInSeconds }) {
            const abs = resolveSafePath(objectKey);
            return {
                url: `file://${abs.replace(/\\/g, '/')}`,
                expiresInSeconds: Number(expiresInSeconds) || 0,
                note: 'local-provider-dev-path-not-http',
            };
        },

        createReadStream(objectKey) {
            const abs = resolveSafePath(objectKey);
            return createReadStream(abs);
        },
    };
}

export default createLocalStorageProvider;
