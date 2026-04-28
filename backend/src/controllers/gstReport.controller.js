/**
 * GSTR-1 Report Controller
 * Endpoints: preview, validate, generate Excel download
 */
import { generateGSTR1Data, validateGSTR1, generateGSTR1Excel } from '../services/gstReport.service.js';
import { SalesInvoice } from '../models/salesInvoice.model.js';
import { InvoiceSeries } from '../models/invoiceSeries.model.js';
import Customer from '../models/customer.model.js';
import { AuditLog } from '../models/auditLog.model.js';

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

