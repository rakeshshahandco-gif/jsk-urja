import * as reconService from '../services/gstReconciliation.service.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import httpStatus from 'http-status';

export const importPortalData = asyncHandler(async (req, res) => {
    const { records, financialYear, month, source } = req.body;
    if (!records || !financialYear || !month) {
        return res.status(httpStatus.BAD_REQUEST).json(new ApiResponse(httpStatus.BAD_REQUEST, null, 'Missing required fields'));
    }
    const results = await reconService.importGstrData(records, financialYear, month, source || '2B', req.user.id);
    res.json(new ApiResponse(httpStatus.OK, results, 'Data imported successfully'));
});

export const getGstinSummary = asyncHandler(async (req, res) => {
    const { financialYear, month, source } = req.query;
    if (!financialYear || !month) {
        return res.status(httpStatus.BAD_REQUEST).json(new ApiResponse(httpStatus.BAD_REQUEST, null, 'FY and Month are required'));
    }
    const data = await reconService.reconcileGstinWise(financialYear, month, source || '2B');
    res.json(new ApiResponse(httpStatus.OK, data));
});

export const getBillToBillDetails = asyncHandler(async (req, res) => {
    const { financialYear, month, source, tolerance, supplierGstin } = req.query;
    if (!financialYear || !month) {
        return res.status(httpStatus.BAD_REQUEST).json(new ApiResponse(httpStatus.BAD_REQUEST, null, 'FY and Month are required'));
    }
    let data = await reconService.reconcileBillToBill(financialYear, month, source || '2B', Number(tolerance || 2));
    
    // Filter by GSTIN if requested (for drill-down)
    if (supplierGstin) {
        data = data.filter(d => d.gstin === supplierGstin);
    }
    
    res.json(new ApiResponse(httpStatus.OK, data));
});

export const getItcSummary = asyncHandler(async (req, res) => {
    const { financialYear, month, source } = req.query;
    const data = await reconService.reconcileBillToBill(financialYear, month, source || '2B', 2);
    
    const summary = {
        itcAsPerBooks: 0,
        itcAsPerPortal: 0,
        matchedItc: 0,
        eligibleItc: 0,
        itcNotAvailable: 0,
        booksOnlyItc: 0,
        portalOnlyItc: 0
    };

    data.forEach(row => {
        const booksTax = row.books?.totalGst || 0;
        const portalTax = row.portal?.totalGst || 0;
        
        summary.itcAsPerBooks += booksTax;
        summary.itcAsPerPortal += portalTax;

        if (row.status === 'Fully Matched' || row.status === 'Matched with Rounding') {
            summary.matchedItc += portalTax;
            summary.eligibleItc += portalTax;
        } else if (row.status === 'Books Only') {
            summary.booksOnlyItc += booksTax;
        } else if (row.status === '2B Only') {
            summary.portalOnlyItc += portalTax;
        }
    });

    res.json(new ApiResponse(httpStatus.OK, summary));
});
