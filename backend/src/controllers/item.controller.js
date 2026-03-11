import httpStatus from 'http-status';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { Item } from '../models/item.model.js';
import { ItemGroup } from '../models/itemGroup.model.js';
import reportService from '../services/report.service.js';
import pick from '../utils/pick.js';
import ExcelJS from 'exceljs';

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
        search, itemCategory, itemType, itemGroupName, isActive,
        page = 1, limit = 25, sortBy = 'itemName:asc'
    } = req.query;

    console.log('GET /items full query:', JSON.stringify(req.query, null, 2));

    const filter = {};
    if (itemCategory) filter.itemCategory = itemCategory;
    if (itemType) filter.itemType = itemType;
    if (itemGroupName) filter.itemGroupName = itemGroupName;
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
            const isNumeric = /^\d+$/.test(search.trim());

            if (isNumeric) {
                // ── Smart Numeric Search (e.g., "20") ──
                // Prevents matching "120.3" or "1206" when searching for "20"
                const num = search.trim();
                filter.$or = [
                    // Code matches: Ends with the number (e.g., I00020, JSK-20)
                    { itemCode: { $regex: `(?:^|\\D)0*${num}$`, $options: 'i' } },
                    // Name matches: Whole number match (e.g., "20mm", but NOT "120")
                    { itemName: { $regex: `(^|[^0-9])${num}([^0-9]|$)`, $options: 'i' } },
                    // HSN matches: Contains the number
                    { hsnCode: { $regex: num, $options: 'i' } },
                ];
            } else {
                const safeSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const standardRegex = { $regex: safeSearch, $options: 'i' };

                filter.$or = [
                    { itemName: standardRegex },
                    { itemCode: standardRegex },
                    { hsnCode: standardRegex },
                ];

                // ── Fuzzy Alphanumeric Search for Item Codes (e.g., "I20" -> /I.*20/i) ──
                const fuzzyMatch = search.trim().match(/^([a-zA-Z\s\-_]+)(\d+)$/);
                if (fuzzyMatch) {
                    const alpha = fuzzyMatch[1].replace(/[\s\-_]/g, '');
                    const num = fuzzyMatch[2];
                    if (alpha && num) {
                        filter.$or.push({
                            itemCode: { $regex: `${alpha}.*${num}`, $options: 'i' }
                        });
                    }
                }
            }
        }
    }

    const pageNum = Math.max(parseInt(page, 10), 1);
    const limitNum = Math.min(parseInt(limit, 10), 5000);
    const skip = (pageNum - 1) * limitNum;

    const [field, dir] = sortBy.split(':');
    const sortField = field || 'itemName';
    const sortDir = dir === 'desc' ? -1 : 1;
    const sort = { [sortField]: sortDir };

    const [items, total] = await Promise.all([
        Item.find(filter)
            .collation({ locale: 'en', numericOrdering: true })
            .sort(sort)
            .skip(skip)
            .limit(limitNum)
            .lean(),
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
// ── EXPORT TEMPLATE ────────────────────────────────────────────────────────
export const exportItemTemplate = asyncHandler(async (req, res) => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Items Template');

    // Define columns
    worksheet.columns = [
        { header: 'Item Code (Leave empty to auto-generate)', key: 'itemCode', width: 35 },
        { header: 'Item Name*', key: 'itemName', width: 40 },
        { header: 'Description', key: 'description', width: 40 },
        { header: 'Category (RAW_MATERIAL, WIP, FINISHED_GOOD, TRADING, CONSUMABLE)', key: 'itemCategory', width: 60 },
        { header: 'Group', key: 'itemGroupName', width: 20 },
        { header: 'Type', key: 'itemType', width: 20 },
        { header: 'HSN Code', key: 'hsnCode', width: 20 },
        { header: 'UOM*', key: 'uom', width: 15 },
        { header: 'Opening Stock', key: 'openingStock', width: 20 },
        { header: 'Faulty Stock', key: 'faultyStock', width: 20 },
        { header: 'Min Stock Level', key: 'minStockLevel', width: 20 },
        { header: 'Selling Price', key: 'sellingPrice', width: 20 },
        { header: 'Purchase Price', key: 'purchasePrice', width: 20 },
        { header: 'Active (TRUE/FALSE)', key: 'isActive', width: 20 }
    ];

    // Style header
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE0E0E0' }
    };

    const buffer = await workbook.xlsx.writeBuffer();

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=Item_Master_Template.xlsx`);
    res.send(buffer);
});

// ── IMPORT EXCEL ──────────────────────────────────────────────────────────
export const importItemsExcel = asyncHandler(async (req, res) => {
    if (!req.file) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Please upload an Excel file');
    }

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(req.file.buffer);
    const worksheet = workbook.worksheets[0]; // Get the first worksheet

    if (!worksheet) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid Excel file format');
    }

    const itemsToInsert = [];
    const errors = [];
    let rowCount = 0;

    // Validate headers and find column indexes
    const headerRow = worksheet.getRow(1);
    const colMap = {};
    headerRow.eachCell((cell, colNumber) => {
        const val = cell.value?.toString().trim().toLowerCase() || '';
        if (val.includes('item code')) colMap.itemCode = colNumber;
        else if (val.includes('item name')) colMap.itemName = colNumber;
        else if (val.includes('description')) colMap.description = colNumber;
        else if (val.includes('category')) colMap.category = colNumber;
        else if (val.includes('group')) colMap.group = colNumber;
        else if (val.includes('type')) colMap.type = colNumber;
        else if (val.includes('hsn')) colMap.hsn = colNumber;
        else if (val.includes('uom')) colMap.uom = colNumber;
        else if (val.includes('opening stock')) colMap.openingStock = colNumber;
        else if (val.includes('faulty stock')) colMap.faultyStock = colNumber;
        else if (val.includes('min stock')) colMap.minStock = colNumber;
        else if (val.includes('selling price')) colMap.sellingPrice = colNumber;
        else if (val.includes('purchase price')) colMap.purchasePrice = colNumber;
        else if (val.includes('active')) colMap.active = colNumber;
    });

    if (!colMap.itemName) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid template format. Could not find "Item Name" column.');
    }

    const parseCategory = (val) => {
        if (!val) return 'RAW_MATERIAL';
        const str = val.toUpperCase().replace(/[^A-Z_]/g, '');
        if (str.includes('FINISH') || str.includes('FINISHED')) return 'FINISHED_GOOD';
        if (str.includes('WIP') || str.includes('SEMI')) return 'WIP';
        if (str.includes('TRADE') || str.includes('TRADING')) return 'TRADING';
        if (str.includes('CONSUME') || str.includes('CONSUMABLE')) return 'CONSUMABLE';
        return 'RAW_MATERIAL'; // Default
    };

    const parseUom = (val) => {
        if (!val) return 'NOS';
        const str = val.toUpperCase().trim();
        const valid = ['NOS', 'PCS', 'METER', 'KG', 'BOX', 'SET', 'ROLL', 'LITRE'];
        if (valid.includes(str)) return str;
        if (str === 'NO' || str === 'NUMBERS') return 'NOS';
        if (str === 'PIECES' || str === 'PC') return 'PCS';
        if (str === 'MTR' || str === 'METERS') return 'METER';
        if (str === 'KGS' || str === 'KILOGRAM') return 'KG';
        if (str === 'BOXES') return 'BOX';
        if (str === 'SETS') return 'SET';
        if (str === 'ROLLS') return 'ROLL';
        if (str === 'LTR' || str === 'LITERS') return 'LITRE';
        return 'NOS';
    };

    // Process rows starting from row 2
    for (let i = 2; i <= worksheet.rowCount; i++) {
        const row = worksheet.getRow(i);
        // Skip empty rows
        if (!row.hasValues) continue;

        rowCount++;

        try {
            const rawItemCode = colMap.itemCode ? (row.getCell(colMap.itemCode).value?.toString().trim() || '') : '';
            const itemName = colMap.itemName ? row.getCell(colMap.itemName).value?.toString().trim() : '';
            const description = colMap.description ? (row.getCell(colMap.description).value?.toString().trim() || '') : '';

            const rawCategory = colMap.category ? (row.getCell(colMap.category).value?.toString().trim() || '') : '';
            const itemCategory = parseCategory(rawCategory);

            const itemGroupName = colMap.group ? row.getCell(colMap.group).value?.toString().trim() : undefined;
            const itemType = colMap.type ? (row.getCell(colMap.type).value?.toString().trim() || 'OTHER') : 'OTHER';
            const hsnCode = colMap.hsn ? (row.getCell(colMap.hsn).value?.toString().trim() || '') : '';

            const rawUom = colMap.uom ? (row.getCell(colMap.uom).value?.toString().trim() || '') : '';
            const uom = parseUom(rawUom);

            const openingStock = colMap.openingStock ? (Number(row.getCell(colMap.openingStock).value) || 0) : 0;
            const faultyStock = colMap.faultyStock ? (Number(row.getCell(colMap.faultyStock).value) || 0) : 0;
            const minStockLevel = colMap.minStock ? (Number(row.getCell(colMap.minStock).value) || 0) : 0;
            const sellingPrice = colMap.sellingPrice ? (Number(row.getCell(colMap.sellingPrice).value) || 0) : 0;
            const purchasePrice = colMap.purchasePrice ? (Number(row.getCell(colMap.purchasePrice).value) || 0) : 0;

            // Handle boolean or string for isActive
            let isActive = true;
            if (colMap.active) {
                const activeVal = row.getCell(colMap.active).value;
                if (activeVal !== null && activeVal !== undefined) {
                    const strVal = activeVal.toString().trim().toLowerCase();
                    if (strVal === 'false' || strVal === '0') isActive = false;
                }
            }

            if (!itemName) {
                errors.push(`Row ${i}: Item Name is required`);
                continue;
            }

            let itemCode = rawItemCode;
            if (!itemCode) {
                // We will auto-generate it later just before insert to avoid duplicates in batch
                itemCode = null;
            } else {
                itemCode = itemCode.toUpperCase();
            }

            itemsToInsert.push({
                rowNum: i,
                itemData: {
                    itemCode,
                    itemName,
                    description,
                    itemCategory,
                    itemGroupName,
                    itemType,
                    hsnCode,
                    uom,
                    openingStock,
                    currentStock: openingStock + faultyStock, // Seed currentStock with both healthy and faulty
                    faultyStock,
                    minStockLevel,
                    sellingPrice,
                    purchasePrice,
                    isActive,
                    createdBy: req.user.id
                }
            });

        } catch (error) {
            errors.push(`Row ${i}: Error processing data - ${error.message}`);
        }
    }

    if (itemsToInsert.length === 0) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'No valid data found in the Excel file');
    }

    // Auto-create missing Item Groups
    const uniqueGroups = [...new Set(itemsToInsert.map(i => i.itemData.itemGroupName).filter(Boolean))];
    for (const gName of uniqueGroups) {
        // Escape special characters for regex search (e.g. parentheses in "Digital Dimmer (JUDDN)")
        const safeGName = gName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const exists = await ItemGroup.findOne({ name: { $regex: new RegExp(`^${safeGName}$`, 'i') } });

        if (!exists) {
            let baseCode = gName.replace(/[^A-Z0-9]/ig, '').substring(0, 10).toUpperCase() || 'GRP';
            try {
                await ItemGroup.create({ name: gName, code: baseCode, createdBy: req.user.id });
            } catch (err) {
                // If collision, try with random code or handle existing name
                if (err.code === 11000) {
                    // If it was a code collision, try once more with a random code
                    if (err.keyPattern && err.keyPattern.code) {
                        try {
                            await ItemGroup.create({
                                name: gName,
                                code: `${baseCode}_${Math.floor(Math.random() * 10000)}`,
                                createdBy: req.user.id
                            });
                        } catch (err2) {
                            // If name collision or second code collision, just ignore as group effectively exists
                            console.log(`Note: Item Group "${gName}" creation skipped during import (already exists or collision).`);
                        }
                    }
                }
            }
        }
    }

    // Insert items one by one to handle code generation correctly and individual failures
    let successCount = 0;

    // We could potentially do bulk insert, but since we have auto-generating item codes that depend on the count,
    // sequential inserts are safer, though slightly slower. For typical item masters (a few thousand max), it's acceptable.
    for (const itemObj of itemsToInsert) {
        try {
            let codeToUse = itemObj.itemData.itemCode;

            if (codeToUse) {
                const existing = await Item.findOne({ itemCode: codeToUse });
                if (existing) {
                    // It exists, so we update it with new data
                    // First, remove currentStock from itemData so we don't blindly overwrite it
                    delete itemObj.itemData.currentStock;

                    // If opening stock changed, adjust current stock accordingly
                    if (itemObj.itemData.openingStock !== undefined && itemObj.itemData.openingStock !== existing.openingStock) {
                        const diff = itemObj.itemData.openingStock - (existing.openingStock || 0);
                        existing.currentStock = (existing.currentStock || 0) + diff;
                    }

                    Object.assign(existing, itemObj.itemData);
                    existing.updatedBy = req.user.id;
                    await existing.save();

                    successCount++;
                    continue; // Skip the create below
                }
            } else {
                codeToUse = await generateItemCode(itemObj.itemData.itemType);
                itemObj.itemData.itemCode = codeToUse;
            }

            await Item.create(itemObj.itemData);
            successCount++;
        } catch (err) {
            errors.push(`Row ${itemObj.rowNum}: Failed to save - ${err.message}`);
        }
    }

    const message = `Successfully imported ${successCount} items. ${errors.length > 0 ? `Encountered ${errors.length} errors.` : ''}`;

    res.status(httpStatus.OK).send({
        success: true,
        message,
        errors: errors.length > 0 ? errors : undefined,
        successCount,
        errorCount: errors.length
    });
});

export const generateCode = asyncHandler(async (req, res) => {
    const code = await generateItemCode(req.query.itemType || 'OTHER');
    res.send({ success: true, data: { itemCode: code } });
});

export const exportItemsExcel = asyncHandler(async (req, res) => {
    res.status(501).send({ success: false, message: 'Not Implemented' });
});

export const exportItemsPDF = asyncHandler(async (req, res) => {
    res.status(501).send({ success: false, message: 'Not Implemented' });
});
