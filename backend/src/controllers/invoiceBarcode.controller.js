import httpStatus from 'http-status';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { SalesInvoice } from '../models/salesInvoice.model.js';
import { CompanyProfile } from '../models/companyProfile.model.js';
import {
  buildInvoiceBarcodePayload,
  lookupInvoiceByCode,
  getPublicInvoiceByToken,
  getInvoiceBarcodeSettings,
  mergeBarcodeSettings,
  DEFAULT_INVOICE_BARCODE_SETTINGS,
} from '../services/invoiceBarcode.service.js';

export const getBarcodeSettings = asyncHandler(async (req, res) => {
  const { settings } = await getInvoiceBarcodeSettings(req.companyId);
  res.status(200).json(new ApiResponse(200, settings, 'Barcode settings fetched'));
});

export const updateBarcodeSettings = asyncHandler(async (req, res) => {
  if (!req.companyId) throw new ApiError(400, 'Active company is required');

  const incoming = req.body?.invoiceBarcodeSettings || req.body || {};
  const settings = mergeBarcodeSettings(incoming);

  let profile = await CompanyProfile.findOne({ companyId: req.companyId });
  if (!profile) {
    profile = await CompanyProfile.create({
      companyName: 'Default Company Name',
      companyId: req.companyId,
      invoiceBarcodeSettings: settings,
    });
  } else {
    profile.invoiceBarcodeSettings = settings;
    profile.updatedBy = req.user?._id;
    await profile.save();
  }

  res.status(200).json(new ApiResponse(200, settings, 'Barcode settings updated'));
});

export const getInvoiceBarcodeData = asyncHandler(async (req, res) => {
  const inv = await SalesInvoice.findById(req.params.id).lean();
  if (!inv || inv.isDeleted) throw new ApiError(httpStatus.NOT_FOUND, 'Invoice not found');

  const data = await buildInvoiceBarcodePayload(inv, req.companyId);
  res.status(200).json(new ApiResponse(200, data, 'Barcode data generated'));
});

export const lookupInvoiceScan = asyncHandler(async (req, res) => {
  const code = req.query.code || req.params.code;
  const inv = await lookupInvoiceByCode(code, req.companyId);
  if (!inv) throw new ApiError(httpStatus.NOT_FOUND, 'Invoice not found for scanned code');

  res.status(200).json(new ApiResponse(200, {
    _id: inv._id,
    invoiceNumber: inv.invoiceNumber,
    displayInvoiceNumber: inv.displayInvoiceNumber || inv.invoiceNumber,
    customerName: inv.customerName,
    invoiceDate: inv.invoiceDate,
    paymentStatus: inv.paymentStatus,
    status: inv.status,
  }, 'Invoice found'));
});

export const getPublicInvoice = asyncHandler(async (req, res) => {
  const data = await getPublicInvoiceByToken(req.params.token);
  if (!data) throw new ApiError(httpStatus.NOT_FOUND, 'Invoice not found or link expired');

  res.status(200).json(new ApiResponse(200, data, 'Public invoice fetched'));
});

export { DEFAULT_INVOICE_BARCODE_SETTINGS };
