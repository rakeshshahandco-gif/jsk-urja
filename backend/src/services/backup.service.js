import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import AdmZip from 'adm-zip';
import moment from 'moment';
import { ApiError } from '../utils/ApiError.js';
import httpStatus from 'http-status';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Paths
const BACKUP_DIR = path.join(__dirname, '../../backups');
const UPLOADS_DIR = path.join(__dirname, '../../uploads');

// Ensure backup directory exists
if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

/**
 * Helper to recursively convert string IDs back to ObjectIds
 */
const mapDocumentToBSON = (doc) => {
    if (Array.isArray(doc)) return doc.map(mapDocumentToBSON);
    if (doc !== null && typeof doc === 'object') {
        const newDoc = {};
        for (const [key, value] of Object.entries(doc)) {
            if (value === null) {
                newDoc[key] = null;
            } else if (Array.isArray(value)) {
                newDoc[key] = value.map(mapDocumentToBSON);
            } else if (typeof value === 'object') {
                newDoc[key] = mapDocumentToBSON(value);
            } else if (typeof value === 'string' && /^[0-9a-fA-F]{24}$/.test(value)) {
                // Heuristic: convert 24-char hex strings back to ObjectIds
                try {
                    newDoc[key] = new mongoose.Types.ObjectId(value);
                } catch (e) {
                    newDoc[key] = value;
                }
            } else {
                newDoc[key] = value;
            }
        }
        return newDoc;
    }
    return doc;
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
        collections: {},
        recordCounts: {}
    };

    try {
        // 1. Export Collections
        const collections = await db.listCollections().toArray();
        for (const col of collections) {
            const data = await db.collection(col.name).find({}).toArray();
            zip.addFile(`db/${col.name}.json`, Buffer.from(JSON.stringify(data, null, 2), 'utf8'));
            metadata.recordCounts[col.name] = data.length;
        }

        // 2. Export Uploads
        if (fs.existsSync(UPLOADS_DIR)) {
            zip.addLocalFolder(UPLOADS_DIR, 'uploads');
        }

        // 3. Add Metadata
        zip.addFile('metadata.json', Buffer.from(JSON.stringify(metadata, null, 2), 'utf8'));

        // 4. Save Zip
        zip.writeZip(zipPath);

        // 5. Update Backup Index
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
    const zipPath = path.join(BACKUP_DIR, `${backupId}.zip`);
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

    // 1. Create Safety Backup First
    await generateBackup(userId, `Auto-Safety Backup before restoring ${backupId}`);

    try {
        // 2. Restore DB Collections
        const zipEntries = zip.getEntries();
        for (const entry of zipEntries) {
            if (entry.entryName.startsWith('db/') && entry.entryName.endsWith('.json')) {
                const colName = entry.entryName.replace('db/', '').replace('.json', '');
                const data = JSON.parse(entry.getData().toString('utf8'));

                // Drop current collection
                try {
                    await db.collection(colName).drop();
                } catch (e) {
                    // Ignore if collection doesn't exist
                }

                // Insert data if not empty
                if (data.length > 0) {
                    const processedData = data.map(doc => mapDocumentToBSON(doc));
                    await db.collection(colName).insertMany(processedData);
                }
            }
        }

        // 3. Restore Uploads
        const uploadsEntry = zip.getEntry('uploads/');
        if (uploadsEntry) {
            zip.extractEntryTo('uploads/', path.join(UPLOADS_DIR, '..'), true, true);
        }

        return { success: true, message: `Restored ${Object.keys(metadata.recordCounts).length} collections` };
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
        const backupName = metadata.name || `uploaded-backup-${moment().format('YYYY-MM-DD-HHmm')}`;
        const zipPath = path.join(BACKUP_DIR, `${backupName}.zip`);

        // Save the buffer to disk
        fs.writeFileSync(zipPath, file.buffer);

        // Update Backup Index
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

        // Avoid duplicates in index
        index = index.filter(b => b.id !== backupName);
        index.unshift(backupEntry);
        if (index.length > 30) index = index.slice(0, 30);

        fs.writeFileSync(indexPath, JSON.stringify(index, null, 2));

        return backupEntry;
    } catch (error) {
        console.error('Processing uploaded backup failed:', error);
        throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to process backup file: ' + error.message);
    }
};

/**
 * Get backup file path for download
 */
export const getBackupFilePath = (backupId) => {
    const filePath = path.join(BACKUP_DIR, `${backupId}.zip`);
    if (!fs.existsSync(filePath)) {
        throw new ApiError(httpStatus.NOT_FOUND, 'Backup file not found');
    }
    return filePath;
};
