import { ApiResponse } from '../utils/ApiResponse.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { listImportHistory, getImportHistoryById, buildFailedRowsExcel } from '../services/importCenter/importHistory.service.js';
import { saveMasterMapping, listMasterMappings } from '../services/importCenter/importLearning.service.js';

export const getHistory = asyncHandler(async (req, res) => {
    const { importType, financialYear, limit } = req.query;
    const results = await listImportHistory({
        companyId: req.companyId,
        importType,
        financialYear,
        limit,
    });
    res.send(new ApiResponse(200, { results }));
});

export const downloadHistoryErrors = asyncHandler(async (req, res) => {
    const history = await getImportHistoryById(req.params.id);
    if (!history) throw new ApiError(404, 'History not found');
    if (String(history.companyId) !== String(req.companyId)) throw new ApiError(403, 'Forbidden');
    const buffer = await buildFailedRowsExcel(history);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="import-errors-${history._id}.xlsx"`);
    res.send(Buffer.from(buffer));
});

export const saveLearning = asyncHandler(async (req, res) => {
    const { entityType, importedName, entityId, entityLabel } = req.body;
    if (!entityType || !importedName || !entityId) {
        throw new ApiError(400, 'entityType, importedName, entityId required');
    }
    const doc = await saveMasterMapping({
        companyId: req.companyId,
        entityType,
        importedName,
        entityId,
        entityLabel,
        userId: req.user.id,
    });
    res.send(new ApiResponse(201, doc, 'Mapping saved for future imports'));
});

export const getLearning = asyncHandler(async (req, res) => {
    const results = await listMasterMappings(req.companyId, req.query.entityType);
    res.send(new ApiResponse(200, { results }));
});
