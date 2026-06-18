import ExcelJS from 'exceljs';
import { ImportHistoryLog } from '../../models/importHistoryLog.model.js';

export async function logImportHistory(payload) {
    return ImportHistoryLog.create({
        companyId: payload.companyId || null,
        financialYear: payload.financialYear || '',
        importType: payload.importType,
        sourceModule: payload.sourceModule || 'import_center',
        batchId: payload.batchId || null,
        fileName: payload.fileName || '',
        recordsTotal: payload.recordsTotal || 0,
        recordsSuccess: payload.recordsSuccess || 0,
        recordsFailed: payload.recordsFailed || 0,
        status: payload.status || 'validated',
        dryRun: !!payload.dryRun,
        errorSummary: payload.errorSummary || '',
        failedRows: payload.failedRows || [],
        userId: payload.userId || null,
    });
}

export async function listImportHistory({ companyId, importType, financialYear, limit = 50 }) {
    const q = {};
    if (companyId) q.companyId = companyId;
    if (importType) q.importType = importType;
    if (financialYear) q.financialYear = financialYear;
    const results = await ImportHistoryLog.find(q).sort({ createdAt: -1 }).limit(Number(limit)).lean();
    return results;
}

export async function getImportHistoryById(id) {
    return ImportHistoryLog.findById(id).lean();
}

export async function buildFailedRowsExcel(history) {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Failed Rows');
    ws.addRow(['Row', 'Reason']);
    for (const row of history.failedRows || []) {
        ws.addRow([row.rowNumber ?? '', row.reason ?? '']);
    }
    return wb.xlsx.writeBuffer();
}
