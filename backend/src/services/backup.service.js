import mongoose from 'mongoose';
import fs from 'fs';
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

const safeBackupId = (backupId) => {
    const base = path.basename(String(backupId || '').trim());
    if (!base || base.includes('..')) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid backup id');
    }
    return base;
};

/**
 * Legacy + edge-case BSON repair for backups created before EJSON export.
 */
const mapDocumentToBSON = (doc) => {
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

        const newDoc = {};
        for (const [key, value] of Object.entries(doc)) {
            if (value === null) {
                newDoc[key] = null;
            } else if (Array.isArray(value)) {
                newDoc[key] = value.map(mapDocumentToBSON);
            } else if (typeof value === 'object') {
                newDoc[key] = mapDocumentToBSON(value);
            } else if (typeof value === 'string' && /^[0-9a-fA-F]{24}$/.test(value)) {
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

const parseCollectionJson = (rawUtf8) => {
    let data;
    try {
        data = EJSON.parse(rawUtf8);
    } catch {
        data = JSON.parse(rawUtf8);
    }
    if (!Array.isArray(data)) {
        throw new Error('Collection data must be a JSON array');
    }
    return data.map((doc) => mapDocumentToBSON(doc));
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

/**
 * Generate a full database and uploads backup
 */
export const generateBackup = async (userId, reason = 'Manual Backup') => {
    const db = mongoose.connection.db;
    const dbName = mongoose.connection.name;
    const timestamp = moment().format('YYYY-MM-DD-HHmm');
    const env = process.env.NODE_ENV || 'production';
    const backupName = `${dbName}-backup-${timestamp}-${env}`;
    const zipPath = path.join(BACKUP_DIR, `${backupName}.zip`);

    const zip = new AdmZip();
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
        const collections = await db.listCollections().toArray();
        for (const col of collections) {
            const data = await db.collection(col.name).find({}).toArray();
            zip.addFile(
                `db/${col.name}.json`,
                Buffer.from(EJSON.stringify(data, { relaxed: false }), 'utf8')
            );
            metadata.recordCounts[col.name] = data.length;
            metadata.collections.push(col.name);
        }

        if (fs.existsSync(UPLOADS_DIR)) {
            zip.addLocalFolder(UPLOADS_DIR, 'uploads');
        }

        zip.addFile('metadata.json', Buffer.from(JSON.stringify(metadata, null, 2), 'utf8'));
        zip.writeZip(zipPath);

        const indexPath = path.join(BACKUP_DIR, 'index.json');
        let index = [];
        if (fs.existsSync(indexPath)) {
            index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
        }

        const backupEntry = {
            id: backupName,
            filename: `${backupName}.zip`,
            date: new Date(),
            reason,
            createdBy: userId,
            counts: metadata.recordCounts,
            size: fs.statSync(zipPath).size
        };

        index.unshift(backupEntry);
        if (index.length > 30) index = index.slice(0, 30);

        fs.writeFileSync(indexPath, JSON.stringify(index, null, 2));

        return backupEntry;
    } catch (error) {
        console.error('Backup generation failed:', error);
        throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Backup failed: ' + error.message);
    }
};

/**
 * List all available backups
 */
export const listBackups = () => {
    const indexPath = path.join(BACKUP_DIR, 'index.json');
    if (!fs.existsSync(indexPath)) return [];
    return JSON.parse(fs.readFileSync(indexPath, 'utf8'));
};

/**
 * Restore from a backup
 */
export const restoreBackup = async (backupId, userId) => {
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
    const db = mongoose.connection.db;
    const backupCollectionNames = new Set(
        metadata.collections?.length
            ? metadata.collections
            : Object.keys(metadata.recordCounts || {})
    );

    if (backupCollectionNames.size === 0) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid backup: no collections listed in metadata');
    }

    try {
        await generateBackup(userId, `Auto-Safety Backup before restoring ${id}`);
    } catch (safetyErr) {
        console.warn('[backup] Safety backup before restore failed (continuing):', safetyErr.message);
    }

    const restoredCollections = [];
    let totalDocs = 0;

    try {
        const zipEntries = zip.getEntries();
        for (const entry of zipEntries) {
            const entryName = normalizeZipEntryName(entry.entryName);
            if (!entryName.startsWith('db/') || !entryName.endsWith('.json')) continue;

            const colName = entryName.slice('db/'.length, -'.json'.length);
            if (!colName) continue;

            const data = parseCollectionJson(entry.getData().toString('utf8'));

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

        const droppedOrphans = await dropCollectionsNotInBackup(db, backupCollectionNames);
        const uploadsRestored = extractUploadsFromZip(zip);

        return {
            success: true,
            message: `Restored ${restoredCollections.length} collections (${totalDocs} documents), ${uploadsRestored} upload files`,
            restoredCollections,
            droppedOrphans,
            uploadsRestored,
            totalDocs
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

        const backupEntry = {
            id: backupName,
            filename: `${backupName}.zip`,
            date: new Date(),
            reason: metadata.reason || 'Uploaded Backup',
            createdBy: userId,
            counts: metadata.recordCounts || {},
            size: file.size
        };

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
    const filePath = path.join(BACKUP_DIR, `${id}.zip`);
    if (!fs.existsSync(filePath)) {
        throw new ApiError(httpStatus.NOT_FOUND, 'Backup file not found');
    }
    return filePath;
};
