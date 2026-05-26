import httpStatus from 'http-status';
import ExcelJS from 'exceljs';
import { Supplier } from '../models/supplier.model.js';
import { AccountLedger } from '../models/accountLedger.model.js';
import { AccountGroup } from '../models/accountGroup.model.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import Joi from 'joi';
import { GlobalRenamer } from '../utils/GlobalRenamer.js';
import { autoLinkEntityLedger } from '../utils/ledgerLinking.utils.js';

// Helper — resolves Sundry Creditors group _id
const getSundryCreditorGroupId = async () => {
    const g = await AccountGroup.findOne({ name: 'Sundry Creditors' }).select('_id').lean();
    return g?._id || null;
};

// @desc    Export Supplier Template
// @route   GET /api/v1/suppliers/export/template
// @access  Private
export const exportSupplierTemplate = asyncHandler(async (req, res) => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Suppliers Template');

    worksheet.columns = [
        { header: 'Supplier Code (Leave empty to auto-generate)', key: 'supplierCode', width: 35 },
        { header: 'Supplier Name*', key: 'supplierName', width: 40 },
        { header: 'Contact Person', key: 'contactPerson', width: 25 },
        { header: 'Phone', key: 'phone', width: 20 },
        { header: 'Email', key: 'email', width: 30 },
        { header: 'GST Number', key: 'gstNumber', width: 20 },
        { header: 'GST Type (CGST / SGST, IGST)', key: 'gstType', width: 25 },
        { header: 'PAN Number', key: 'panNumber', width: 20 },
        { header: 'Address', key: 'address', width: 40 },
        { header: 'City', key: 'city', width: 20 },
        { header: 'State', key: 'state', width: 20 },
        { header: 'Pincode', key: 'pincode', width: 15 },
        { header: 'Bank Name', key: 'bankName', width: 25 },
        { header: 'Bank Account No', key: 'bankAccountNo', width: 25 },
        { header: 'Bank IFSC', key: 'bankIfsc', width: 20 },
        { header: 'Active (TRUE/FALSE)', key: 'isActive', width: 20 },
        { header: 'Remarks', key: 'remarks', width: 30 }
    ];

    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE0E0E0' }
    };

    const buffer = await workbook.xlsx.writeBuffer();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=Supplier_Master_Template.xlsx');
    res.send(buffer);
});

// @desc    Import Suppliers from Excel
// @route   POST /api/v1/suppliers/import/excel
// @access  Private
export const importSuppliersExcel = asyncHandler(async (req, res) => {
    if (!req.file) throw new ApiError(httpStatus.BAD_REQUEST, 'Please upload an Excel file');

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(req.file.buffer);
    const worksheet = workbook.worksheets[0];

    if (!worksheet) throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid Excel file format');

    const suppliersToInsert = [];
    const errors = [];
    const headerRow = worksheet.getRow(1);
    const colMap = {};

    headerRow.eachCell((cell, colNumber) => {
        const val = cell.value?.toString().trim().toLowerCase() || '';
        if (val.includes('supplier code')) colMap.supplierCode = colNumber;
        else if (val.includes('supplier name')) colMap.supplierName = colNumber;
        else if (val.includes('contact person')) colMap.contactPerson = colNumber;
        else if (val.includes('phone')) colMap.phone = colNumber;
        else if (val.includes('email')) colMap.email = colNumber;
        else if (val.includes('gst number')) colMap.gstNumber = colNumber;
        else if (val.includes('gst type')) colMap.gstType = colNumber;
        else if (val.includes('pan number')) colMap.panNumber = colNumber;
        else if (val.includes('address')) colMap.address = colNumber;
        else if (val.includes('city')) colMap.city = colNumber;
        else if (val.includes('state')) colMap.state = colNumber;
        else if (val.includes('pincode')) colMap.pincode = colNumber;
        else if (val.includes('bank name')) colMap.bankName = colNumber;
        else if (val.includes('bank account no')) colMap.bankAccountNo = colNumber;
        else if (val.includes('bank ifsc')) colMap.bankIfsc = colNumber;
        else if (val.includes('active')) colMap.active = colNumber;
        else if (val.includes('remarks')) colMap.remarks = colNumber;
    });

    if (!colMap.supplierName) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid template. "Supplier Name" column missing.');
    }

    for (let i = 2; i <= worksheet.rowCount; i++) {
        const row = worksheet.getRow(i);
        if (!row.hasValues) continue;

        try {
            const supplierName = row.getCell(colMap.supplierName).value?.toString().trim();
            if (!supplierName) {
                errors.push(`Row ${i}: Supplier Name is required`);
                continue;
            }

            const supplierData = {
                supplierName,
                supplierCode: colMap.supplierCode ? row.getCell(colMap.supplierCode).value?.toString().trim().toUpperCase() : null,
                contactPerson: colMap.contactPerson ? row.getCell(colMap.contactPerson).value?.toString().trim() : '',
                phone: colMap.phone ? row.getCell(colMap.phone).value?.toString().trim() : '',
                email: colMap.email ? row.getCell(colMap.email).value?.toString().trim().toLowerCase() : '',
                gstNumber: colMap.gstNumber ? row.getCell(colMap.gstNumber).value?.toString().trim().toUpperCase() : '',
                gstType: colMap.gstType ? row.getCell(colMap.gstType).value?.toString().trim().replace(/\s+/g, '') : '',
                panNumber: colMap.panNumber ? row.getCell(colMap.panNumber).value?.toString().trim().toUpperCase() : '',
                address: colMap.address ? row.getCell(colMap.address).value?.toString().trim() : '',
                city: colMap.city ? row.getCell(colMap.city).value?.toString().trim() : '',
                state: colMap.state ? row.getCell(colMap.state).value?.toString().trim() : '',
                pincode: colMap.pincode ? row.getCell(colMap.pincode).value?.toString().trim() : '',
                bankName: colMap.bankName ? row.getCell(colMap.bankName).value?.toString().trim() : '',
                bankAccountNo: colMap.bankAccountNo ? row.getCell(colMap.bankAccountNo).value?.toString().trim() : '',
                bankIfsc: colMap.bankIfsc ? row.getCell(colMap.bankIfsc).value?.toString().trim().toUpperCase() : '',
                remarks: colMap.remarks ? row.getCell(colMap.remarks).value?.toString().trim() : '',
                createdBy: req.user._id
            };

            if (colMap.active) {
                const activeVal = row.getCell(colMap.active).value?.toString().toLowerCase();
                if (activeVal === 'false' || activeVal === '0') supplierData.isActive = false;
            }

            suppliersToInsert.push({ rowNum: i, data: supplierData });
        } catch (err) {
            errors.push(`Row ${i}: ${err.message}`);
        }
    }

    let successCount = 0;
    for (const item of suppliersToInsert) {
        try {
            let supplier;
            // 1. Try to find by supplierCode if provided
            if (item.data.supplierCode) {
                supplier = await Supplier.findOne({ supplierCode: item.data.supplierCode });
            }

            // 2. If not found by code, try by supplierName (case-insensitive)
            if (!supplier && item.data.supplierName) {
                supplier = await Supplier.findOne({
                    supplierName: { $regex: new RegExp(`^${item.data.supplierName.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
                });
            }

            if (supplier) {
                // Auto-set GST Type based on state if not provided or incorrectly formatted
                let currentGstType = item.data.gstType ? item.data.gstType.toUpperCase().replace(/\s+/g, '') : '';

                if (item.data.state) {
                    const st = item.data.state.trim().toLowerCase();
                    const isMh = st.includes('maharashtra') || st === 'mh';

                    if (!currentGstType || currentGstType === 'CGST/SGST' || currentGstType === 'CGSTSGST') {
                        item.data.gstType = isMh ? 'CGST / SGST' : 'IGST';
                    } else if (currentGstType === 'IGST') {
                        item.data.gstType = 'IGST';
                    } else {
                        // If it's something else but looks like Local, fix it
                        if (currentGstType.includes('CGST') || currentGstType.includes('SGST')) {
                            item.data.gstType = 'CGST / SGST';
                        }
                    }
                }

                Object.assign(supplier, item.data);
                supplier.updatedBy = req.user._id;
                await supplier.save();
            } else {
                // Auto-set GST Type based on state for new suppliers
                let currentGstType = item.data.gstType ? item.data.gstType.toUpperCase().replace(/\s+/g, '') : '';

                if (item.data.state) {
                    const st = item.data.state.trim().toLowerCase();
                    const isMh = st.includes('maharashtra') || st === 'mh';

                    if (!currentGstType || currentGstType === 'CGST/SGST' || currentGstType === 'CGSTSGST') {
                        item.data.gstType = isMh ? 'CGST / SGST' : 'IGST';
                    } else if (currentGstType === 'IGST') {
                        item.data.gstType = 'IGST';
                    } else {
                        // If it's something else but looks like Local, fix it
                        if (currentGstType.includes('CGST') || currentGstType.includes('SGST')) {
                            item.data.gstType = 'CGST / SGST';
                        }
                    }
                }

                if (!item.data.supplierCode) {
                    item.data.supplierCode = await generateSupplierCode();
                }
                supplier = await Supplier.create(item.data);
            }

            // Always ensure ledger is linked/created correctly
            await autoLinkEntityLedger(supplier, 'Supplier');
            
            successCount++;
        } catch (err) {
            errors.push(`Row ${item.rowNum}: ${err.message}`);
        }
    }

    res.json(new ApiResponse(200, { successCount, errorCount: errors.length, errors }, 'Import completed'));
});

const supplierSchema = Joi.object({
    supplierName: Joi.string().required(),
    contactPerson: Joi.string().optional().allow(''),
    phone: Joi.string().optional().allow(''),
    email: Joi.string().email().optional().allow(''),
    address: Joi.string().optional().allow(''),
    area: Joi.string().optional().allow(''),
    city: Joi.string().optional().allow(''),
    state: Joi.string().optional().allow(''),
    pincode: Joi.string().optional().allow(''),
    country: Joi.string().optional().allow(''),
    gstNumber: Joi.string().optional().allow(''),
    gstType: Joi.string().valid('CGST / SGST', 'IGST', '').optional().allow(''),
    panNumber: Joi.string().optional().allow(''),
    deducteeConstitution: Joi.string().optional().allow(''),
    paymentTerms: Joi.string().optional().allow(''),
    bankName: Joi.string().optional().allow(''),
    bankAccountNo: Joi.string().optional().allow(''),
    bankIfsc: Joi.string().optional().allow(''),
    isActive: Joi.boolean().optional(),
    openingBalance: Joi.number().optional().default(0),
    openingBalanceDrCr: Joi.string().valid('Dr', 'Cr').optional().default('Cr'),
    remarks: Joi.string().optional().allow(''),
    msmeApplicable: Joi.boolean().optional().default(false),
    msmeRegNo: Joi.string().optional().allow('').default(''),
    msmeCategory: Joi.string().valid('', 'Micro', 'Small', 'Medium').optional().allow('').default(''),
});

// Auto-generate supplier code
const generateSupplierCode = async () => {
    const lastSupplier = await Supplier.findOne(
        { supplierCode: { $regex: /^SUP-\d+$/i } },
        { supplierCode: 1 }
    ).sort({ createdAt: -1 });

    let nextNum = 1;
    if (lastSupplier && lastSupplier.supplierCode) {
        const numPart = parseInt(lastSupplier.supplierCode.replace(/[^0-9]/g, ''), 10);
        if (!isNaN(numPart)) nextNum = numPart + 1;
    }

    let isUnique = false;
    let newCode;
    while (!isUnique) {
        newCode = `SUP-${String(nextNum).padStart(4, '0')}`;
        const exists = await Supplier.exists({ supplierCode: new RegExp(`^${newCode}$`, 'i') });
        if (!exists) isUnique = true;
        else nextNum++;
    }
    return newCode;
};

export const generateSupplierCodeRoute = asyncHandler(async (req, res) => {
    const code = await generateSupplierCode();
    res.json(new ApiResponse(200, { supplierCode: code }, 'Code generated successfully'));
});

export const createSupplier = asyncHandler(async (req, res) => {
    const { error, value } = supplierSchema.validate(req.body, { allowUnknown: true });
    if (error) throw new ApiError(400, error.details[0].message);

    let supplierCode = value.supplierCode;
    if (!supplierCode || supplierCode.trim() === '') {
        supplierCode = await generateSupplierCode();
    } else {
        supplierCode = supplierCode.trim().toUpperCase();
        const existing = await Supplier.findOne({ supplierCode });
        if (existing) throw new ApiError(400, `Supplier code ${supplierCode} already exists`);
    }

    const supplier = await Supplier.create({ ...value, supplierCode, createdBy: req.user._id });

    // Create/Link Ledger then sync MSME flags
    const ledgerIdCreate = await autoLinkEntityLedger(supplier, 'Supplier');
    if (ledgerIdCreate) {
        await AccountLedger.findByIdAndUpdate(ledgerIdCreate, {
            $set: {
                msmeApplicable: supplier.msmeApplicable || false,
                msmeRegNo: supplier.msmeRegNo || '',
                msmeCategory: supplier.msmeCategory || '',
            },
        });
    }

    res.status(201).json(new ApiResponse(201, supplier, 'Supplier created'));
});

export const getSuppliers = asyncHandler(async (req, res) => {
    const { search, isActive, page = 1, limit = 50 } = req.query;
    const query = {};
    if (search) query.$or = [{ supplierName: { $regex: search, $options: 'i' } }, { supplierCode: { $regex: search, $options: 'i' } }];
    if (isActive !== undefined) query.isActive = isActive === 'true';

    const skip = (Number(page) - 1) * Number(limit);
    const total = await Supplier.countDocuments(query);
    const suppliers = await Supplier.find(query).sort({ supplierName: 1 }).skip(skip).limit(Number(limit));

    res.json(new ApiResponse(200, { suppliers, total, page: Number(page), pages: Math.ceil(total / Number(limit)) }, 'Suppliers fetched'));
});

export const getSupplierById = asyncHandler(async (req, res) => {
    const supplier = await Supplier.findById(req.params.id);
    if (!supplier) throw new ApiError(404, 'Supplier not found');
    res.json(new ApiResponse(200, supplier, 'Supplier fetched'));
});

export const updateSupplier = asyncHandler(async (req, res) => {
    const { error, value } = supplierSchema.validate(req.body, { allowUnknown: true });
    if (error) throw new ApiError(400, error.details[0].message);

    const oldSupplier = await Supplier.findById(req.params.id).lean();
    if (!oldSupplier) throw new ApiError(404, 'Supplier not found');

    const supplier = await Supplier.findByIdAndUpdate(
        req.params.id, { ...value, updatedBy: req.user._id }, { new: true }
    );
    if (!supplier) throw new ApiError(404, 'Supplier not found');

    // Sync changes to the linked AccountLedger (name, gstin, etc.) + MSME flags
    const ledgerIdUpdate = await autoLinkEntityLedger(supplier, 'Supplier');
    if (ledgerIdUpdate) {
        await AccountLedger.findByIdAndUpdate(ledgerIdUpdate, {
            $set: {
                msmeApplicable: supplier.msmeApplicable || false,
                msmeRegNo: supplier.msmeRegNo || '',
                msmeCategory: supplier.msmeCategory || '',
            },
        });
    }

    // Propagate name change globally (already handled in some cases, but autoLink does the direct one)

    // Propagate name change globally
    if (oldSupplier.supplierName !== supplier.supplierName) {
        GlobalRenamer.propagate({
            masterType: 'SUPPLIER',
            id: supplier._id,
            oldName: oldSupplier.supplierName,
            newName: supplier.supplierName,
            userId: req.user._id
        }).catch(err => console.error('Global Propagation Error (Supplier):', err));
    }

    res.json(new ApiResponse(200, supplier, 'Supplier updated'));
});

export const deleteSupplier = asyncHandler(async (req, res) => {
    // 🛡️ SOFT-DELETE ONLY: Suppliers are never hard-deleted from the database.
    const result = await Supplier.updateOne(
        { _id: req.params.id, isDeleted: { $ne: true } },
        { $set: { isDeleted: true, deletedAt: new Date() } }
    );
    if (result.matchedCount === 0) throw new ApiError(404, 'Supplier not found');
    res.json(new ApiResponse(200, null, 'Supplier deactivated (soft-deleted)'));
});
