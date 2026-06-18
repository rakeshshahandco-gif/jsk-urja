import path from 'path';
import { ScanEntryDraft } from '../../models/scanEntryDraft.model.js';
import { SCAN_ENTRY_UPLOAD_DIR } from '../../middlewares/scanEntryUpload.middleware.js';
import { logAudit } from './audit.service.js';
import { scheduleOcrForDraft } from './extract.service.js';
import { normalizePostingMode } from './postingMode.util.js';

export async function createDraftFromUpload({ file, moduleType, financialYear, userId, companyId, postingMode }) {
    const ext = path.extname(file.originalname || '').toLowerCase().replace('.', '');
    const publicUrl = `/${SCAN_ENTRY_UPLOAD_DIR}${file.filename}`.replace(/\\/g, '/');
    const extractedData = moduleType === 'purchase_invoice'
        ? { postingMode: normalizePostingMode(postingMode) }
        : {};
    const draft = await ScanEntryDraft.create({
        companyId: companyId || null,
        financialYear,
        moduleType,
        uploadFileUrl: publicUrl,
        storedFileName: file.filename,
        originalFileName: file.originalname || file.filename,
        fileType: ext || 'unknown',
        mimeType: file.mimetype || '',
        fileSize: file.size || 0,
        status: 'uploaded',
        uploadedBy: userId,
        extractedData,
        confidence: {},
    });
    await logAudit(draft._id, 'upload', userId, null, { moduleType, fileName: file.originalname, postingMode: extractedData.postingMode });
    scheduleOcrForDraft(draft._id.toString());
    return draft;
}

export async function createDraftsFromBulkUpload({ files, moduleType, financialYear, userId, companyId, postingMode }) {
    const out = [];
    for (const file of files) {
        out.push(await createDraftFromUpload({ file, moduleType, financialYear, userId, companyId, postingMode }));
    }
    return out;
}

