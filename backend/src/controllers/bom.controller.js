import httpStatus from 'http-status';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { BOM } from '../models/bom.model.js';
import { Item } from '../models/item.model.js';
import pick from '../utils/pick.js';
import ExcelJS from 'exceljs';

// ── CREATE ────────────────────────────────────────────────────────────────────
export const createBOM = asyncHandler(async (req, res) => {
    const bomBody = req.body;

    // Generate BOM Number if not provided
    if (!bomBody.bomNumber) {
        const item = await Item.findById(bomBody.finishedProductId);
        if (!item) throw new ApiError(httpStatus.NOT_FOUND, 'Finished Product not found');

        const count = await BOM.countDocuments();
        const prefix = item.itemCode.substring(0, 5);
        bomBody.bomNumber = `BOM-${prefix}-${(count + 1).toString().padStart(3, '0')}`;
    }

    const exists = await BOM.findOne({ bomNumber: bomBody.bomNumber.toUpperCase() });
    if (exists) throw new ApiError(httpStatus.CONFLICT, 'BOM Number already exists');

    // If setting as default, unset others for this product
    if (bomBody.isDefault) {
        await BOM.updateMany({ finishedProductId: bomBody.finishedProductId }, { isDefault: false });
    }

    const bom = await BOM.create({
        ...bomBody,
        createdBy: req.user.id
    });

    res.status(httpStatus.CREATED).send({ success: true, data: bom });
});

// ── LIST ──────────────────────────────────────────────────────────────────────
export const getBOMs = asyncHandler(async (req, res) => {
    const filters = pick(req.query, ['finishedProductId', 'bomNumber', 'search', 'status', 'bomType']);
    const options = pick(req.query, ['sortBy', 'limit', 'page']);

    const query = {};
    if (filters.finishedProductId) query.finishedProductId = filters.finishedProductId;
    if (filters.status) query.status = filters.status;
    if (filters.bomType) query.bomType = filters.bomType;
    // support both `bomNumber` and `search` for flexible querying
    const searchTerm = filters.search || filters.bomNumber;
    if (searchTerm) query.bomNumber = { $regex: searchTerm, $options: 'i' };

    const limit = options.limit && parseInt(options.limit, 10) > 0 ? parseInt(options.limit, 10) : 10;
    const page = options.page && parseInt(options.page, 10) > 0 ? parseInt(options.page, 10) : 1;
    const skip = (page - 1) * limit;

    const boms = await BOM.find(query)
        .populate('finishedProductId', 'itemName itemCode itemCategory uom')
        .sort(options.sortBy || '-createdAt')
        .skip(skip)
        .limit(limit);

    const totalResults = await BOM.countDocuments(query);

    res.send({
        success: true,
        data: boms,
        page,
        limit,
        totalPages: Math.ceil(totalResults / limit),
        totalResults
    });
});

// ── GET BY ID ─────────────────────────────────────────────────────────────────
export const getBOM = asyncHandler(async (req, res) => {
    const bom = await BOM.findById(req.params.id)
        .populate('finishedProductId', 'itemName itemCode itemCategory uom')
        .populate('components.itemId', 'itemName itemCode uom itemCategory purchaseRate');

    if (!bom) throw new ApiError(httpStatus.NOT_FOUND, 'BOM not found');
    res.send({ success: true, data: bom });
});

// ── UPDATE ────────────────────────────────────────────────────────────────────
export const updateBOM = asyncHandler(async (req, res) => {
    const bom = await BOM.findById(req.params.id);
    if (!bom) throw new ApiError(httpStatus.NOT_FOUND, 'BOM not found');

    // If setting as default, unset others for this product
    if (req.body.isDefault && !bom.isDefault) {
        await BOM.updateMany({ finishedProductId: bom.finishedProductId }, { isDefault: false });
    }

    const updatedBOM = await BOM.findByIdAndUpdate(
        req.params.id,
        { ...req.body, updatedBy: req.user.id },
        { new: true, runValidators: true }
    );

    res.send({ success: true, data: updatedBOM });
});

// ── DELETE ────────────────────────────────────────────────────────────────────
export const deleteBOM = asyncHandler(async (req, res) => {
    const bom = await BOM.findById(req.params.id);
    if (!bom) throw new ApiError(httpStatus.NOT_FOUND, 'BOM not found');
    await bom.deleteOne();
    res.send({ success: true, message: 'BOM deleted successfully' });
});

// ── EXPORT TEMPLATE ──────────────────────────────────────────────────────────
export const exportBOMTemplate = asyncHandler(async (req, res) => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('BOM Template');

    // Define columns
    // Headers designed to be intuitive
    worksheet.columns = [
        { header: 'BOM Number (BOM-XXXX-XXX)', key: 'bomNumber', width: 30 },
        { header: 'Product Code*', key: 'productCode', width: 25 },
        { header: 'BOM Type (Production/Sub-Assembly)', key: 'bomType', width: 25 },
        { header: 'Version (V1, V2...)', key: 'version', width: 15 },
        { header: 'Production Qty (Finished Product Output)', key: 'productionQuantity', width: 30 },
        { header: 'Is Default? (TRUE/FALSE)', key: 'isDefault', width: 15 },
        { header: 'Component Code*', key: 'componentCode', width: 25 },
        { header: 'Component Qty*', key: 'componentQty', width: 15 },
        { header: 'Component Points (Labour)', key: 'points', width: 20 },
        { header: 'Remarks', key: 'remarks', width: 30 }
    ];

    // Style header
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };

    // Add a sample row
    worksheet.addRow({
        bomNumber: 'BOM-SAMPLE-001',
        productCode: 'ITEM-CODE-1',
        bomType: 'Production',
        version: 'V1',
        productionQuantity: 1,
        isDefault: 'TRUE',
        componentCode: 'RAW-MAT-1',
        componentQty: 2.5,
        points: 4,
        remarks: 'Sample entry'
    });

    const buffer = await workbook.xlsx.writeBuffer();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=BOM_Import_Template.xlsx');
    res.send(buffer);
});

// ── IMPORT EXCEL ──────────────────────────────────────────────────────────────
export const importBOMsExcel = asyncHandler(async (req, res) => {
    if (!req.file) throw new ApiError(httpStatus.BAD_REQUEST, 'Please upload an Excel file');

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(req.file.buffer);
    const worksheet = workbook.worksheets[0];
    if (!worksheet) throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid Excel file');

    const headerRow = worksheet.getRow(1);
    const colMap = {};
    headerRow.eachCell((cell, colNumber) => {
        const h = cell.value?.toString().trim().toLowerCase() || '';
        if (h.includes('bom number')) colMap.bomNumber = colNumber;
        else if (h.includes('product code')) colMap.productCode = colNumber;
        else if (h.includes('bom type')) colMap.bomType = colNumber;
        else if (h.includes('version')) colMap.version = colNumber;
        else if (h.includes('production qty')) colMap.productionQuantity = colNumber;
        else if (h.includes('default')) colMap.isDefault = colNumber;
        else if (h.includes('component code')) colMap.componentCode = colNumber;
        else if (h.includes('component qty')) colMap.componentQty = colNumber;
        else if (h.includes('points')) colMap.points = colNumber;
        else if (h.includes('remarks')) colMap.remarks = colNumber;
    });

    if (!colMap.productCode || !colMap.componentCode) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Missing required columns (Product Code or Component Code)');
    }

    const bomGroups = new Map(); // Key: bomNumber || productCode+version

    for (let i = 2; i <= worksheet.rowCount; i++) {
        const row = worksheet.getRow(i);
        if (!row.hasValues) continue;

        const productCode = row.getCell(colMap.productCode).value?.toString().trim();
        const componentCode = row.getCell(colMap.componentCode).value?.toString().trim();
        if (!productCode || !componentCode) continue;

        const bomNumber = row.getCell(colMap.bomNumber).value?.toString().trim();
        const version = row.getCell(colMap.version).value?.toString().trim() || 'V1';
        
        const groupKey = bomNumber || `${productCode}-${version}`;

        if (!bomGroups.has(groupKey)) {
            bomGroups.set(groupKey, {
                bomNumber,
                productCode,
                version,
                bomType: row.getCell(colMap.bomType).value?.toString().trim() || 'Production',
                productionQuantity: Number(row.getCell(colMap.productionQuantity).value) || 1,
                isDefault: String(row.getCell(colMap.isDefault).value).toLowerCase() === 'true',
                components: []
            });
        }

        bomGroups.get(groupKey).components.push({
            itemCode: componentCode,
            quantity: Number(row.getCell(colMap.componentQty).value) || 0,
            points: Number(row.getCell(colMap.points).value) || 0,
            remarks: row.getCell(colMap.remarks)?.value?.toString().trim() || ''
        });
    }

    let successCount = 0;
    const errors = [];

    for (const [key, bData] of bomGroups) {
        try {
            // Find finished product
            const fProduct = await Item.findOne({ itemCode: bData.productCode.toUpperCase() });
            if (!fProduct) {
                errors.push(`BOM ${key}: Product ${bData.productCode} not found`);
                continue;
            }

            // Resolve components
            const resolvedComponents = [];
            let totalRawMaterialCost = 0;
            let totalPoints = 0;

            for (const comp of bData.components) {
                const cItem = await Item.findOne({ itemCode: comp.itemCode.toUpperCase() });
                if (!cItem) {
                    errors.push(`BOM ${key}: Component ${comp.itemCode} not found`);
                    continue;
                }

                const rate = cItem.purchaseRate || 0;
                const totalCost = comp.quantity * rate;
                totalRawMaterialCost += totalCost;
                totalPoints += comp.points;

                resolvedComponents.push({
                    itemId: cItem._id,
                    itemCode: cItem.itemCode,
                    itemName: cItem.itemName,
                    category: cItem.itemCategory,
                    uom: cItem.uom,
                    quantity: comp.quantity,
                    rate,
                    totalCost,
                    points: comp.points,
                    remarks: comp.remarks
                });
            }

            if (resolvedComponents.length === 0) {
                errors.push(`BOM ${key}: No valid components found`);
                continue;
            }

            // Calculate simple costs (logic often handled by frontend, but good to baseline here)
            const labourCostPerPoint = 0.25; // Default from model
            const totalPointsLabourCost = totalPoints * labourCostPerPoint;
            const finalProductionCostPerUnit = (totalRawMaterialCost + totalPointsLabourCost) / bData.productionQuantity;

            const finalBData = {
                bomNumber: bData.bomNumber,
                finishedProductId: fProduct._id,
                bomType: bData.bomType,
                version: bData.version,
                productionQuantity: bData.productionQuantity,
                isDefault: bData.isDefault,
                components: resolvedComponents,
                totalRawMaterialCost,
                totalPointsLabourCost,
                finalProductionCostPerUnit,
                createdBy: req.user.id
            };

            // Upsert
            if (finalBData.bomNumber) {
                await BOM.findOneAndUpdate({ bomNumber: finalBData.bomNumber.toUpperCase() }, finalBData, { upsert: true, new: true, runValidators: true });
            } else {
                // If no BOM Number, try to find existing by product + version or create new
                const existing = await BOM.findOne({ finishedProductId: fProduct._id, version: bData.version });
                if (existing) {
                    await BOM.findByIdAndUpdate(existing._id, finalBData);
                } else {
                    // Generate BOM Number if missing (referencing logic in createBOM)
                    const count = await BOM.countDocuments();
                    const prefix = fProduct.itemCode.substring(0, 5);
                    finalBData.bomNumber = `BOM-${prefix}-${(count + 1).toString().padStart(3, '0')}`;
                    await BOM.create(finalBData);
                }
            }

            successCount++;
        } catch (err) {
            errors.push(`BOM ${key}: Save failed - ${err.message}`);
        }
    }

    res.send({
        success: true,
        message: `Imported ${successCount} BOMs. ${errors.length} errors.`,
        successCount,
        errors: errors.length > 0 ? errors : undefined
    });
});
