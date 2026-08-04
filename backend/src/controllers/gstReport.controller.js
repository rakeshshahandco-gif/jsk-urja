/**
 * GSTR-1 Report Controller
 * Endpoints: preview, validate, generate Excel download
 */
import { generateGSTR1Data, validateGSTR1, generateGSTR1Excel, generateGSTR3BData, reconcileGSTR1vs3B, buildGstr1Json, generateIrn, generateGSTR9Data, generateGSTR9Excel } from '../services/gstReport.service.js';
import { importGstr9PortalFile, getGstr9PortalImports, deleteGstr9PortalImport, reconcileGstr9 } from '../services/gstr9Portal.service.js';
import { SalesInvoice as SalesInvoiceModel } from '../models/salesInvoice.model.js';
import { CompanyProfile } from '../models/companyProfile.model.js';
import { Gstr3bAdjustment } from '../models/gstr3bAdjustment.model.js';
import { SalesInvoice } from '../models/salesInvoice.model.js';
import { InvoiceSeries } from '../models/invoiceSeries.model.js';
import Customer from '../models/customer.model.js';
import { AuditLog } from '../models/auditLog.model.js';
import * as gstr1Fix from '../services/gstr1InvoiceCorrection.service.js';

const STATE_CODE_MAP = {
  '01': 'Jammu and Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab', '04': 'Chandigarh', '05': 'Uttarakhand', '06': 'Haryana',
  '07': 'Delhi', '08': 'Rajasthan', '09': 'Uttar Pradesh', '10': 'Bihar', '11': 'Sikkim', '12': 'Arunachal Pradesh',
  '13': 'Nagaland', '14': 'Manipur', '15': 'Mizoram', '16': 'Tripura', '17': 'Meghalaya', '18': 'Assam',
  '19': 'West Bengal', '20': 'Jharkhand', '21': 'Odisha', '22': 'Chhattisgarh', '23': 'Madhya Pradesh', '24': 'Gujarat',
  '25': 'Daman and Diu', '26': 'Dadra and Nagar Haveli and Daman and Diu', '27': 'Maharashtra', '29': 'Karnataka', '30': 'Goa',
  '31': 'Lakshadweep', '32': 'Kerala', '33': 'Tamil Nadu', '34': 'Puducherry', '35': 'Andaman and Nicobar Islands',
  '36': 'Telangana', '37': 'Andhra Pradesh', '38': 'Ladakh', '97': 'Other Territory'
};
/**
 * GET /api/v1/gst-reports/preview
 * Query: startDate, endDate (YYYY-MM-DD)
 */
export async function getGSTR1Preview(req, res) {
  try {
    let { startDate, endDate } = req.query;
    
    if (!startDate || !endDate) {
      const now = new Date();
      startDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
      endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
    }

    const data = await generateGSTR1Data(startDate, endDate);
    res.json({ success: true, data });
  } catch (error) {
    console.error('[GSTR1] Preview error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * GET /api/v1/gst-reports/validate
 * Query: startDate, endDate (YYYY-MM-DD)
 */
export async function getGSTR1Validation(req, res) {
  try {
    let { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      const now = new Date();
      startDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
      endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
    }

    const errors = await validateGSTR1(startDate, endDate);
    res.json({
      success: true,
      totalErrors: errors.length,
      blockingErrors: errors.filter(e => e.severity === 'Blocking Error').length,
      warnings: errors.filter(e => e.severity === 'Warning').length,
      errors,
    });
  } catch (error) {
    console.error('[GSTR1] Validation error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * GET /api/v1/gst-reports/download
 * Query: startDate, endDate (YYYY-MM-DD)
 * Returns: .xlsx file
 */
export async function downloadGSTR1Excel(req, res) {
  try {
    let { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      const now = new Date();
      startDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
      endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
    }

    const { workbook, data } = await generateGSTR1Excel(startDate, endDate);

    // Build filename like GSTR1_Apr2025.xlsx
    const sd = new Date(startDate);
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const filename = `GSTR1_${months[sd.getMonth()]}${sd.getFullYear()}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('[GSTR1] Download error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * GET /api/v1/gst-reports/missing-pos-preview
 * Admin Utility: Preview missing POS invoices and their suggested POS
 */
export async function getMissingPosPreview(req, res) {
  try {
    const estimateSeries = await InvoiceSeries.find({
      $or: [ { isEstimate: true }, { documentType: 'Estimate' }, { gstApplicable: false } ]
    }).select('_id').lean();
    const estimateSeriesIds = estimateSeries.map(s => s._id);

    // Find invoices with blank placeOfSupply
    const invoices = await SalesInvoice.find({
      isDeleted: { $ne: true },
      status: { $ne: 'Cancelled' },
      seriesId: { $nin: estimateSeriesIds },
      $or: [{ placeOfSupply: '' }, { placeOfSupply: { $exists: false } }, { placeOfSupply: null }]
    }).populate('customerId').lean();

    const preview = [];
    for (const inv of invoices) {
      const customer = inv.customerId;
      let suggested = '';
      if (customer) {
        if (customer.defaultPlaceOfSupply && customer.defaultPlaceOfSupply.trim()) {
          suggested = customer.defaultPlaceOfSupply.trim();
        } else if (customer.gstNumber && customer.gstNumber.trim().length >= 2) {
          const code = customer.gstNumber.substring(0, 2);
          const stateName = STATE_CODE_MAP[code] || customer.state || '';
          suggested = stateName ? `${code}-${stateName}` : code;
        } else if (customer.billingStateCode && customer.state) {
          suggested = `${customer.billingStateCode}-${customer.state}`;
        }
      }

      preview.push({
        _id: inv._id,
        invoiceNumber: inv.invoiceNumber,
        invoiceDate: inv.invoiceDate,
        customerName: inv.customerName || (customer ? customer.customerName : ''),
        gstin: inv.customerGstin || (customer ? customer.gstNumber : ''),
        currentPos: inv.placeOfSupply || 'BLANK',
        suggestedPos: suggested || 'UNABLE TO DERIVE',
        canUpdate: !!suggested
      });
    }

    res.json({ success: true, count: preview.length, preview });
  } catch (error) {
    console.error('[GSTR1] Missing POS Preview error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * POST /api/v1/gst-reports/sync-missing-pos
 * Admin Utility: Update blank POS invoices
 */
export async function syncMissingPos(req, res) {
  try {
    const { updates } = req.body; // Array of { id, suggestedPos }
    if (!updates || !Array.isArray(updates)) {
      return res.status(400).json({ success: false, message: 'Invalid payload. Expected array of updates.' });
    }

    let updatedCount = 0;
    const updatedInvoices = [];

    for (const item of updates) {
      if (!item.id || !item.suggestedPos || item.suggestedPos === 'UNABLE TO DERIVE') continue;

      // Only update if it's currently blank
      const inv = await SalesInvoice.findOne({
        _id: item.id,
        $or: [{ placeOfSupply: '' }, { placeOfSupply: { $exists: false } }, { placeOfSupply: null }]
      });

      if (inv) {
        inv.placeOfSupply = item.suggestedPos;
        const code = item.suggestedPos.substring(0, 2);
        if (code && !isNaN(Number(code))) {
           inv.billingStateCode = code;
        }
        await inv.save();
        updatedCount++;
        updatedInvoices.push(inv.invoiceNumber);
      }
    }

    if (updatedCount > 0) {
      await AuditLog.create({
        user: req.user.id,
        action: 'UPDATE',
        module: 'GstrCompliance',
        description: `Admin synced missing Place of Supply for ${updatedCount} historical invoices.`,
        details: { updatedInvoices },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      });
    }

    res.json({ success: true, updatedCount, updatedInvoices });
  } catch (error) {
    console.error('[GSTR1] Sync Missing POS error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * GET /api/v1/gst-reports/gstr3b-summary
 * Query: startDate, endDate (YYYY-MM-DD)
 */
export async function getGSTR3BSummary(req, res) {
  try {
    let { startDate, endDate } = req.query;
    
    if (!startDate || !endDate) {
      const now = new Date();
      startDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
      endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
    }

    const data = await generateGSTR3BData(startDate, endDate);
    const reconciliation = await reconcileGSTR1vs3B(startDate, endDate);
    
    res.json({ success: true, data, reconciliation });
  } catch (error) {
    console.error('[GSTR3B] Summary error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * POST /api/v1/gst-reports/gstr3b-adjustment
 * Save or update manual adjustments for a period
 */
export async function saveGSTR3BAdjustment(req, res) {
  try {
    const { financialYear, month, ...adjustments } = req.body;
    
    if (!financialYear || !month) {
      return res.status(400).json({ success: false, message: 'Financial Year and Month are required' });
    }

    let adj = await Gstr3bAdjustment.findOne({ financialYear, month });
    
    const oldValues = adj ? adj.toObject() : {};
    
    if (!adj) {
      adj = new Gstr3bAdjustment({ financialYear, month });
    }

    // Update fields
    if (adjustments.table4) adj.table4 = adjustments.table4;
    if (adjustments.table5) adj.table5 = adjustments.table5;
    if (adjustments.table51) adj.table51 = adjustments.table51;
    if (adjustments.table61) adj.table61 = adjustments.table61;
    if (adjustments.remarks) adj.remarks = adjustments.remarks;

    // Audit Log
    adj.auditLog.push({
      action: oldValues._id ? 'UPDATE' : 'CREATE',
      performedBy: req.user.id,
      timestamp: new Date(),
      oldValues: oldValues,
      newValues: adjustments,
      reason: req.body.reason || 'Manual Adjustment'
    });

    await adj.save();
    res.json({ success: true, data: adj });
  } catch (error) {
    console.error('[GSTR3B] Save adjustment error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * GET /api/v1/gst-reports/gstr3b-adjustment
 */
export async function getGSTR3BAdjustment(req, res) {
  try {
    const { financialYear, month } = req.query;
    if (!financialYear || !month) {
      return res.status(400).json({ success: false, message: 'Financial Year and Month are required' });
    }
    const data = await Gstr3bAdjustment.findOne({ financialYear, month }).lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
}

import * as calcService from '../services/gstCalculations.service.js';

export async function getItcRegister(req, res) {
    try {
        const { startDate, endDate, ...filters } = req.query;
        if (!startDate || !endDate) return res.status(400).json({ success: false, message: 'startDate and endDate are required' });
        const data = await calcService.getItcRegister(startDate, endDate, filters);
        res.json({ success: true, data });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
}

export async function getGstPayableSummary(req, res) {
    try {
        const { startDate, endDate } = req.query;
        if (!startDate || !endDate) return res.status(400).json({ success: false, message: 'startDate and endDate are required' });
        const data = await calcService.getGstPayableSummary(startDate, endDate);
        res.json({ success: true, data });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
}

export async function getHsnSummary(req, res) {
    try {
        const { startDate, endDate } = req.query;
        if (!startDate || !endDate) return res.status(400).json({ success: false, message: 'startDate and endDate are required' });
        const data = await calcService.getHsnSummary(startDate, endDate);
        res.json({ success: true, data });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
}

export async function getGstLedger(req, res) {
    try {
        const { startDate, endDate } = req.query;
        if (!startDate || !endDate) return res.status(400).json({ success: false, message: 'startDate and endDate are required' });
        const data = await calcService.getGstLedger(startDate, endDate);
        res.json({ success: true, data });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
}

// ── GSTR-1 JSON Export ──────────────────────────────────────────────────────

export async function downloadGSTR1Json(req, res) {
    try {
        const { month, year } = req.query;
        if (!month || !year) return res.status(400).json({ success: false, message: 'month and year are required' });

        const profile = await CompanyProfile.findOne({}).lean();
        const gstin = profile?.gstin || '';
        const jsonPayload = await buildGstr1Json({ month: parseInt(month, 10), year: parseInt(year, 10), gstin });

        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename=GSTR1_${year}_${String(month).padStart(2, '0')}.json`);
        res.send(JSON.stringify(jsonPayload, null, 2));
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
}

// ── E-Invoice ────────────────────────────────────────────────────────────────

export async function getEInvoicePayload(req, res) {
    try {
        const { invoiceId } = req.params;
        const invoice = await SalesInvoiceModel.findById(invoiceId).lean();
        if (!invoice) return res.status(404).json({ success: false, message: 'Invoice not found' });
        const profile = await CompanyProfile.findOne({}).lean();
        const { buildEInvoicePayload } = await import('../services/gstReport.service.js');
        const payload = await buildEInvoicePayload(invoice, profile);
        res.json({ success: true, data: payload });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
}

// ──────────────────────────────────────────────────────────────────────────────
// GSTR-9 Annual Return
// ──────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/v1/gst-reports/gstr9-summary?fy=2025-2026
 */
export async function getGSTR9Summary(req, res) {
  try {
    const fy = req.query.fy || `${new Date().getFullYear() - 1}-${new Date().getFullYear()}`;
    const data = await generateGSTR9Data(fy);
    res.json({ success: true, data });
  } catch (err) {
    console.error('[GSTR9] summary error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
}

/**
 * GET /api/v1/gst-reports/gstr9-download?fy=2025-2026
 */
export async function downloadGSTR9Excel(req, res) {
  try {
    const fy = req.query.fy || `${new Date().getFullYear() - 1}-${new Date().getFullYear()}`;
    const wb = await generateGSTR9Excel(fy);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="GSTR9_${fy}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('[GSTR9] download error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
}

// ── GSTR-9 Portal Import ───────────────────────────────────────────────────

/**
 * POST /api/v1/gst-reports/gstr9-import
 * multipart/form-data: file (JSON or Excel), formType (GSTR1 | GSTR3B)
 */
export async function importGstr9Portal(req, res) {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded.' });
    const formType = req.body.formType;
    if (!['GSTR1', 'GSTR3B'].includes(formType)) {
      return res.status(400).json({ success: false, message: 'formType must be GSTR1 or GSTR3B.' });
    }
    const result = await importGstr9PortalFile({
      buffer:   req.file.buffer,
      fileName: req.file.originalname,
      formType,
      userId:   req.user?._id,
    });
    res.json({ success: true, data: result });
  } catch (err) {
    console.error('[GSTR9 Import]', err.message);
    res.status(400).json({ success: false, message: err.message });
  }
}

/**
 * GET /api/v1/gst-reports/gstr9-imports?fy=2025-2026
 */
export async function listGstr9PortalImports(req, res) {
  try {
    const fy = req.query.fy || `${new Date().getFullYear() - 1}-${new Date().getFullYear()}`;
    const data = await getGstr9PortalImports(fy);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

/**
 * DELETE /api/v1/gst-reports/gstr9-imports/:id
 */
export async function removeGstr9PortalImport(req, res) {
  try {
    await deleteGstr9PortalImport(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

/**
 * GET /api/v1/gst-reports/gstr9-reconcile?fy=2025-2026
 */
export async function getGstr9Reconciliation(req, res) {
  try {
    const fy = req.query.fy || `${new Date().getFullYear() - 1}-${new Date().getFullYear()}`;
    const data = await reconcileGstr9(fy);
    res.json({ success: true, data });
  } catch (err) {
    console.error('[GSTR9 Reconcile]', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
}

export async function postGenerateIrn(req, res) {
    try {
        const { invoiceId } = req.params;
        const invoice = await SalesInvoiceModel.findById(invoiceId).lean();
        if (!invoice) return res.status(404).json({ success: false, message: 'Invoice not found' });
        const profile = await CompanyProfile.findOne({}).lean();
        const result = await generateIrn(invoice, profile);

        // If IRN was generated, save it back to the invoice
        if (result.irn) {
            await SalesInvoiceModel.findByIdAndUpdate(invoiceId, {
                irn: result.irn,
                irnAckNo: result.ackNo,
                signedQrCode: result.signedQrCode,
                eInvoiceStatus: 'Generated',
            });
        }

        res.json({ success: true, data: result });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
}

/** GET /gst-reports/fix-from-master/:invoiceId/preview */
export async function previewFixFromCustomerMaster(req, res) {
  try {
    const data = await gstr1Fix.previewFixFromCustomerMaster(req.params.invoiceId, req.companyId);
    res.json({ success: true, data });
  } catch (error) {
    const code = error.statusCode || error.status || 500;
    res.status(code).json({ success: false, message: error.message });
  }
}

/** POST /gst-reports/fix-from-master/:invoiceId/apply */
export async function applyFixFromCustomerMaster(req, res) {
  try {
    const { reason, confirmBlankEffectiveDate, approveGstTypeChange } = req.body || {};
    const data = await gstr1Fix.applyFixFromCustomerMaster({
      invoiceId: req.params.invoiceId,
      companyId: req.companyId,
      userId: req.user.id,
      reason,
      confirmBlankEffectiveDate: Boolean(confirmBlankEffectiveDate),
      approveGstTypeChange: Boolean(approveGstTypeChange),
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
    res.json({ success: true, ...data });
  } catch (error) {
    const code = error.statusCode || error.status || 500;
    res.status(code).json({ success: false, message: error.message });
  }
}

/** POST /gst-reports/fix-from-master/bulk-preview */
export async function bulkPreviewFixFromCustomerMaster(req, res) {
  try {
    const { startDate, endDate, invoiceIds } = req.body || {};
    const data = await gstr1Fix.previewBulkFixFromCustomerMaster({
      companyId: req.companyId,
      startDate: startDate || req.query.startDate,
      endDate: endDate || req.query.endDate,
      invoiceIds,
    });
    res.json({ success: true, data });
  } catch (error) {
    const code = error.statusCode || error.status || 500;
    res.status(code).json({ success: false, message: error.message });
  }
}

/** GET /gst-reports/customers/:customerId/affected-invoices */
export async function getAffectedInvoicesMissingGst(req, res) {
  try {
    const list = await gstr1Fix.listAffectedInvoicesMissingGst(req.params.customerId, req.companyId);
    res.json({ success: true, data: { invoices: list, count: list.length } });
  } catch (error) {
    const code = error.statusCode || error.status || 500;
    res.status(code).json({ success: false, message: error.message });
  }
}

/** POST /gst-reports/gstr1-period/mark-filed */
export async function markGstr1PeriodFiled(req, res) {
  try {
    const { returnPeriod, financialYear, remarks } = req.body || {};
    const doc = await gstr1Fix.markGstr1PeriodFiled({
      companyId: req.companyId,
      returnPeriod,
      financialYear,
      userId: req.user.id,
      remarks,
    });
    res.json({ success: true, data: doc });
  } catch (error) {
    const code = error.statusCode || error.status || 500;
    res.status(code).json({ success: false, message: error.message });
  }
}
