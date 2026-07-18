import httpStatus from 'http-status';
import { asyncHandler } from '../utils/asyncHandler.js';
import * as printFormatVersionService from '../services/printFormatVersion.service.js';

const resolveUserId = (user) => user?._id || user?.id || null;

export const listPrintFormatVersions = asyncHandler(async (req, res) => {
    const data = await printFormatVersionService.listPrintFormatVersions(req.query);
    res.json({ success: true, data });
});

export const getPrintFormatVersion = asyncHandler(async (req, res) => {
    const data = await printFormatVersionService.getPrintFormatVersionById(req.params.id);
    res.json({ success: true, data });
});

export const createDraft = asyncHandler(async (req, res) => {
    const data = await printFormatVersionService.createDraftPrintFormatVersion(
        req.body,
        resolveUserId(req.user),
    );
    res.status(httpStatus.CREATED).json({
        success: true,
        data,
        message: 'Draft print format version created (not applied to live print)',
    });
});

export const copyVersion = asyncHandler(async (req, res) => {
    const data = await printFormatVersionService.copyPrintFormatVersion(
        req.params.id,
        req.body,
        resolveUserId(req.user),
    );
    res.status(httpStatus.CREATED).json({
        success: true,
        data,
        message: 'Draft copy created from existing format version',
    });
});

export const updateVersion = asyncHandler(async (req, res) => {
    const data = await printFormatVersionService.updatePrintFormatVersion(
        req.params.id,
        req.body,
        resolveUserId(req.user),
    );
    res.json({ success: true, data, message: 'Draft updated' });
});

export const approveVersion = asyncHandler(async (req, res) => {
    const data = await printFormatVersionService.approvePrintFormatVersion(
        req.params.id,
        resolveUserId(req.user),
    );
    res.json({ success: true, data, message: 'Format approved' });
});

export const setDefaultVersion = asyncHandler(async (req, res) => {
    const data = await printFormatVersionService.setDefaultPrintFormatVersion(
        req.params.id,
        resolveUserId(req.user),
    );
    res.json({
        success: true,
        data,
        message: 'Set as company default (live print still unchanged in Phase 5)',
    });
});

export const lockVersion = asyncHandler(async (req, res) => {
    const data = await printFormatVersionService.lockPrintFormatVersion(
        req.params.id,
        resolveUserId(req.user),
    );
    res.json({ success: true, data, message: 'Format locked' });
});

export const archiveVersion = asyncHandler(async (req, res) => {
    const data = await printFormatVersionService.archivePrintFormatVersion(
        req.params.id,
        resolveUserId(req.user),
    );
    res.json({ success: true, data, message: 'Format archived' });
});

export const previewVersion = asyncHandler(async (req, res) => {
    const data = await printFormatVersionService.previewPrintFormatVersion(req.params.id, {
        documentId: req.query.documentId || req.body?.documentId,
        documentNumber: req.query.documentNumber || req.body?.documentNumber,
    });
    res.json({ success: true, data });
});

export const getRegistry = asyncHandler(async (_req, res) => {
    res.json({ success: true, data: printFormatVersionService.getPrintFormatVersionRegistry() });
});
