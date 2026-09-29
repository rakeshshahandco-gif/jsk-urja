import { asyncHandler } from '../utils/asyncHandler.js';
import { SalesDocumentAudit } from '../models/salesDocumentAudit.model.js';

export const listSalesDocumentAudits = asyncHandler(async (req, res) => {
    const {
        dateFrom,
        dateTo,
        user,
        soNumber,
        invoiceNumber,
        action,
        source,
        requestId,
        limit = 100,
        page = 1,
    } = req.query;

    const filter = { forensicKind: 'SALES_DOCUMENT' };
    if (action) filter.action = String(action).trim();
    if (source) {
        filter.$or = [
            { creationSource: new RegExp(String(source).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') },
            { sourceModule: new RegExp(String(source).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') },
        ];
    }
    if (soNumber) {
        filter.salesOrderNumber = new RegExp(String(soNumber).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    }
    if (invoiceNumber) {
        const invRe = new RegExp(String(invoiceNumber).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        filter.$and = [...(filter.$and || []), {
            $or: [{ invoiceNumber: invRe }, { relatedInvoiceNumber: invRe }],
        }];
    }
    if (requestId) {
        filter.requestId = new RegExp(String(requestId).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    }
    if (user) {
        const q = String(user).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        filter.$and = [...(filter.$and || []), {
            $or: [
                { actorName: new RegExp(q, 'i') },
                { actorUsername: new RegExp(q, 'i') },
            ],
        }];
    }
    if (dateFrom || dateTo) {
        filter.occurredAt = {};
        if (dateFrom) filter.occurredAt.$gte = new Date(dateFrom);
        if (dateTo) {
            const end = new Date(dateTo);
            if (!String(dateTo).includes('T')) end.setHours(23, 59, 59, 999);
            filter.occurredAt.$lte = end;
        }
    }
    if (req.companyId) filter.companyId = req.companyId;

    const skip = (Number(page) - 1) * Number(limit);
    const [rows, total] = await Promise.all([
        SalesDocumentAudit.find(filter).sort({ occurredAt: -1 }).skip(skip).limit(Math.min(200, Number(limit) || 100)).lean(),
        SalesDocumentAudit.countDocuments(filter),
    ]);

    res.json({
        success: true,
        total,
        page: Number(page),
        data: rows,
    });
});

export const getSalesDocumentAuditById = asyncHandler(async (req, res) => {
    const row = await SalesDocumentAudit.findOne({ _id: req.params.id, forensicKind: 'SALES_DOCUMENT' }).lean();
    if (!row) {
        res.status(404).json({ success: false, message: 'Audit record not found' });
        return;
    }
    res.json({ success: true, data: row });
});
