import httpStatus from 'http-status';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { Item } from '../models/item.model.js';
import itemService from '../services/item.service.js';
import multer from 'multer';
import { ApiResponse } from '../utils/ApiResponse.js';

// Multer config for memory storage (for import)
export const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowed = [
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.ms-excel'
        ];
        if (allowed.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new ApiError(400, 'Only .xlsx or .xls files are allowed'), false);
        }
    }
});

// ── Auto-generate item code ─────────────────────────────────────────────────
const generateItemCode = async (itemType = 'ITEM') => {
    const prefix = {
        ELECTRICAL: 'JSK-EL',
        PCB: 'JSK-PCB',
        HOUSING: 'JSK-HSG',
        IC: 'JSK-IC',
        RESISTOR: 'JSK-RES',
        CAPACITOR: 'JSK-CAP',
        TRANSFORMER: 'JSK-TRF',
        WIRE: 'JSK-WR',
        PACKAGING: 'JSK-PKG',
        FINISHED_PRODUCT: 'JSK-FP',
        OTHER: 'JSK-ITM',
    }[itemType] || 'JSK-ITM';

    const count = await Item.countDocuments();
    return `${prefix}-${String(count + 1).padStart(4, '0')}`;
};

// ── CREATE ──────────────────────────────────────────────────────────────────
export const createItem = asyncHandler(async (req, res) => {
    const data = { ...req.body, createdBy: req.user.id };

    // Auto-generate code if not provided
    if (!data.itemCode || String(data.itemCode).trim() === '') {
        data.itemCode = await generateItemCode(data.itemType);
    } else {
        data.itemCode = String(data.itemCode).trim().toUpperCase();
    }

    // Check unique code
    const exists = await Item.findOne({ itemCode: data.itemCode });
    if (exists) throw new ApiError(httpStatus.CONFLICT, `Item code "${data.itemCode}" already exists`);

    // Seed currentStock from openingStock
    data.currentStock = data.openingStock ?? 0;

    const item = await Item.create(data);
    res.status(httpStatus.CREATED).send({ success: true, data: item });
});

// ── LIST ────────────────────────────────────────────────────────────────────
export const getItems = asyncHandler(async (req, res) => {
    const {
        search, itemCategory, itemType, isActive,
        page = 1, limit = 25, sortBy = 'itemName:asc'
    } = req.query;

    const filter = {};
    if (itemCategory) filter.itemCategory = itemCategory;
    if (itemType) filter.itemType = itemType;
    if (isActive !== undefined) filter.isActive = isActive === 'true';

    if (search) {
        // Handle concatenated string formats like "Code — Name" or "Code - Name"
        const searchParts = search.split(/\s+[—\-]\s+/).map(s => s.trim()).filter(Boolean);

        if (searchParts.length > 1) {
            filter.$or = [
                { itemCode: { $regex: searchParts[0], $options: 'i' } },
                { itemName: { $regex: searchParts[1], $options: 'i' } }
            ];
        } else {
            const safeSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            filter.$or = [
                { itemName: { $regex: safeSearch, $options: 'i' } },
                { itemCode: { $regex: safeSearch, $options: 'i' } },
                { hsnCode: { $regex: safeSearch, $options: 'i' } },
            ];
        }
    }

    const pageNum = Math.max(parseInt(page, 10), 1);
    const limitNum = Math.min(parseInt(limit, 10), 200);
    const skip = (pageNum - 1) * limitNum;

    const [field, dir] = sortBy.split(':');
    const sort = { [field || 'itemName']: dir === 'desc' ? -1 : 1 };

    const [items, total] = await Promise.all([
        Item.find(filter).sort(sort).skip(skip).limit(limitNum).lean(),
        Item.countDocuments(filter),
    ]);

    res.send({
        success: true,
        data: items,
        meta: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) }
    });
});

// ── SINGLE ──────────────────────────────────────────────────────────────────
export const getItem = asyncHandler(async (req, res) => {
    const item = await Item.findById(req.params.id);
    if (!item) throw new ApiError(httpStatus.NOT_FOUND, 'Item not found');
    res.send({ success: true, data: item });
});

// ── UPDATE ──────────────────────────────────────────────────────────────────
export const updateItem = asyncHandler(async (req, res) => {
    const item = await Item.findById(req.params.id);
    if (!item) throw new ApiError(httpStatus.NOT_FOUND, 'Item not found');

    // Prevent changing itemCode to one that already exists
    if (req.body.itemCode && req.body.itemCode !== item.itemCode) {
        const clash = await Item.findOne({ itemCode: req.body.itemCode.toUpperCase() });
        if (clash) throw new ApiError(httpStatus.CONFLICT, `Item code "${req.body.itemCode}" already in use`);
    }

    if (req.body.openingStock !== undefined) {
        const newOpeningStock = Number(req.body.openingStock);
        if (newOpeningStock !== item.openingStock) {
            const diff = newOpeningStock - (item.openingStock || 0);
            item.currentStock = (item.currentStock || 0) + diff;
        }
    }

    Object.assign(item, req.body);
    item.updatedBy = req.user.id;
    await item.save();
    res.send({ success: true, data: item });
});

// ── DELETE (soft) ────────────────────────────────────────────────────────────
export const deleteItem = asyncHandler(async (req, res) => {
    const item = await Item.findById(req.params.id);
    if (!item) throw new ApiError(httpStatus.NOT_FOUND, 'Item not found');
    item.isActive = false;
    item.updatedBy = req.user.id;
    await item.save();
    res.send({ success: true, message: 'Item deactivated successfully' });
});

// ── GENERATE CODE (utility endpoint) ────────────────────────────────────────
export const generateCode = asyncHandler(async (req, res) => {
    const code = await generateItemCode(req.query.itemType || 'OTHER');
    res.send({ success: true, data: { itemCode: code } });
});

// ── DOWNLOAD EXCEL TEMPLATE ───────────────────────────────────────────────────
export const downloadTemplate = asyncHandler(async (req, res) => {
    const ExcelJS = (await import('exceljs')).default;
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Item Template');

    worksheet.columns = [
        { header: 'Item Code',       key: 'itemCode',        width: 18 },
        { header: 'Item Name',       key: 'itemName',        width: 35 },
        { header: 'Group Name',      key: 'itemGroupName',   width: 25 },
        { header: 'Category',        key: 'itemCategory',    width: 20 },
        { header: 'Item Type',       key: 'itemType',        width: 20 },
        { header: 'UOM',             key: 'uom',             width: 10 },
        { header: 'Opening Stock',   key: 'openingStock',    width: 15 },
        { header: 'Min Stock',       key: 'minStockLevel',   width: 12 },
        { header: 'Max Stock',       key: 'maxStockLevel',   width: 12 },
        { header: 'Purchase Rate',   key: 'purchaseRate',    width: 15 },
        { header: 'Selling Price',   key: 'sellingPrice',    width: 15 },
        { header: 'MRP',             key: 'mrp',             width: 12 },
        { header: 'HSN Code',        key: 'hsnCode',         width: 15 },
        { header: 'Purchase GST %',  key: 'purchaseGst',     width: 14 },
        { header: 'Sales GST %',     key: 'salesGst',        width: 12 },
        { header: 'Default Supplier',key: 'defaultSupplier', width: 25 },
        { header: 'Warehouse',       key: 'warehouseLocation',width: 20 },
        { header: 'Points',          key: 'points',          width: 20 },
        { header: 'Remarks',         key: 'remarks',         width: 35 },
    ];

    // Style header row
    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF217346' } };
    worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };

    // Example row
    worksheet.addRow({
        itemCode: 'JSK-EL-0001',
        itemName: 'DALI LED Driver 40W',
        itemGroupName: 'LED Drivers',
        itemCategory: 'FINISHED_GOOD',
        itemType: 'ELECTRICAL',
        uom: 'NOS',
        openingStock: 100,
        minStockLevel: 10,
        maxStockLevel: 500,
        purchaseRate: 850,
        sellingPrice: 1200,
        mrp: 1500,
        hsnCode: '85044090',
        purchaseGst: 18,
        salesGst: 18,
        defaultSupplier: 'ABC Electronics',
        warehouseLocation: 'Rack A1',
        points: '40W, 700mA',
        remarks: 'Sample item'
    });

    // Data validation dropdowns
    const categories = ['RAW_MATERIAL', 'WIP', 'FINISHED_GOOD', 'TRADING', 'CONSUMABLE'];
    const uoms = ['NOS', 'PCS', 'METER', 'KG', 'BOX', 'SET', 'ROLL', 'LITRE'];
    const itemTypes = ['ELECTRICAL', 'PCB', 'HOUSING', 'IC', 'RESISTOR', 'CAPACITOR', 'TRANSFORMER', 'WIRE', 'PACKAGING', 'FINISHED_PRODUCT', 'OTHER'];

    for (let i = 2; i <= 1001; i++) {
        worksheet.getCell(`D${i}`).dataValidation = { type: 'list', allowBlank: true, formulae: [`"${categories.join(',')}"`] };
        worksheet.getCell(`F${i}`).dataValidation = { type: 'list', allowBlank: true, formulae: [`"${uoms.join(',')}"`] };
        worksheet.getCell(`E${i}`).dataValidation = { type: 'list', allowBlank: true, formulae: [`"${itemTypes.join(',')}"`] };
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=Item_Import_Template.xlsx');
    await workbook.xlsx.write(res);
    res.end();
});

// ── BULK IMPORT ITEMS ─────────────────────────────────────────────────────────
export const importItems = asyncHandler(async (req, res) => {
    if (!req.file) throw new ApiError(400, 'No file uploaded');

    const filename = req.file.originalname.toLowerCase();
    if (filename.endsWith('.xls')) {
        throw new ApiError(400, 'Legacy .xls files are not supported. Please use .xlsx format.');
    }

    const ExcelJS = (await import('exceljs')).default;
    const workbook = new ExcelJS.Workbook();
    try {
        await workbook.xlsx.load(req.file.buffer);
    } catch {
        throw new ApiError(400, 'Failed to parse Excel file. Please ensure it is a valid .xlsx file.');
    }

    let worksheet = workbook.worksheets.find(s => s.state === 'visible');
    if (!worksheet) worksheet = workbook.worksheets[0];
    if (!worksheet) throw new ApiError(400, 'No readable worksheets found in the file.');

    const results = { success: 0, failed: 0, duplicates: 0, errors: [] };
    const itemsToInsert = [];
    const seenCodes = new Set();

    const validCategories = ['RAW_MATERIAL', 'WIP', 'FINISHED_GOOD', 'TRADING', 'CONSUMABLE'];
    const validUoms = ['NOS', 'PCS', 'METER', 'KG', 'BOX', 'SET', 'ROLL', 'LITRE'];

    const getCellText = (cell) => {
        const v = cell.value;
        if (v === null || v === undefined) return '';
        if (v.richText) return v.richText.map(p => p.text).join('').trim();
        if (v.text !== undefined) return String(v.text).trim();
        if (v.result !== undefined) return String(v.result).trim();
        return String(v).trim();
    };

    const getCellNumber = (cell) => {
        const text = getCellText(cell);
        const num = Number(text);
        return isNaN(num) ? 0 : num;
    };

    // ── Build header map from row 1 ──────────────────────────────────────────────
    // Normalise a header label so "Item Code", "ITEM CODE", "item code" all match
    const normalise = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

    // Map from normalised header → 1-based column index
    const colMap = {};
    const headerRow = worksheet.getRow(1);
    headerRow.eachCell((cell, colNumber) => {
        const key = normalise(getCellText(cell));
        if (key) colMap[key] = colNumber;
    });

    // Helper: get value by header name (tries multiple aliases)
    const byHeader = (row, ...aliases) => {
        for (const alias of aliases) {
            const idx = colMap[normalise(alias)];
            if (idx !== undefined) return getCellText(row.getCell(idx));
        }
        return '';
    };
    const byHeaderNum = (row, ...aliases) => {
        const text = byHeader(row, ...aliases);
        const num = Number(text);
        return isNaN(num) ? 0 : num;
    };

    // ── Category normalisation: map common shorthands ────────────────────────────
    const categoryAliases = {
        'raw': 'RAW_MATERIAL', 'rawmaterial': 'RAW_MATERIAL', 'raw material': 'RAW_MATERIAL',
        'wip': 'WIP', 'semifinished': 'WIP',
        'finished': 'FINISHED_GOOD', 'finishedgood': 'FINISHED_GOOD', 'fg': 'FINISHED_GOOD',
        'trading': 'TRADING',
        'consumable': 'CONSUMABLE',
    };
    const resolveCategory = (raw) => {
        if (!raw) return '';
        const upper = raw.toUpperCase().trim();
        if (validCategories.includes(upper)) return upper;
        const aliased = categoryAliases[raw.toLowerCase().trim()];
        return aliased || upper; // return original-upper if no alias; validation will catch invalid
    };

    // ── UOM normalisation ─────────────────────────────────────────────────────────
    const resolveUom = (raw) => {
        if (!raw) return 'NOS';
        const upper = raw.toUpperCase().trim();
        if (validUoms.includes(upper)) return upper;
        // Map common variants
        const uomAliases = { 'NUMBER': 'NOS', 'NUMBERS': 'NOS', 'PIECE': 'PCS', 'PIECES': 'PCS', 'MTR': 'METER', 'METRE': 'METER', 'KGS': 'KG', 'KILOGRAM': 'KG' };
        return uomAliases[upper] || 'NOS'; // Default to NOS if unknown, don't error
    };

    worksheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return; // Skip header
        try {
            // Try header-based lookup first, then fall back to positional (for template files)
            const hasHeaders = Object.keys(colMap).length > 0;
            let itemCode, itemName, itemGroupName, itemCategory, itemType, uom;
            let openingStock, minStockLevel, maxStockLevel, purchaseRate, sellingPrice, mrp;
            let hsnCode, purchaseGst, salesGst, defaultSupplier, warehouseLocation, points, remarks;

            if (hasHeaders) {
                itemCode        = (byHeader(row, 'Item Code', 'ItemCode', 'Code', 'item_code') || '').toUpperCase();
                itemName        = byHeader(row, 'Item Name', 'ItemName', 'Name', 'item_name', 'description', 'Description');
                itemGroupName   = byHeader(row, 'Group Name', 'GroupName', 'Group', 'item_group');
                itemCategory    = resolveCategory(byHeader(row, 'Category', 'Item Category', 'ItemCategory', 'cat'));
                itemType        = (byHeader(row, 'Item Type', 'ItemType', 'Type', 'item_type') || 'OTHER').toUpperCase();
                uom             = resolveUom(byHeader(row, 'UOM', 'Unit', 'Unit of Measure', 'unit_of_measure'));
                openingStock    = byHeaderNum(row, 'Opening Stock', 'OpeningStock', 'opening_stock', 'Open Stock');
                minStockLevel   = byHeaderNum(row, 'Min Stock', 'MinStock', 'Minimum Stock', 'min_stock');
                maxStockLevel   = byHeaderNum(row, 'Max Stock', 'MaxStock', 'Maximum Stock', 'max_stock');
                purchaseRate    = byHeaderNum(row, 'Purchase Rate', 'PurchaseRate', 'Buy Price', 'Cost');
                sellingPrice    = byHeaderNum(row, 'Selling Price', 'SellingPrice', 'Sale Price', 'selling_price');
                mrp             = byHeaderNum(row, 'MRP', 'mrp', 'Maximum Retail Price');
                hsnCode         = byHeader(row, 'HSN Code', 'HSNCode', 'HSN', 'hsn');
                purchaseGst     = byHeaderNum(row, 'Purchase GST %', 'PurchaseGst', 'Purchase GST', 'purchase_gst') || 18;
                salesGst        = byHeaderNum(row, 'Sales GST %', 'SalesGst', 'Sales GST', 'sales_gst') || 18;
                defaultSupplier = byHeader(row, 'Default Supplier', 'Supplier', 'supplier');
                warehouseLocation = byHeader(row, 'Warehouse', 'warehouse', 'Location');
                points          = byHeader(row, 'Points', 'points', 'Specs', 'Specifications');
                remarks         = byHeader(row, 'Remarks', 'remarks', 'Notes', 'notes');
            } else {
                // Positional fallback (matches our generated template column order)
                itemCode        = getCellText(row.getCell(1)).toUpperCase();
                itemName        = getCellText(row.getCell(2));
                itemGroupName   = getCellText(row.getCell(3));
                itemCategory    = resolveCategory(getCellText(row.getCell(4)));
                itemType        = (getCellText(row.getCell(5)) || 'OTHER').toUpperCase();
                uom             = resolveUom(getCellText(row.getCell(6)));
                openingStock    = getCellNumber(row.getCell(7));
                minStockLevel   = getCellNumber(row.getCell(8));
                maxStockLevel   = getCellNumber(row.getCell(9));
                purchaseRate    = getCellNumber(row.getCell(10));
                sellingPrice    = getCellNumber(row.getCell(11));
                mrp             = getCellNumber(row.getCell(12));
                hsnCode         = getCellText(row.getCell(13));
                purchaseGst     = getCellNumber(row.getCell(14)) || 18;
                salesGst        = getCellNumber(row.getCell(15)) || 18;
                defaultSupplier = getCellText(row.getCell(16));
                warehouseLocation = getCellText(row.getCell(17));
                points          = getCellText(row.getCell(18));
                remarks         = getCellText(row.getCell(19));
            }

            // Skip empty rows
            if (!itemCode && !itemName) return;

            const rowErrors = [];

            if (!itemName) rowErrors.push('Item Name is required');

            // Category: if still invalid after resolution, warn but don't block — default to TRADING
            if (!itemCategory) {
                itemCategory = 'TRADING'; // safe default if completely missing
            } else if (!validCategories.includes(itemCategory)) {
                // Unknown → default to TRADING, add a note but don't block
                itemCategory = 'TRADING';
            }

            // Duplicate within file
            if (itemCode && seenCodes.has(itemCode)) {
                rowErrors.push(`Duplicate item code "${itemCode}" within file`);
                results.duplicates++;
            } else if (itemCode) {
                seenCodes.add(itemCode);
            }

            if (rowErrors.length > 0) {
                results.errors.push({ row: rowNumber, itemCode, itemName, errors: rowErrors });
                results.failed++;
            } else {
                itemsToInsert.push({
                    itemCode: itemCode || undefined,
                    itemName,
                    itemGroupName,
                    itemCategory,
                    itemType: itemType || 'OTHER',
                    uom,
                    openingStock,
                    currentStock: openingStock,
                    minStockLevel,
                    maxStockLevel,
                    purchaseRate,
                    sellingPrice,
                    mrp,
                    hsnCode,
                    purchaseGst,
                    salesGst,
                    defaultSupplier,
                    warehouseLocation,
                    points,
                    remarks,
                });
            }
        } catch (err) {
            results.errors.push({ row: rowNumber, errors: [`Unexpected error: ${err.message}`] });
            results.failed++;
        }
    });

    if (itemsToInsert.length > 0) {
        // Auto-generate codes for items that don't have one
        for (let i = 0; i < itemsToInsert.length; i++) {
            if (!itemsToInsert[i].itemCode) {
                itemsToInsert[i].itemCode = await generateItemCode(itemsToInsert[i].itemType || 'OTHER');
            }
        }

        // Check existing codes in DB
        const codesInFile = itemsToInsert.map(it => it.itemCode).filter(Boolean);
        const existingItems = codesInFile.length > 0 ? await itemService.findByItemCodes(codesInFile) : [];
        const existingCodes = new Set(existingItems.map(it => it.itemCode));

        const finalInserts = [];
        itemsToInsert.forEach(item => {
            if (existingCodes.has(item.itemCode)) {
                results.errors.push({
                    itemCode: item.itemCode,
                    itemName: item.itemName,
                    errors: [`Item code "${item.itemCode}" already exists in database`]
                });
                results.failed++;
                results.duplicates++;
            } else {
                finalInserts.push(item);
            }
        });

        if (finalInserts.length > 0) {
            await itemService.bulkCreateItems(finalInserts);
            results.success = finalInserts.length;
        }
    }

    res.send(new ApiResponse(200, results, 'Import completed'));
});
