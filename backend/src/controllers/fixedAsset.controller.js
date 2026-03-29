import { FixedAsset } from '../models/fixedAsset.model.js';
import { AssetCategory } from '../models/assetCategory.model.js';
import { AssetLocation } from '../models/assetLocation.model.js';
import { Supplier } from '../models/supplier.model.js';
import { User } from '../models/user.model.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import ExcelJS from 'exceljs';
import Joi from 'joi';
import httpStatus from 'http-status';

const assetSchema = Joi.object({
    assetName: Joi.string().required(),
    assetShortName: Joi.string().allow(''),
    category: Joi.string().required(),
    assetDescription: Joi.string().allow(''),
    brand: Joi.string().allow(''),
    modelNo: Joi.string().allow(''),
    serialNo: Joi.string().allow(''),
    identificationNo: Joi.string().allow(''),
    barcodeNo: Joi.string().allow(''),
    manufacturerName: Joi.string().allow(''),
    subcategory: Joi.string().allow(''),
    trackingType: Joi.string().valid('Individual Asset Tracking', 'Quantity Based Tracking'),
    quantity: Joi.number().min(1),
    supplier: Joi.string().allow(null, ''),
    purchaseInvoiceNo: Joi.string().allow(''),
    purchaseInvoiceDate: Joi.date().allow(null, ''),
    purchaseDate: Joi.date().required(),
    installationDate: Joi.date().allow(null, ''),
    putToUseDate: Joi.date().allow(null, ''),
    poNo: Joi.string().allow(''),
    purchaseValue: Joi.number().min(0),
    currency: Joi.string().allow(''),
    gstAmount: Joi.number().min(0),
    freightCharges: Joi.number().min(0),
    installationCharges: Joi.number().min(0),
    otherCharges: Joi.number().min(0),
    capitalizedCost: Joi.number().required(),
    depreciationApplicable: Joi.boolean(),
    depreciationMethod: Joi.string().valid('Straight Line Method', 'Written Down Value', 'None'),
    depreciationRate: Joi.number().min(0).max(100),
    usefulLife: Joi.number().min(0),
    residualValue: Joi.number().min(0),
    location: Joi.string().required(),
    department: Joi.string().allow(''),
    assignedTo: Joi.string().allow(null, ''),
    custodian: Joi.string().allow(''),
    glAccount: Joi.string().allow(''),
    costCenter: Joi.string().allow(''),
    projectCode: Joi.string().allow(''),
    lastPhysicalVerificationDate: Joi.date().allow(null, ''),
    status: Joi.string().valid('In Use', 'In Store', 'Under Repair', 'Under Maintenance', 'Idle', 'Disposed', 'Sold', 'Scrapped'),
    condition: Joi.string().valid('New', 'Good', 'Average', 'Damaged', 'Not Working'),
    warrantyAvailable: Joi.boolean(),
    warrantyStartDate: Joi.date().allow(null, ''),
    warrantyEndDate: Joi.date().allow(null, ''),
    amcAvailable: Joi.boolean(),
    amcStartDate: Joi.date().allow(null, ''),
    amcEndDate: Joi.date().allow(null, ''),
    insuranceAvailable: Joi.boolean(),
    insurancePolicyNo: Joi.string().allow(''),
    insuranceEndDate: Joi.date().allow(null, ''),
    remarks: Joi.string().allow('')
});

const generateAssetCode = async (categoryId) => {
    const category = await AssetCategory.findById(categoryId);
    if (!category) throw new ApiError(404, 'Category not found for code generation');

    const prefix = category.codePrefix || 'AST';
    const count = await FixedAsset.countDocuments({ category: categoryId });
    return `${prefix}${String(count + 1).padStart(3, '0')}`;
};

export const createAsset = asyncHandler(async (req, res) => {
    const { error, value } = assetSchema.validate(req.body);
    if (error) throw new ApiError(400, error.details[0].message);

    const assetCode = await generateAssetCode(value.category);

    const asset = await FixedAsset.create({
        ...value,
        assetCode,
        currentBookValue: value.capitalizedCost, // Initially, book value is capitalized cost
        createdBy: req.user._id
    });

    res.status(httpStatus.CREATED).json(new ApiResponse(httpStatus.CREATED, asset, 'Fixed Asset registered successfully'));
});

export const getAssets = asyncHandler(async (req, res) => {
    const { search, category, location, status, page = 1, limit = 50 } = req.query;

    const query = { isActive: true };
    if (search) {
        query.$or = [
            { assetName: { $regex: search, $options: 'i' } },
            { assetCode: { $regex: search, $options: 'i' } },
            { serialNo: { $regex: search, $options: 'i' } }
        ];
    }
    if (category) query.category = category;
    if (location) query.location = location;
    if (status) query.status = status;

    const skip = (Number(page) - 1) * Number(limit);
    const total = await FixedAsset.countDocuments(query);
    const assets = await FixedAsset.find(query)
        .populate('category', 'name codePrefix')
        .populate('location', 'name')
        .populate('assignedTo', 'firstName lastName')
        .sort({ assetCode: 1 })
        .skip(skip)
        .limit(Number(limit));

    res.json(new ApiResponse(httpStatus.OK, { assets, total, page: Number(page), pages: Math.ceil(total / Number(limit)) }, 'Fixed Assets fetched'));
});

export const getAssetById = asyncHandler(async (req, res) => {
    const asset = await FixedAsset.findById(req.params.id)
        .populate('category')
        .populate('location')
        .populate('assignedTo', 'firstName lastName')
        .populate('supplier', 'supplierName');
    if (!asset) throw new ApiError(404, 'Asset not found');
    res.json(new ApiResponse(httpStatus.OK, asset, 'Asset fetched'));
});

export const updateAsset = asyncHandler(async (req, res) => {
    const { error, value } = assetSchema.validate(req.body);
    if (error) throw new ApiError(400, error.details[0].message);

    const asset = await FixedAsset.findByIdAndUpdate(
        req.params.id,
        { ...value, updatedBy: req.user._id },
        { new: true }
    );
    if (!asset) throw new ApiError(404, 'Asset not found');
    res.json(new ApiResponse(httpStatus.OK, asset, 'Asset updated'));
});

// ── EXPORT TEMPLATE ────────────────────────────────────────────────────────
export const exportFixedAssetTemplate = asyncHandler(async (req, res) => {
    try {
        const workbook = new ExcelJS.Workbook();
        
        // 1. INSTRUCTIONS SHEET
        const insSheet = workbook.addWorksheet('Instructions');
        insSheet.columns = [{ header: 'Instruction', key: 'ins', width: 80 }];
        insSheet.addRows([
            ['FIXED ASSET IMPORT INSTRUCTIONS'],
            [''],
            ['1. One row = one asset.'],
            ['2. Keep header names in "Asset_Register_Template" unchanged.'],
            ['3. Asset IDs must be unique if provided. If left blank, they will be auto-generated.'],
            ['4. Acquisition Date must be in YYYY-MM-DD format.'],
            ['5. Numeric fields (Cost, Useful Life, etc.) must contain numbers only.'],
            ['6. Mandatory fields are marked with an asterisk (*).'],
            ['7. Use dropdown values where provided for Category, Status, etc.'],
        ]);
        insSheet.getRow(1).font = { bold: true, size: 14 };

        // 2. LISTS SHEET (For dropdowns)
        const listSheet = workbook.addWorksheet('Lists');
        const categories = await AssetCategory.find({ isActive: true }).select('name');
        const locations = await AssetLocation.find({ isActive: true }).select('name');
        
        const catNames = categories.map(c => c.name);
        const locNames = locations.map(l => l.name);
        const statuses = ['In Use', 'In Store', 'Under Repair', 'Under Maintenance', 'Idle', 'Disposed', 'Sold', 'Scrapped'];
        const conditions = ['New', 'Good', 'Average', 'Damaged', 'Not Working'];
        const methods = ['Straight Line Method', 'Written Down Value', 'None'];
        const currencies = ['INR', 'USD', 'EUR', 'GBP'];

        // Fill Lists sheet columns
        const maxRows = Math.max(catNames.length, locNames.length, statuses.length, conditions.length, methods.length, currencies.length);
        listSheet.getRow(1).values = ['Categories', 'Locations', 'Statuses', 'Conditions', 'Methods', 'Currencies'];
        listSheet.getRow(1).font = { bold: true };

        for (let i = 0; i < maxRows; i++) {
            listSheet.addRow([
                catNames[i] || '',
                locNames[i] || '',
                statuses[i] || '',
                conditions[i] || '',
                methods[i] || '',
                currencies[i] || ''
            ]);
        }
        // listSheet.state = 'hidden'; 

        // 3. MAIN TEMPLATE SHEET
        const worksheet = workbook.addWorksheet('Asset_Register_Template');
        worksheet.columns = [
            { header: 'Asset ID (Optional)*', key: 'assetCode', width: 20 },
            { header: 'Asset Name*', key: 'assetName', width: 30 },
            { header: 'Category*', key: 'category', width: 20 },
            { header: 'Department*', key: 'department', width: 20 },
            { header: 'Location*', key: 'location', width: 20 },
            { header: 'Acquisition Date* (YYYY-MM-DD)', key: 'purchaseDate', width: 20 },
            { header: 'Cost*', key: 'purchaseValue', width: 15 },
            { header: 'Currency*', key: 'currency', width: 10 },
            { header: 'Useful Life (Months)*', key: 'usefulLife', width: 20 },
            { header: 'Depreciation Method*', key: 'depreciationMethod', width: 25 },
            { header: 'Status*', key: 'status', width: 15 },
            { header: 'Description', key: 'assetDescription', width: 30 },
            { header: 'Subcategory', key: 'subcategory', width: 20 },
            { header: 'Serial Number', key: 'serialNo', width: 20 },
            { header: 'Tag Number', key: 'identificationNo', width: 20 },
            { header: 'Custodian', key: 'custodian', width: 20 },
            { header: 'Supplier', key: 'supplier', width: 25 },
            { header: 'PO No.', key: 'poNo', width: 15 },
            { header: 'Invoice No.', key: 'purchaseInvoiceNo', width: 15 },
            { header: 'In Service Date (YYYY-MM-DD)', key: 'putToUseDate', width: 20 },
            { header: 'Warranty Expiry Date (YYYY-MM-DD)', key: 'warrantyEndDate', width: 20 },
            { header: 'Quantity', key: 'quantity', width: 10 },
            { header: 'Salvage Value', key: 'residualValue', width: 15 },
            { header: 'Opening Accumulated Depreciation', key: 'accumulatedDepreciation', width: 30 },
            { header: 'Asset Condition', key: 'condition', width: 15 },
            { header: 'GL Account', key: 'glAccount', width: 15 },
            { header: 'Cost Center', key: 'costCenter', width: 15 },
            { header: 'Project Code', key: 'projectCode', width: 15 },
            { header: 'Last Physical Verification Date (YYYY-MM-DD)', key: 'lastPhysicalVerificationDate', width: 30 },
            { header: 'Notes', key: 'remarks', width: 30 }
        ];

        // Style header
        worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
        worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } }; // Indigo background

        // Add Data Validation (Dropdowns) for 100 rows
        for (let i = 2; i <= 100; i++) {
            if (catNames.length > 0) {
                worksheet.getCell(`C${i}`).dataValidation = { type: 'list', allowBlank: true, formulae: [`Lists!$A$2:$A$${catNames.length + 1}`] };
            }
            if (locNames.length > 0) {
                worksheet.getCell(`E${i}`).dataValidation = { type: 'list', allowBlank: true, formulae: [`Lists!$B$2:$B$${locNames.length + 1}`] };
            }
            
            // Basic lists always have values
            worksheet.getCell(`H${i}`).dataValidation = { type: 'list', allowBlank: true, formulae: [`Lists!$F$2:$F$${currencies.length + 1}`] };
            worksheet.getCell(`J${i}`).dataValidation = { type: 'list', allowBlank: true, formulae: [`Lists!$E$2:$E$${methods.length + 1}`] };
            worksheet.getCell(`K${i}`).dataValidation = { type: 'list', allowBlank: true, formulae: [`Lists!$C$2:$C$${statuses.length + 1}`] };
            worksheet.getCell(`Y${i}`).dataValidation = { type: 'list', allowBlank: true, formulae: [`Lists!$D$2:$D$${conditions.length + 1}`] };
        }

        // 4. FIELD DEFINITIONS SHEET
        const defSheet = workbook.addWorksheet('Field_Definitions');
        defSheet.columns = [
            { header: 'Field Name', key: 'field', width: 25 },
            { header: 'Required', key: 'req', width: 10 },
            { header: 'Data Type', key: 'type', width: 15 },
            { header: 'Definition / Rules', key: 'def', width: 50 },
        ];
        defSheet.getRow(1).font = { bold: true };
        defSheet.addRows([
            ['Asset ID', 'Yes', 'Text/Number', 'Unique identifier for the asset.'],
            ['Asset Name', 'Yes', 'Text', 'The descriptive name of the asset.'],
            ['Category', 'Yes', 'Dropdown', 'Select from Categories list.'],
            ['Department', 'Yes', 'Text', 'Department owning the asset.'],
            ['Location', 'Yes', 'Dropdown', 'Select from Locations list.'],
            ['Acquisition Date', 'Yes', 'Date', 'Format: YYYY-MM-DD'],
            ['Cost', 'Yes', 'Number', 'Purchase value of the asset.'],
            ['Currency', 'Yes', 'Dropdown', 'INR, USD, etc.'],
            ['Useful Life', 'Yes', 'Number', 'In Months.'],
            ['Depreciation Method', 'Yes', 'Dropdown', 'Select from Methods list.'],
            ['Status', 'Yes', 'Dropdown', 'Current status of the asset.'],
            ['Description', 'No', 'Text', 'Detailed asset description.'],
            ['Subcategory', 'No', 'Text', 'Nested category.'],
            ['Serial Number', 'No', 'Text', 'Manufacturer serial number.'],
            ['Tag Number', 'No', 'Text', 'Internal tag/RFID number.'],
            ['Custodian', 'No', 'Text', 'Person responsible for the asset.'],
            ['Supplier', 'No', 'Text', 'Vendor who sold the asset.'],
            ['PO No.', 'No', 'Text', 'Purchase Order Number.'],
            ['Invoice No.', 'No', 'Text', 'Purchase Invoice Number.'],
            ['In Service Date', 'No', 'Date', 'Date when asset started working (YYYY-MM-DD).'],
            ['Warranty Expiry', 'No', 'Date', 'Warranty end date (YYYY-MM-DD).'],
            ['Quantity', 'No', 'Number', 'Number of units (default 1).'],
            ['Salvage Value', 'No', 'Number', 'Value at the end of useful life.'],
            ['Opening Acc. Dep.', 'No', 'Number', 'Accumulated depreciation till date.'],
            ['Asset Condition', 'No', 'Dropdown', 'Select from Conditions list.'],
            ['GL Account', 'No', 'Text', 'General Ledger account code.'],
            ['Cost Center', 'No', 'Text', 'Cost Center code.'],
            ['Project Code', 'No', 'Text', 'Project identifier.'],
            ['Verification Date', 'No', 'Date', 'Last physical check (YYYY-MM-DD).'],
            ['Notes', 'No', 'Text', 'Any additional comments.'],
        ]);

        const buffer = await workbook.xlsx.writeBuffer();
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=fixed_assets_register_template.xlsx');
        
        return res.status(200).send(buffer);
    } catch (error) {
        console.error('EXPORT TEMPLATE ERROR:', error);
        res.status(500).json({ message: 'Internal Server Error during Excel generation: ' + error.message });
    }
});

// ── IMPORT EXCEL ──────────────────────────────────────────────────────────
export const importFixedAssetsExcel = asyncHandler(async (req, res) => {
    if (!req.file) throw new ApiError(400, 'Please upload an Excel file');

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(req.file.buffer);
    const worksheet = workbook.getWorksheet('Asset_Register_Template') || workbook.worksheets[0];

    if (!worksheet) throw new ApiError(400, 'Invalid Excel file: main template sheet not found');

    const assetsToInsert = [];
    const errors = [];

    // Header mapping
    const headerRow = worksheet.getRow(1);
    const colMap = {};
    headerRow.eachCell((cell, colNumber) => {
        const val = cell.value?.toString().trim().toLowerCase() || '';
        if (val.includes('asset id')) colMap.assetCode = colNumber;
        else if (val.includes('asset name')) colMap.assetName = colNumber;
        else if (val.includes('category')) colMap.category = colNumber;
        else if (val.includes('department')) colMap.department = colNumber;
        else if (val.includes('location')) colMap.location = colNumber;
        else if (val.includes('acquisition date')) colMap.purchaseDate = colNumber;
        else if (val.includes('cost')) colMap.purchaseValue = colNumber;
        else if (val.includes('currency')) colMap.currency = colNumber;
        else if (val.includes('useful life')) colMap.usefulLife = colNumber;
        else if (val.includes('depreciation method')) colMap.depreciationMethod = colNumber;
        else if (val.includes('status')) colMap.status = colNumber;
        else if (val.includes('description')) colMap.assetDescription = colNumber;
        else if (val.includes('subcategory')) colMap.subcategory = colNumber;
        else if (val.includes('serial number')) colMap.serialNo = colNumber;
        else if (val.includes('tag number')) colMap.identificationNo = colNumber;
        else if (val.includes('custodian')) colMap.custodian = colNumber;
        else if (val.includes('supplier')) colMap.supplier = colNumber;
        else if (val.includes('po no')) colMap.poNo = colNumber;
        else if (val.includes('invoice no')) colMap.purchaseInvoiceNo = colNumber;
        else if (val.includes('in service date')) colMap.putToUseDate = colNumber;
        else if (val.includes('warranty expiry')) colMap.warrantyEndDate = colNumber;
        else if (val.includes('quantity')) colMap.quantity = colNumber;
        else if (val.includes('salvage value')) colMap.residualValue = colNumber;
        else if (val.includes('opening accumulated')) colMap.accumulatedDepreciation = colNumber;
        else if (val.includes('asset condition')) colMap.condition = colNumber;
        else if (val.includes('gl account')) colMap.glAccount = colNumber;
        else if (val.includes('cost center')) colMap.costCenter = colNumber;
        else if (val.includes('project code')) colMap.projectCode = colNumber;
        else if (val.includes('verification date')) colMap.lastPhysicalVerificationDate = colNumber;
        else if (val.includes('notes')) colMap.remarks = colNumber;
    });

    // Required fields check in template
    const requiredCols = ['assetCode', 'assetName', 'category', 'department', 'location', 'purchaseDate', 'purchaseValue', 'currency', 'usefulLife', 'depreciationMethod', 'status'];
    for (const col of requiredCols) {
        if (!colMap[col]) throw new ApiError(400, `Missing required column: ${col}`);
    }

    // Cache for Lookups
    const categoryCache = {};
    const locationCache = {};
    const supplierCache = {};

    const getCategory = async (name) => {
        if (categoryCache[name]) return categoryCache[name];
        const cat = await AssetCategory.findOne({ name: { $regex: new RegExp(`^${name}$`, 'i') } });
        if (cat) categoryCache[name] = cat._id;
        return cat?._id || null;
    };

    const getLocation = async (name) => {
        if (locationCache[name]) return locationCache[name];
        const loc = await AssetLocation.findOne({ name: { $regex: new RegExp(`^${name}$`, 'i') } });
        if (loc) locationCache[name] = loc._id;
        return loc?._id || null;
    };

    const getSupplier = async (name) => {
        if (supplierCache[name]) return supplierCache[name];
        const sup = await Supplier.findOne({ supplierName: { $regex: new RegExp(`^${name}$`, 'i') } });
        if (sup) supplierCache[name] = sup._id;
        return sup?._id || null;
    };

    // Process rows
    for (let i = 2; i <= worksheet.rowCount; i++) {
        const row = worksheet.getRow(i);
        if (!row.hasValues) continue;

        try {
            const data = {};
            for (const [key, colIdx] of Object.entries(colMap)) {
                let val = row.getCell(colIdx).value;
                if (val && typeof val === 'object' && val.richText) {
                    val = val.richText.map(t => t.text).join('');
                }
                data[key] = val;
            }

            // Validations & Conversions
            if (!data.assetName) { errors.push(`Row ${i}: Asset Name is required`); continue; }
            
            const categoryId = await getCategory(data.category);
            if (!categoryId) { errors.push(`Row ${i}: Category "${data.category}" not found`); continue; }
            data.category = categoryId;

            const locationId = await getLocation(data.location);
            if (!locationId) { errors.push(`Row ${i}: Location "${data.location}" not found`); continue; }
            data.location = locationId;

            if (data.supplier) {
                const supplierId = await getSupplier(data.supplier);
                data.supplier = supplierId || undefined; // If not found, skip or handle as null
            }

            // Numeric conversions
            data.purchaseValue = Number(data.purchaseValue) || 0;
            data.usefulLife = Number(data.usefulLife) || 0;
            data.quantity = Number(data.quantity) || 1;
            data.residualValue = Number(data.residualValue) || 0;
            data.accumulatedDepreciation = Number(data.accumulatedDepreciation) || 0;

            // Date conversions
            const parseDate = (d) => {
                if (!d) return null;
                const date = new Date(d);
                return isNaN(date.getTime()) ? null : date;
            };
            data.purchaseDate = parseDate(data.purchaseDate);
            data.putToUseDate = parseDate(data.putToUseDate);
            data.warrantyEndDate = parseDate(data.warrantyEndDate);
            data.lastPhysicalVerificationDate = parseDate(data.lastPhysicalVerificationDate);

            if (!data.purchaseDate) { errors.push(`Row ${i}: Invalid Acquisition Date`); continue; }

            // Calculations
            data.capitalizedCost = data.purchaseValue; // Simple assumption for import
            data.currentBookValue = data.capitalizedCost - data.accumulatedDepreciation;

            assetsToInsert.push({ rowIdx: i, data });

        } catch (err) {
            errors.push(`Row ${i}: ${err.message}`);
        }
    }

    if (assetsToInsert.length === 0) {
        return res.status(400).json(new ApiResponse(400, { errors }, 'No valid assets to import'));
    }

    let successCount = 0;
    for (const item of assetsToInsert) {
        try {
            let asset;
            if (item.data.assetCode) {
                asset = await FixedAsset.findOne({ assetCode: item.data.assetCode.toUpperCase() });
            }

            if (asset) {
                // Update
                Object.assign(asset, item.data);
                asset.updatedBy = req.user._id;
                await asset.save();
            } else {
                // Create
                if (!item.data.assetCode) {
                    item.data.assetCode = await generateAssetCode(item.data.category);
                }
                await FixedAsset.create({ ...item.data, createdBy: req.user._id });
            }
            successCount++;
        } catch (err) {
            errors.push(`Row ${item.rowIdx}: Failed to save - ${err.message}`);
        }
    }

    res.status(httpStatus.OK).json(new ApiResponse(httpStatus.OK, { successCount, errorCount: errors.length, errors }, `Imported ${successCount} assets successfully.`));
});
