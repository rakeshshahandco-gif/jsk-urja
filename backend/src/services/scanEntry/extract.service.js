import { ScanEntryDraft } from '../../models/scanEntryDraft.model.js';
import path from 'path';
import { runOcr } from './ocrAdapter.js';
import { logAudit } from './audit.service.js';
import { autoMapDraft } from './mapping.service.js';
import { validateDraft } from './validation.service.js';
import { checkDuplicate } from './duplicateCheck.service.js';
import { SCAN_ENTRY_UPLOAD_DIR } from '../../middlewares/scanEntryUpload.middleware.js';

export function scheduleOcrForDraft(draftId) {
    setImmediate(() => processOcr(draftId).catch(() => {}));
}

export async function processOcr(draftId) {
    const draft = await ScanEntryDraft.findById(draftId);
    if (!draft || draft.deletedAt) return;
    draft.status = 'ocr_processing';
    await draft.save();
    try {
        const filePath = path.join(SCAN_ENTRY_UPLOAD_DIR, draft.storedFileName || '');
        const result = await runOcr({
            moduleType: draft.moduleType,
            filePath,
            mimeType: draft.mimeType || '',
        });
        draft.ocrRawText = result.rawText || '';
        const savedPostingMode = draft.extractedData?.postingMode;
        draft.extractedData = {
            ...(result.extractedData || {}),
            ...(savedPostingMode ? { postingMode: savedPostingMode } : {}),
        };
        draft.confidence = result.confidence || {};
        if (result.error) {
            draft.status = 'needs_review';
            draft.ocrErrorMessage = result.error;
        } else {
            draft.status = 'ocr_completed';
            draft.ocrErrorMessage = '';
        }
        await draft.save();
        await logAudit(draft._id, 'ocr_complete', draft.uploadedBy, null, { status: draft.status });
        await autoMapDraft(draft._id);
        await validateDraft(draft._id);
        await checkDuplicate(draft._id);
    } catch (err) {
        draft.status = 'error';
        draft.ocrErrorMessage = 'OCR could not process this file. You can manually fill details and attach this document.';
        await draft.save();
        await logAudit(draft._id, 'ocr_error', draft.uploadedBy, null, { message: err.message });
    }
}

