import mongoose from 'mongoose';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import AdmZip from 'adm-zip';
import moment from 'moment';
import { EJSON } from 'bson';
import { ApiError } from '../utils/ApiError.js';
import httpStatus from 'http-status';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Paths
const BACKUP_DIR = path.join(__dirname, '../../backups');
const UPLOADS_DIR = path.join(__dirname, '../../uploads');

const INSERT_BATCH_SIZE = 500;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?$/;

// Ensure backup directory exists
if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

const normalizeZipEntryName = (entryName) => entryName.replace(/\\/g, '/');

/** MongoDB collection name (lowercase) → CRM model label for UI */
const COLLECTION_TO_UI = {
    customers: 'Customer',
    salesinvoices: 'SalesInvoice',
    salesorders: 'SalesOrder',
    items: 'Item',
    tasks: 'Task',
    purchaseorders: 'PurchaseOrder',
    wechatgroups: 'WeChatGroup',
    leads: 'Lead',
    users: 'User',
};

const buildUiCounts = (recordCounts = {}) => {
    const ui = {};
    for (const [col, count] of Object.entries(recordCounts)) {
        const uiKey = COLLECTION_TO_UI[col.toLowerCase()] || col;
        ui[uiKey] = count;
    }
    return ui;
};

const totalDocCount = (recordCounts = {}) =>
    Object.values(recordCounts).reduce((sum, n) => sum + (Number(n) || 0), 0);

const enrichBackupEntry = (entry) => {
    const counts = entry.counts || {};
    return {
        ...entry,
        counts,
        uiCounts: entry.uiCounts || buildUiCounts(counts),
        totalDocs: entry.totalDocs ?? totalDocCount(counts),
        collectionCount: entry.collectionCount ?? Object.keys(counts).length,
        dbName: entry.dbName || null,
    };
};

const safeBackupId = (backupId) => {
    const base = path.basename(String(backupId || '').trim());
    if (!base || base.includes('..')) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid backup id');
    }
    return base;
};

const isObjectIdInstance = (value) =>
    value instanceof mongoose.Types.ObjectId ||
    (value != null && typeof value === 'object' && value._bsontype === 'ObjectId');

const isPlainObject = (value) => {
    if (value == null || typeof value !== 'object') return false;
    if (Array.isArray(value) || isObjectIdInstance(value) || value instanceof Date) return false;
    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
};

/**
 * Legacy JSON backups only — never run on EJSON.parse() output (it corrupts ObjectIds to {}).
 */
const mapDocumentToBSON = (doc) => {
    if (isObjectIdInstance(doc)) return doc;
    if (doc instanceof Date) return doc;
    if (Array.isArray(doc)) return doc.map(mapDocumentToBSON);
    if (doc !== null && typeof doc === 'object') {
        if (doc.$oid && typeof doc.$oid === 'string') {
            try {
                return new mongoose.Types.ObjectId(doc.$oid);
            } catch {
                return doc;
            }
        }
        if (doc.$date !== undefined) {
            return new Date(doc.$date);
        }
        if (!isPlainObject(doc)) return doc;

        const newDoc = {};
        for (const [key, value] of Object.entries(doc)) {
            if (value === null) {
                newDoc[key] = null;
            } else if (Array.isArray(value)) {
                newDoc[key] = value.map(mapDocumentToBSON);
            } else if (isObjectIdInstance(value)) {
                newDoc[key] = value;
            } else if (value instanceof Date) {
                newDoc[key] = value;
            } else if (typeof value === 'object') {
                newDoc[key] = mapDocumentToBSON(value);
            } else if (
                typeof value === 'string' &&
                /^[0-9a-fA-F]{24}$/.test(value) &&
                (key === '_id' || key.endsWith('Id') || key.endsWith('ID'))
            ) {
                try {
                    newDoc[key] = new mongoose.Types.ObjectId(value);
                } catch {
                    newDoc[key] = value;
                }
            } else if (typeof value === 'string' && ISO_DATE_RE.test(value)) {
                const d = new Date(value);
                newDoc[key] = Number.isNaN(d.getTime()) ? value : d;
            } else {
                newDoc[key] = value;
            }
        }
        return newDoc;
    }
    return doc;
};

const fixIdValue = (value) => {
    if (isObjectIdInstance(value)) return value;
    if (typeof value === 'string' && /^[0-9a-fA-F]{24}$/.test(value)) {
        return new mongoose.Types.ObjectId(value);
    }
    if (value && typeof value === 'object' && value.$oid) {
        return new mongoose.Types.ObjectId(value.$oid);
    }
    if (isPlainObject(value) && Object.keys(value).length === 0) {
        return null;
    }
    return value;
};

const normalizeRestoredDocument = (doc) => {
    if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return doc;

    const walk = (node) => {
        for (const [key, value] of Object.entries(node)) {
            if (value == null) continue;
            const isIdKey = key === '_id' || key.endsWith('Id') || key.endsWith('ID');
            if (isIdKey) {
                const fixed = fixIdValue(value);
                if (fixed === null) delete node[key];
                else node[key] = fixed;
            } else if (Array.isArray(value)) {
                for (const item of value) {
                    if (item && typeof item === 'object') walk(item);
                }
            } else if (isPlainObject(value)) {
                walk(value);
            }
        }
    };

    walk(doc);
    return doc;
};

const validateDocumentsForInsert = (colName, documents) => {
    for (let i = 0; i < documents.length; i++) {
        const doc = documents[i];
        if (!doc?._id || !isObjectIdInstance(doc._id)) {
            throw new Error(
                `Collection "${colName}" row ${i + 1} has invalid _id after restore. ` +
                    'Re-run restore using repairRestoreFromZip.mjs with your downloaded ZIP.'
            );
        }
    }
};

const parseCollectionJson = (rawUtf8) => {
    let data;
    let fromEjson = false;
    try {
        data = EJSON.parse(rawUtf8);
        fromEjson = true;
    } catch {
        data = JSON.parse(rawUtf8);
    }
    if (!Array.isArray(data)) {
        throw new Error('Collection data must be a JSON array');
    }
    const mapped = fromEjson ? data : data.map((doc) => mapDocumentToBSON(doc));
    return mapped.map((doc) => normalizeRestoredDocument(doc));
};

const insertInBatches = async (collection, documents) => {
    for (let i = 0; i < documents.length; i += INSERT_BATCH_SIZE) {
        const batch = documents.slice(i, i + INSERT_BATCH_SIZE);
        await collection.insertMany(batch, { ordered: false });
    }
};

const extractUploadsFromZip = (zip) => {
    const entries = zip.getEntries().filter((entry) => {
        const name = normalizeZipEntryName(entry.entryName);
        return name.startsWith('uploads/') && !entry.isDirectory;
    });

    if (entries.length === 0) return 0;

    if (fs.existsSync(UPLOADS_DIR)) {
        fs.rmSync(UPLOADS_DIR, { recursive: true, force: true });
    }
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });

    for (const entry of entries) {
        const relPath = normalizeZipEntryName(entry.entryName).replace(/^uploads\//, '');
        if (!relPath) continue;
        const destPath = path.join(UPLOADS_DIR, relPath);
        fs.mkdirSync(path.dirname(destPath), { recursive: true });
        fs.writeFileSync(destPath, entry.getData());
    }

    return entries.length;
};

/**
 * Restore all db/* collections from a ZIP buffer or path (shared by UI restore + CLI repair).
 */
export const restoreCollectionsFromZip = async (zip, metadata = {}) => {
    const db = mongoose.connection.db;
    const backupCollectionNames = new Set(
        metadata.collections?.length
            ? metadata.collections
            : Object.keys(metadata.recordCounts || {})
    );

    const restoredCollections = [];
    let totalDocs = 0;

    const zipEntries = zip.getEntries();
    for (const entry of zipEntries) {
        const entryName = normalizeZipEntryName(entry.entryName);
        if (!entryName.startsWith('db/') || !entryName.endsWith('.json')) continue;

        const colName = entryName.slice('db/'.length, -'.json'.length);
        if (!colName) continue;

        const data = parseCollectionJson(entry.getData().toString('utf8'));
        validateDocumentsForInsert(colName, data);

        try {
            await db.collection(colName).drop();
        } catch {
            // collection may not exist
        }

        if (data.length > 0) {
            await insertInBatches(db.collection(colName), data);
        }

        restoredCollections.push(colName);
        totalDocs += data.length;
        backupCollectionNames.add(colName);
    }

    const droppedOrphans =
        backupCollectionNames.size > 0
            ? await dropCollectionsNotInBackup(db, backupCollectionNames)
            : [];
    const uploadsRestored = extractUploadsFromZip(zip);

    return {
        restoredCollections,
        droppedOrphans,
        uploadsRestored,
        totalDocs,
        collectionCount: restoredCollections.length,
    };
};

/** CLI / one-shot repair from a downloaded ZIP path */
export const repairDatabaseFromZip = async (zipFilePath) => {
    const resolved = path.resolve(zipFilePath);
    if (!fs.existsSync(resolved)) {
        throw new ApiError(httpStatus.NOT_FOUND, `ZIP not found: ${resolved}`);
    }

    const zip = new AdmZip(resolved);
    const metadataEntry = zip.getEntry('metadata.json');
    if (!metadataEntry) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid backup: metadata.json missing');
    }
    const metadata = JSON.parse(metadataEntry.getData().toString('utf8'));

    const result = await restoreCollectionsFromZip(zip, metadata);
    return {
        success: true,
        message: `Repaired ${result.collectionCount} collections (${result.totalDocs} documents) from ${path.basename(resolved)}`,
        ...result,
    };
};

const dropCollectionsNotInBackup = async (db, backupCollectionNames) => {
    const localCollections = await db.listCollections().toArray();
    const dropped = [];
    for (const col of localCollections) {
        if (!backupCollectionNames.has(col.name)) {
            await db.collection(col.name).drop();
            dropped.push(col.name);
        }
    }
    return dropped;
};

const INDEX_PATH = path.join(BACKUP_DIR, 'index.json');
const ACTIVE_BACKUP_STATUSES = new Set(['Queued', 'Running']);
let backupMutex = false;
let recoveredStaleJobs = false;

const readIndex = () => {
    if (!fs.existsSync(INDEX_PATH)) return [];
    try {
        const index = JSON.parse(fs.readFileSync(INDEX_PATH, 'utf8'));
        return Array.isArray(index) ? index : [];
    } catch {
        return [];
    }
};

const writeIndex = (index) => {
    const trimmed = index.slice(0, 40);
    fs.writeFileSync(INDEX_PATH, JSON.stringify(trimmed, null, 2));
};

const sanitizeBackupError = (error) => {
    let msg = String(error?.message || error || 'Backup failed');
    msg = msg.replace(/mongodb(\+srv)?:\/\/\S+/gi, '[redacted-mongo-uri]');
    msg = msg.replace(/\/\/([^:/@]+):([^@/]+)@/g, '//$1:****@');
    return msg.replace(/\s+/g, ' ').trim().slice(0, 280);
};

const upsertIndexEntry = (entry) => {
    const index = readIndex().filter((b) => b.id !== entry.id);
    index.unshift(entry);
    writeIndex(index);
    return enrichBackupEntry(entry);
};

export const recoverStaleBackupJobs = () => {
    if (recoveredStaleJobs) return;
    recoveredStaleJobs = true;
    const index = readIndex();
    let changed = false;
    const next = index.map((entry) => {
        if (!ACTIVE_BACKUP_STATUSES.has(entry.status)) return entry;
        changed = true;
        return {
            ...entry,
            status: 'Failed',
            error: 'Server restarted before backup completed.',
            finishedAt: new Date().toISOString(),
        };
    });
    if (changed) writeIndex(next);
};

const reapOrphanActiveJobs = () => {
    if (backupMutex) return;
    const index = readIndex();
    let changed = false;
    const next = index.map((entry) => {
        if (!ACTIVE_BACKUP_STATUSES.has(entry.status)) return entry;
        changed = true;
        return {
            ...entry,
            status: 'Failed',
            error: 'Backup worker is no longer running.',
            finishedAt: new Date().toISOString(),
        };
    });
    if (changed) writeIndex(next);
};

export const getActiveBackupJob = () => {
    recoverStaleBackupJobs();
    reapOrphanActiveJobs();
    return readIndex().find((b) => ACTIVE_BACKUP_STATUSES.has(b.status)) || null;
};

/**
 * Generate a full database and uploads backup (read collections only; writes ZIP on disk).
 */
export const generateBackup = async (userId, reason = 'Manual Backup', options = {}) => {
    const { backupName: requestedName, recordInIndex = true, alreadyLocked = false } = options;
    if (!alreadyLocked) {
        if (backupMutex) {
            throw new ApiError(httpStatus.CONFLICT, 'A full backup is already in progress.');
        }
        backupMutex = true;
    }

    const db = mongoose.connection.db;
    const dbName = mongoose.connection.name;
    const timestamp = moment().format('YYYY-MM-DD-HHmm');
    const env = process.env.NODE_ENV || 'production';
    const backupName = requestedName || `${dbName}-backup-${timestamp}-${env}`;
    const zipPath = path.join(BACKUP_DIR, `${backupName}.zip`);
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jsk-crm-backup-'));

    const metadata = {
        name: backupName,
        dbName,
        timestamp,
        env,
        reason,
        createdBy: userId,
        formatVersion: 2,
        collections: [],
        recordCounts: {}
    };

    try {
        fs.mkdirSync(path.join(tmpDir, 'db'), { recursive: true });
        const collections = await db.listCollections().toArray();
        for (const col of collections) {
            const data = await db.collection(col.name).find({}).toArray();
            fs.writeFileSync(
                path.join(tmpDir, 'db', `${col.name}.json`),
                EJSON.stringify(data, { relaxed: false }),
                'utf8'
            );
            metadata.recordCounts[col.name] = data.length;
            metadata.collections.push(col.name);
        }

        if (fs.existsSync(UPLOADS_DIR)) {
            const destUploads = path.join(tmpDir, 'uploads');
            fs.cpSync(UPLOADS_DIR, destUploads, { recursive: true });
        }

        fs.writeFileSync(path.join(tmpDir, 'metadata.json'), JSON.stringify(metadata, null, 2));

        const zip = new AdmZip();
        zip.addLocalFolder(tmpDir, '');
        zip.writeZip(zipPath);
        fs.rmSync(tmpDir, { recursive: true, force: true });

        metadata.uiCounts = buildUiCounts(metadata.recordCounts);

        const backupEntry = enrichBackupEntry({
            id: backupName,
            filename: `${backupName}.zip`,
            date: new Date(),
            reason,
            createdBy: userId,
            status: 'Completed',
            counts: metadata.recordCounts,
            uiCounts: metadata.uiCounts,
            totalDocs: totalDocCount(metadata.recordCounts),
            collectionCount: metadata.collections.length,
            dbName: metadata.dbName,
            size: fs.statSync(zipPath).size,
        });

        if (recordInIndex) {
            upsertIndexEntry(backupEntry);
        }

        return backupEntry;
    } catch (error) {
        try {
            if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
        } catch {
            /* ignore temp cleanup */
        }
        console.error('Backup generation failed:', sanitizeBackupError(error));
        throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Backup failed: ' + sanitizeBackupError(error));
    } finally {
        if (!alreadyLocked) backupMutex = false;
    }
};

export const startBackupJob = (userId, reason = 'Manual Backup') => {
    recoverStaleBackupJobs();
    if (backupMutex) {
        const err = new ApiError(httpStatus.CONFLICT, 'A full backup is already in progress.');
        err.details = { job: getActiveBackupJob() };
        throw err;
    }
    const active = getActiveBackupJob();
    if (active) {
        const err = new ApiError(httpStatus.CONFLICT, 'A full backup is already in progress.');
        err.details = { job: active };
        throw err;
    }

    backupMutex = true;

    const dbName = mongoose.connection.name;
    const timestamp = moment().format('YYYY-MM-DD-HHmmss');
    const env = process.env.NODE_ENV || 'production';
    const backupName = `${dbName}-backup-${timestamp}-${env}`;
    const job = {
        id: backupName,
        filename: `${backupName}.zip`,
        date: new Date(),
        reason,
        createdBy: userId,
        status: 'Queued',
        dbName,
        counts: {},
        totalDocs: 0,
        collectionCount: 0,
        size: 0,
    };
    try {
        upsertIndexEntry(job);
    } catch (error) {
        backupMutex = false;
        throw error;
    }

    setImmediate(() => {
        runBackupJob(job.id, userId, reason)
            .catch((error) => {
                console.error('[backup] background job failed:', sanitizeBackupError(error));
            })
            .finally(() => {
                backupMutex = false;
            });
    });

    return enrichBackupEntry(job);
};

const runBackupJob = async (backupName, userId, reason) => {
    const running = {
        ...readIndex().find((b) => b.id === backupName),
        status: 'Running',
        startedAt: new Date().toISOString(),
    };
    upsertIndexEntry(running);
    try {
        const completed = await generateBackup(userId, reason, {
            backupName,
            recordInIndex: false,
            alreadyLocked: true,
        });
        upsertIndexEntry({
            ...completed,
            status: 'Completed',
            startedAt: running.startedAt,
            finishedAt: new Date().toISOString(),
        });
    } catch (error) {
        upsertIndexEntry({
            ...running,
            status: 'Failed',
            error: sanitizeBackupError(error),
            finishedAt: new Date().toISOString(),
        });
    }
};

/**
 * List all available backups
 */
export const listBackups = () => {
    recoverStaleBackupJobs();
    reapOrphanActiveJobs();
    return readIndex().map((entry) =>
        enrichBackupEntry({
            ...entry,
            status: entry.status || 'Completed',
        })
    );
};

export const getBackupJob = (backupId) => {
    const id = safeBackupId(backupId);
    const job = listBackups().find((b) => b.id === id);
    if (!job) throw new ApiError(httpStatus.NOT_FOUND, 'Backup job not found');
    return job;
};

/**
 * Restore from a backup
 */
const assertLocalhostRestoreTarget = () => {
    const dbName = String(mongoose.connection?.name || '').trim();
    const uri = String(process.env.MONGODB_URL || process.env.MONGO_URI || '');
    const uriTargetsProd = /\/jskurja-prod(\?|$)/i.test(uri);
    // Localhost restore is allowed ONLY into jskurja-dev
    if (dbName.toLowerCase() !== 'jskurja-dev' || uriTargetsProd) {
        throw new ApiError(
            httpStatus.FORBIDDEN,
            'RESTORE BLOCKED: Production database cannot be used as localhost restore target.'
        );
    }
    return dbName;
};

export const restoreBackup = async (backupId, userId) => {
    const targetDatabase = assertLocalhostRestoreTarget();
    const id = safeBackupId(backupId);
    const zipPath = path.join(BACKUP_DIR, `${id}.zip`);
    if (!fs.existsSync(zipPath)) {
        throw new ApiError(httpStatus.NOT_FOUND, 'Backup file not found');
    }

    const zip = new AdmZip(zipPath);
    const metadataEntry = zip.getEntry('metadata.json');
    if (!metadataEntry) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid backup file: metadata missing');
    }

    const metadata = JSON.parse(metadataEntry.getData().toString('utf8'));
    const backupSourceDatabase = metadata.dbName || metadata.sourceDatabase || null;
    const backupCollectionNames = new Set(
        metadata.collections?.length
            ? metadata.collections
            : Object.keys(metadata.recordCounts || {})
    );

    if (backupCollectionNames.size === 0) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid backup: no collections listed in metadata');
    }

    console.log(
        `[backup] restore start backupId=${id} backupSourceDatabase=${backupSourceDatabase || 'unknown'} restoreTargetDatabase=${targetDatabase}`
    );

    let safetyBackupId = null;
    try {
        const safety = await generateBackup(userId, `Auto-Safety Backup before restoring ${id}`);
        safetyBackupId = safety?.id || safety?.name || null;
        console.log(`[backup] safety snapshot created: ${safetyBackupId}`);
    } catch (safetyErr) {
        console.warn('[backup] Safety backup before restore failed (continuing):', safetyErr.message);
    }

    try {
        const result = await restoreCollectionsFromZip(zip, metadata);

        return {
            success: true,
            message: `Database restoration completed successfully. Restored ${result.collectionCount} collections (${result.totalDocs} documents), ${result.uploadsRestored} upload files`,
            backupId: id,
            backupSourceDatabase,
            targetDatabase,
            safetyBackupId,
            ...result,
        };
    } catch (error) {
        console.error('Restore failed:', error);
        throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Restore failed: ' + error.message);
    }
};

/**
 * Process an uploaded backup file
 */
export const processUploadedBackup = async (file, userId) => {
    if (!file || !file.buffer) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'No file uploaded');
    }

    try {
        const zip = new AdmZip(file.buffer);
        const metadataEntry = zip.getEntry('metadata.json');

        if (!metadataEntry) {
            throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid backup file: metadata.json missing');
        }

        const metadata = JSON.parse(metadataEntry.getData().toString('utf8'));
        const backupName = safeBackupId(
            metadata.name || `uploaded-backup-${moment().format('YYYY-MM-DD-HHmm')}`
        );
        const zipPath = path.join(BACKUP_DIR, `${backupName}.zip`);

        fs.writeFileSync(zipPath, file.buffer);

        const indexPath = path.join(BACKUP_DIR, 'index.json');
        let index = [];
        if (fs.existsSync(indexPath)) {
            index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
        }

        const recordCounts = metadata.recordCounts || {};
        const backupEntry = enrichBackupEntry({
            id: backupName,
            filename: `${backupName}.zip`,
            date: new Date(),
            reason: metadata.reason || 'Uploaded Backup',
            createdBy: userId,
            status: 'Completed',
            counts: recordCounts,
            uiCounts: metadata.uiCounts || buildUiCounts(recordCounts),
            totalDocs: totalDocCount(recordCounts),
            collectionCount: (metadata.collections || Object.keys(recordCounts)).length,
            dbName: metadata.dbName,
            size: file.size
        });

        index = index.filter((b) => b.id !== backupName);
        index.unshift(backupEntry);
        if (index.length > 30) index = index.slice(0, 30);

        fs.writeFileSync(indexPath, JSON.stringify(index, null, 2));

        return backupEntry;
    } catch (error) {
        if (error instanceof ApiError) throw error;
        console.error('Processing uploaded backup failed:', error);
        throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to process backup file: ' + error.message);
    }
};

/**
 * Get backup file path for download
 */
export const getBackupFilePath = (backupId) => {
    const id = safeBackupId(backupId);
    const job = readIndex().find((b) => b.id === id);
    if (job && job.status && job.status !== 'Completed') {
        throw new ApiError(httpStatus.BAD_REQUEST, `Backup is not ready to download (status: ${job.status}).`);
    }
    const filePath = path.join(BACKUP_DIR, `${id}.zip`);
    if (!fs.existsSync(filePath)) {
        throw new ApiError(httpStatus.NOT_FOUND, 'Backup file not found');
    }
    return filePath;
};

const deletingBackupIds = new Set();

/**
 * Delete one backup ZIP and its history row only. Never touches MongoDB/CRM data.
 */
export const deleteBackup = (backupId) => {
    const id = safeBackupId(backupId);
    if (deletingBackupIds.has(id)) {
        throw new ApiError(httpStatus.CONFLICT, 'This backup is already being deleted.');
    }
    deletingBackupIds.add(id);
    try {
        const index = readIndex();
        const job = index.find((b) => b.id === id);
        if (!job) {
            throw new ApiError(httpStatus.NOT_FOUND, 'Backup not found in history.');
        }
        const status = job.status || 'Completed';
        if (ACTIVE_BACKUP_STATUSES.has(status)) {
            throw new ApiError(
                httpStatus.CONFLICT,
                'Cannot delete a backup that is still in progress.'
            );
        }

        const zipPath = path.join(BACKUP_DIR, `${id}.zip`);
        let archiveMissing = false;
        if (fs.existsSync(zipPath)) {
            fs.unlinkSync(zipPath);
        } else {
            archiveMissing = true;
        }

        writeIndex(index.filter((b) => b.id !== id));

        return {
            id,
            archiveMissing,
            message: archiveMissing
                ? 'Backup archive was already missing. History entry removed.'
                : 'Backup archive deleted. CRM data was not changed.',
        };
    } finally {
        deletingBackupIds.delete(id);
    }
};
