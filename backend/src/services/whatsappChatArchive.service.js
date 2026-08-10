/**
 * WhatsApp chat archive → FileStorage (S3 when configured).
 * Does NOT migrate/delete Mongo messages. Controlled batches only.
 * Never includes auth/session secrets.
 */
import zlib from 'zlib';
import { promisify } from 'util';
import WhatsAppMessage from '../models/whatsappMessage.model.js';
import { getFileStorageService } from './fileStorage/index.js';
import { ApiError } from '../utils/ApiError.js';

const gzip = promisify(zlib.gzip);

function yyyyMm(d = new Date()) {
    return {
        yyyy: String(d.getUTCFullYear()),
        mm: String(d.getUTCMonth() + 1).padStart(2, '0'),
    };
}

function sanitizeArchiveRow(doc) {
    return {
        messageId: doc.messageId || null,
        chatId: doc.conversationKey || doc.jid || null,
        jid: doc.jid || null,
        remoteJid: doc.remoteJid || null,
        timestamp: doc.timestamp || null,
        direction: doc.direction || null,
        fromMe: !!doc.fromMe,
        sender: doc.fromMe ? 'me' : (doc.participant || doc.jid || null),
        recipient: doc.fromMe ? (doc.jid || null) : 'me',
        text: doc.text || '',
        status: doc.deliveryStatus || (doc.read ? 'read' : 'unread'),
        read: !!doc.read,
        media: {
            mediaType: doc.mediaType || 'text',
            mimeType: doc.mediaMime || null,
            fileName: doc.mediaFilename || doc.originalFileName || null,
            storageProvider: doc.storageProvider || (doc.relativeFilePath ? 'local' : null),
            objectKey: doc.objectKey || null,
            relativeFilePath: doc.relativeFilePath || null,
            fileSize: doc.mediaSize || null,
            checksum: doc.mediaChecksum || null,
        },
    };
}

/**
 * Build NDJSON.gz archive for a date window and upload via FileStorageService.
 */
export async function createWhatsAppChatArchive({
    companyId,
    userId,
    whatsappAccountOrSessionId,
    from,
    to,
    limit = 5000,
    createdBy = null,
} = {}) {
    if (!companyId) throw new ApiError(400, 'companyId required');
    if (!userId) throw new ApiError(400, 'userId required');

    const fromDate = from ? new Date(from) : new Date(Date.now() - 7 * 24 * 3600 * 1000);
    const toDate = to ? new Date(to) : new Date();
    const lim = Math.min(Math.max(Number(limit) || 5000, 1), 20000);
    const sessionKey = String(whatsappAccountOrSessionId || userId);

    const docs = await WhatsAppMessage.find({
        userId,
        mediaType: { $ne: 'placeholder' },
        timestamp: { $gte: fromDate, $lte: toDate },
    })
        .sort({ timestamp: 1 })
        .limit(lim)
        .lean();

    const lines = docs.map((d) => JSON.stringify(sanitizeArchiveRow(d))).join('\n');
    const gz = await gzip(Buffer.from(lines || '', 'utf8'));
    const { yyyy, mm } = yyyyMm(toDate);
    const fileName = `chat-archive-${yyyy}-${mm}.json.gz`;
    const objectKey = [
        'company', String(companyId),
        'whatsapp',
        sessionKey,
        yyyy, mm,
        fileName,
    ].join('/');

    const storage = getFileStorageService();
    const meta = await storage.uploadFile({
        companyId,
        financialYearId: 'none',
        module: 'whatsapp',
        originalFileName: fileName,
        mimeType: 'application/gzip',
        buffer: gz,
        createdBy,
        objectKey,
        skipValidation: true,
    });

    return {
        archive: {
            storageProvider: meta.storageProvider,
            objectKey: meta.objectKey,
            originalFileName: fileName,
            mimeType: meta.mimeType,
            fileSize: meta.fileSize,
            checksum: meta.checksum,
            messageCount: docs.length,
            from: fromDate.toISOString(),
            to: toDate.toISOString(),
            generatedAt: new Date().toISOString(),
        },
    };
}

export async function getWhatsAppArchiveDownloadUrl({ objectKey, expiresInSeconds = 300 } = {}) {
    if (!objectKey || String(objectKey).includes('whatsapp-auth') || String(objectKey).includes('.whatsapp')) {
        throw new ApiError(400, 'Invalid archive object key');
    }
    const storage = getFileStorageService();
    const signed = await storage.getSignedUrl({ objectKey, expiresInSeconds });
    return {
        url: typeof signed === 'string' ? signed : signed?.url,
        expiresInSeconds,
        objectKey,
    };
}

/**
 * DRY-RUN only — counts eligible messages/media; does not upload or delete.
 */
export async function dryRunWhatsAppArchiveBackfill({ userId, sampleLimit = 1000 } = {}) {
    const match = { userId, mediaType: { $ne: 'placeholder' } };
    const totalMessages = await WhatsAppMessage.countDocuments(match);
    const mediaEligible = await WhatsAppMessage.countDocuments({
        ...match,
        mediaType: { $nin: ['text', 'placeholder', 'unsupported', ''] },
    });
    const withLocalPath = await WhatsAppMessage.countDocuments({
        ...match,
        relativeFilePath: { $nin: [null, ''] },
    });
    const withS3 = await WhatsAppMessage.countDocuments({
        ...match,
        objectKey: { $nin: [null, ''] },
        storageProvider: 's3',
    });
    const sample = await WhatsAppMessage.find(match)
        .sort({ timestamp: -1 })
        .limit(Math.min(sampleLimit, 200))
        .select('mediaType mediaSize relativeFilePath objectKey storageProvider')
        .lean();
    const estimatedBytes = sample.reduce((sum, d) => sum + (Number(d.mediaSize) || 0), 0);
    const avg = sample.length ? estimatedBytes / sample.length : 0;

    return {
        dryRun: true,
        messagesEligible: totalMessages,
        mediaEligible,
        localMediaFiles: withLocalPath,
        alreadyOnS3: withS3,
        estimatedS3Objects: mediaEligible + Math.ceil(totalMessages / 5000),
        estimatedBytesSampleAvg: Math.round(avg),
        estimatedBytesRough: Math.round(avg * mediaEligible),
        duplicates: 0,
        errors: 0,
        note: 'Historical Mongo records are NOT deleted or migrated by this report.',
    };
}
