/**
 * Common File Storage facade.
 * Provider selected by FILE_STORAGE_PROVIDER (default: local).
 * Does not wire CRM modules; returns metadata/reference only (no binary in Mongo).
 */
import crypto from 'crypto';
import {
    DEFAULT_SIGNED_URL_EXPIRES_SECONDS,
    DEFAULT_STORAGE_PROVIDER,
    STORAGE_PROVIDERS,
} from './constants.js';
import { buildObjectKey, assertExactObjectKey } from './keyBuilder.js';
import { validateUploadInput } from './fileValidation.js';
import { createLocalStorageProvider } from './providers/localStorageProvider.js';
import { createS3StorageProvider } from './providers/s3StorageProvider.js';

function resolveProviderName(explicit) {
    const raw = String(explicit || process.env.FILE_STORAGE_PROVIDER || DEFAULT_STORAGE_PROVIDER)
        .trim()
        .toLowerCase();
    if (!raw) return DEFAULT_STORAGE_PROVIDER;
    if (raw === STORAGE_PROVIDERS.S3 || raw === STORAGE_PROVIDERS.LOCAL) return raw;
    throw new Error(`Unsupported FILE_STORAGE_PROVIDER: ${raw}`);
}

function createProvider(name) {
    if (name === STORAGE_PROVIDERS.S3) return createS3StorageProvider();
    return createLocalStorageProvider();
}

function sha256Hex(buffer) {
    return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * @param {{ provider?: 'local'|'s3' }} [options]
 */
export function createFileStorageService(options = {}) {
    const providerName = resolveProviderName(options.provider);
    const provider = options.providerInstance || createProvider(providerName);

    return {
        providerName,
        provider,

        /**
         * Upload a file buffer. Returns metadata/reference only (no binary).
         */
        async uploadFile({
            companyId,
            financialYearId,
            module: moduleName,
            originalFileName,
            mimeType,
            buffer,
            createdBy = null,
            objectKey: explicitKey = null,
            skipValidation = false,
            maxBytes,
            allowedExtensions,
            allowedMimeTypes,
        } = {}) {
            if (!skipValidation) {
                validateUploadInput({
                    originalFileName,
                    mimeType,
                    buffer,
                    maxBytes,
                    allowedExtensions,
                    allowedMimeTypes,
                });
            } else if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
                throw new Error('buffer is required');
            }

            const objectKey = explicitKey
                ? assertExactObjectKey(explicitKey)
                : buildObjectKey({
                    companyId,
                    financialYearId,
                    module: moduleName,
                    originalFileName,
                });

            const checksum = sha256Hex(buffer);
            const uploaded = await provider.uploadObject({
                objectKey,
                buffer,
                mimeType,
            });

            return {
                storageProvider: uploaded.storageProvider || providerName,
                bucket: uploaded.bucket ?? (provider.bucket || null),
                objectKey,
                originalFileName: String(originalFileName || ''),
                mimeType: String(mimeType || ''),
                fileSize: buffer.length,
                checksum,
                companyId: companyId != null ? String(companyId) : null,
                financialYearId: financialYearId != null ? String(financialYearId) : null,
                module: moduleName != null ? String(moduleName) : null,
                createdBy: createdBy != null ? String(createdBy) : null,
                createdAt: new Date().toISOString(),
            };
        },

        async getSignedUrl({
            objectKey,
            expiresInSeconds = DEFAULT_SIGNED_URL_EXPIRES_SECONDS,
            operation = 'getObject',
        } = {}) {
            return provider.getSignedUrl({
                objectKey: assertExactObjectKey(objectKey),
                expiresInSeconds,
                operation,
            });
        },

        async downloadFile({ objectKey } = {}) {
            return provider.getObject({ objectKey: assertExactObjectKey(objectKey) });
        },

        async getObject({ objectKey } = {}) {
            return this.downloadFile({ objectKey });
        },

        async deleteFile({ objectKey } = {}) {
            const key = assertExactObjectKey(objectKey);
            await provider.deleteObject({ objectKey: key });
            return { deleted: true, objectKey: key };
        },

        async fileExists({ objectKey } = {}) {
            return provider.objectExists({ objectKey: assertExactObjectKey(objectKey) });
        },

        async getMetadata({ objectKey } = {}) {
            return provider.getObjectMetadata({ objectKey: assertExactObjectKey(objectKey) });
        },
    };
}

/** Default singleton factory — lazy, so local default does not require AWS env. */
let _defaultService = null;
let _defaultProviderName = null;

export function getFileStorageService() {
    const name = resolveProviderName();
    if (!_defaultService || _defaultProviderName !== name) {
        _defaultService = createFileStorageService({ provider: name });
        _defaultProviderName = name;
    }
    return _defaultService;
}

export default getFileStorageService;
