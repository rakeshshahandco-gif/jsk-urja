import httpStatus from 'http-status';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { BOM } from '../models/bom.model.js';
import { Item } from '../models/item.model.js';
import pick from '../utils/pick.js';
import ExcelJS from 'exceljs';
import PDFService from '../services/pdf.service.js';
import { CompanyProfile } from '../models/companyProfile.model.js';
import { normalizeBomSectionsForRead, normalizeBomSectionsForWrite } from '../utils/bomSection.utils.js';

// ── CREATE ────────────────────────────────────────────────────────────────────
export const createBOM = asyncHandler(async (req, res) => {
    const bomBody = normalizeBomSectionsForWrite(req.body);

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
        data: boms.map((b) => normalizeBomSectionsForRead(b)),
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
    res.send({ success: true, data: normalizeBomSectionsForRead(bom) });
});

// ── UPDATE ────────────────────────────────────────────────────────────────────
export const updateBOM = asyncHandler(async (req, res) => {
    const bom = await BOM.findById(req.params.id);
    if (!bom) throw new ApiError(httpStatus.NOT_FOUND, 'BOM not found');

    // If setting as default, unset others for this product
    if (req.body.isDefault && !bom.isDefault) {
        await BOM.updateMany({ finishedProductId: bom.finishedProductId }, { isDefault: false });
    }

    const updateBody = normalizeBomSectionsForWrite(req.body);

    const updatedBOM = await BOM.findByIdAndUpdate(
        req.params.id,
        { ...updateBody, updatedBy: req.user.id },
        { new: true, runValidators: true }
    );

    res.send({ success: true, data: normalizeBomSectionsForRead(updatedBOM) });
});

// ── DELETE ────────────────────────────────────────────────────────────────────
export const deleteBOM = asyncHandler(async (req, res) => {
    const bom = await BOM.findById(req.params.id);
    if (!bom) throw new ApiError(httpStatus.NOT_FOUND, 'BOM not found');
    await bom.deleteOne();
    res.send({ success: true, message: 'BOM deleted successfully' });
});

// ── DOWNLOAD PDF ─────────────────────────────────────────────────────────────
export const downloadBOMPDF = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const includeCost = req.query.includeCost !== 'false';

    const [bom, company] = await Promise.all([
        BOM.findById(id).populate('finishedProductId components.itemId'),
        CompanyProfile.findOne()
    ]);

    if (!bom) throw new ApiError(httpStatus.NOT_FOUND, 'BOM not found');
    if (!company) throw new ApiError(httpStatus.NOT_FOUND, 'Company profile not found');

    const normalizedBom = normalizeBomSectionsForRead(bom);
    const pdfBuffer = await PDFService.generateBOMPDF(normalizedBom, company, includeCost);

    const fileName = `${bom.bomNumber}_${includeCost ? 'Full' : 'Specification'}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(pdfBuffer);
});

// ── EXPORT TEMPLATE ──────────────────────────────────────────────────────────
export const exportBOMTemplate = asyncHandler(async (req, res) => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('BOM Template');

    // Define columns
    // Headers designed to be intuitive and cover ALL details from the UI
    worksheet.columns = [
        { header: 'BOM Number (BOM-XXXX-XXX)', key: 'bomNumber', width: 25 },
        { header: 'Finished Product Code*', key: 'productCode', width: 22 },
        { header: 'BOM Type (Production/Sub-Assembly/Service BOM)', key: 'bomType', width: 30 },
        { header: 'Version (V1, V2...)', key: 'version', width: 12 },
        { header: 'Status (Draft/Approved/Inactive)', key: 'status', width: 18 },
        { header: 'Production Qty (Finished Product Output)', key: 'productionQuantity', width: 30 },
        { header: 'Revision Date (YYYY-MM-DD)', key: 'revisionDate', width: 20 },
        { header: 'Is Default BOM? (TRUE/FALSE)', key: 'isDefault', width: 15 },
        { header: 'Labour Rate Per Point (₹)', key: 'labourCostPerPoint', width: 22 },
        { header: 'Process Cost (₹)', key: 'totalProcessCost', width: 18 },
        { header: 'Overhead Cost (₹)', key: 'overheadCost', width: 18 },
        { header: 'Other Labour Cost (₹)', key: 'labourCost', width: 18 },
        { header: 'SMT Assembly? (TRUE/FALSE)', key: 'smtAssembly', width: 18 },
        { header: 'Manual Assembly? (TRUE/FALSE)', key: 'manualAssembly', width: 18 },
        { header: 'Testing Required? (TRUE/FALSE)', key: 'testingRequired', width: 18 },
        { header: 'QC Required? (TRUE/FALSE)', key: 'qcRequired', width: 18 },
        { header: 'Packing Required? (TRUE/FALSE)', key: 'packingRequired', width: 18 },
        { header: 'Scrap Account', key: 'scrapAccount', width: 20 },
        { header: 'Header Remarks', key: 'remarks', width: 25 },
        { header: 'Component Code*', key: 'componentCode', width: 20 },
        { header: 'Component Name (Reference)', key: 'componentName', width: 25 },
        { header: 'Component Type (SMD/TH)', key: 'componentType', width: 22 },
        { header: 'Component Qty*', key: 'componentQty', width: 15 },
        { header: 'UOM (Reference)', key: 'uom', width: 12 },
        { header: 'Component Rate (₹)', key: 'rate', width: 18 },
        { header: 'Component Points (Labour)', key: 'points', width: 22 },
        { header: 'Component Remark', key: 'componentRemarks', width: 25 }
    ];

    // Style header
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };

    // Add a sample row
    worksheet.addRow({
        bomNumber: 'BOM-SAMPLE-001',
        productCode: 'FINISHED-ITEM-001',
        bomType: 'Production',
        version: 'V1',
        status: 'Draft',
        productionQuantity: 1,
        revisionDate: new Date().toISOString().split('T')[0],
        isDefault: 'FALSE',
        labourCostPerPoint: 0.25,
        totalProcessCost: 50,
        overheadCost: 20,
        labourCost: 10,
        smtAssembly: 'TRUE',
        manualAssembly: 'FALSE',
        testingRequired: 'TRUE',
        qcRequired: 'TRUE',
        packingRequired: 'FALSE',
        scrapAccount: 'Scrap Revenue',
        remarks: 'Sample Header Remarks',
        componentCode: 'RAW-MAT-001',
        componentName: 'Resistor 10K 0603',
        componentType: 'SMD',
        componentQty: 2,
        uom: 'NOS',
        rate: 100,
        points: 4,
        componentRemarks: 'R25, U1'
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
        else if (h.includes('status')) colMap.status = colNumber;
        else if (h.includes('production qty')) colMap.productionQuantity = colNumber;
        else if (h.includes('revision date')) colMap.revisionDate = colNumber;
        else if (h.includes('default bom')) colMap.isDefault = colNumber;
        else if (h.includes('default')) colMap.isDefault = colNumber;
        else if (h.includes('labour rate per point')) colMap.labourCostPerPoint = colNumber;
        else if (h.includes('process cost')) colMap.totalProcessCost = colNumber;
        else if (h.includes('overhead cost')) colMap.overheadCost = colNumber;
        else if (h.includes('other labour cost')) colMap.labourCost = colNumber;
        else if (h.includes('smt assembly')) colMap.smtAssembly = colNumber;
        else if (h.includes('manual assembly')) colMap.manualAssembly = colNumber;
        else if (h.includes('testing required')) colMap.testingRequired = colNumber;
        else if (h.includes('qc required')) colMap.qcRequired = colNumber;
        else if (h.includes('packing required')) colMap.packingRequired = colNumber;
        else if (h.includes('scrap account')) colMap.scrapAccount = colNumber;
        else if (h.startsWith('header remarks') || h === 'remarks') colMap.remarks = colNumber;
        else if (h.includes('component code')) colMap.componentCode = colNumber;
        else if (h.includes('component qty')) colMap.componentQty = colNumber;
        else if (h.includes('component type')) colMap.componentType = colNumber;
        else if (h.includes('component rate')) colMap.rate = colNumber;
        else if (h.includes('component points')) colMap.points = colNumber;
        else if (h.includes('component remark')) colMap.componentRemarks = colNumber;
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
            const getVal = (col) => col ? row.getCell(col).value : undefined;
            const parseBool = (val) => String(val).toLowerCase() === 'true';

            bomGroups.set(groupKey, {
                bomNumber,
                productCode,
                version,
                status: getVal(colMap.status) || 'Draft',
                bomType: getVal(colMap.bomType) || 'Production',
                productionQuantity: Number(getVal(colMap.productionQuantity)) || 1,
                revisionDate: getVal(colMap.revisionDate),
                isDefault: parseBool(getVal(colMap.isDefault)),
                labourCostPerPoint: Number(getVal(colMap.labourCostPerPoint)) || 0.25,
                totalProcessCost: Number(getVal(colMap.totalProcessCost)) || 0,
                overheadCost: Number(getVal(colMap.overheadCost)) || 0,
                labourCost: Number(getVal(colMap.labourCost)) || 0,
                scrapAccount: getVal(colMap.scrapAccount) || '',
                remarks: getVal(colMap.remarks) || '',
                processes: {
                    smtAssembly: parseBool(getVal(colMap.smtAssembly)),
                    manualAssembly: parseBool(getVal(colMap.manualAssembly)),
                    testingRequired: parseBool(getVal(colMap.testingRequired)),
                    qcRequired: parseBool(getVal(colMap.qcRequired)),
                    packingRequired: parseBool(getVal(colMap.packingRequired))
                },
                components: []
            });
        }

        bomGroups.get(groupKey).components.push({
            itemCode: componentCode,
            quantity: Number(row.getCell(colMap.componentQty).value) || 0,
            componentType: row.getCell(colMap.componentType)?.value?.toString().trim().toUpperCase() || '',
            rate: Number(row.getCell(colMap.rate)?.value) || 0,
            points: Number(row.getCell(colMap.points).value) || 0,
            remarks: row.getCell(colMap.componentRemarks)?.value?.toString().trim() || ''
        });
    }

    let successCount = 0;
    let autoCreatedCount = 0;
    const errors = [];

    for (const [key, bData] of bomGroups) {
        try {
            // Find finished product
            let fProduct = await Item.findOne({ itemCode: bData.productCode.toUpperCase() });
            if (!fProduct) {
                // Auto-create missing Finished Product as requested by user
                fProduct = await Item.create({
                    itemCode: bData.productCode.toUpperCase(),
                    itemName: bData.productCode, // Default name to code
                    itemCategory: 'FINISHED_GOOD',
                    isManufacturable: true,
                    status: 'Active',
                    uom: 'NOS'
                });
                autoCreatedCount++;
                console.log(`[Import] Auto-created missing Finished Product: ${bData.productCode}`);
            }

            // Resolve components
            const resolvedComponents = [];
            let totalRawMaterialCost = 0;
            let totalPoints = 0;

            for (const comp of bData.components) {
                let cItem = await Item.findOne({ itemCode: comp.itemCode.toUpperCase() });
                if (!cItem) {
                    // Auto-create missing Component as RAW_MATERIAL
                    cItem = await Item.create({
                        itemCode: comp.itemCode.toUpperCase(),
                        itemName: comp.itemCode,
                        itemCategory: 'RAW_MATERIAL', // Default to RM for components
                        uom: 'NOS',
                        status: 'Active'
                    });
                    autoCreatedCount++;
                    console.log(`[Import] Auto-created missing Component: ${comp.itemCode}`);
                }

                const rate = comp.rate || cItem.purchaseRate || cItem.valuationRate || 0;
                const totalCost = comp.quantity * rate;
                totalRawMaterialCost += totalCost;
                totalPoints += comp.points;

                resolvedComponents.push({
                    itemId: cItem._id,
                    itemCode: cItem.itemCode,
                    itemName: cItem.itemName,
                    componentType: comp.componentType || (cItem.itemType?.toUpperCase().includes('SMD') ? 'SMD' : (cItem.itemType?.toUpperCase().includes('TH') ? 'TH' : '')),
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

            // Calculate costs
            const labourCostPerPoint = bData.labourCostPerPoint || 0.25;
            const totalPointsLabourCost = totalPoints * labourCostPerPoint;
            const finalProductionCostPerUnit = (totalRawMaterialCost + totalPointsLabourCost + bData.totalProcessCost + bData.overheadCost + bData.labourCost) / bData.productionQuantity;

            const finalBData = {
                bomNumber: bData.bomNumber,
                finishedProductId: fProduct._id,
                bomType: bData.bomType,
                version: bData.version,
                status: bData.status,
                productionQuantity: bData.productionQuantity,
                revisionDate: bData.revisionDate || new Date(),
                isDefault: bData.isDefault,
                labourCostPerPoint: labourCostPerPoint,
                totalProcessCost: bData.totalProcessCost,
                overheadCost: bData.overheadCost,
                labourCost: bData.labourCost,
                scrapAccount: bData.scrapAccount,
                remarks: bData.remarks,
                processes: bData.processes,
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
        message: `Imported ${successCount} BOMs. ${errors.length} errors. ${autoCreatedCount > 0 ? `(${autoCreatedCount} new items registered in Master)` : ''}`,
        successCount,
        autoCreatedCount,
        errors: errors.length > 0 ? errors : undefined
    });
});

// ── EXPORT LIST ───────────────────────────────────────────────────────────────
export const exportBOMListToExcel = asyncHandler(async (req, res) => {
    const filters = pick(req.query, ['finishedProductId', 'bomNumber', 'search', 'status', 'bomType']);
    const query = {};
    if (filters.finishedProductId) query.finishedProductId = filters.finishedProductId;
    if (filters.status) query.status = filters.status;
    if (filters.bomType) query.bomType = filters.bomType;
    const searchTerm = filters.search || filters.bomNumber;
    if (searchTerm) query.bomNumber = { $regex: searchTerm, $options: 'i' };

    const boms = await BOM.find(query)
        .populate('finishedProductId', 'itemName itemCode')
        .sort('-createdAt');

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('BOM List');

    worksheet.columns = [
        { header: 'BOM Number', key: 'bomNumber', width: 25 },
        { header: 'Finished Product', key: 'product', width: 35 },
        { header: 'Type', key: 'bomType', width: 15 },
        { header: 'Version', key: 'version', width: 10 },
        { header: 'Quantity', key: 'productionQuantity', width: 15 },
        { header: 'Unit Cost (₹)', key: 'finalProductionCostPerUnit', width: 20 },
        { header: 'Status', key: 'status', width: 15 },
        { header: 'Date', key: 'revisionDate', width: 15 }
    ];

    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };

    boms.forEach(bom => {
        worksheet.addRow({
            bomNumber: bom.bomNumber,
            product: `${bom.finishedProductId?.itemName} (${bom.finishedProductId?.itemCode})`,
            bomType: bom.bomType,
            version: bom.version,
            productionQuantity: bom.productionQuantity,
            finalProductionCostPerUnit: bom.finalProductionCostPerUnit?.toFixed(2),
            status: bom.status,
            revisionDate: bom.revisionDate?.toISOString().split('T')[0]
        });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=BOM_List.xlsx');
    res.send(buffer);
});

// ── EXPORT SINGLE BOM ─────────────────────────────────────────────────────────
export const exportBOMToExcel = asyncHandler(async (req, res) => {
    const bom = await BOM.findById(req.params.id)
        .populate('finishedProductId', 'itemName itemCode itemCategory uom itemType')
        .populate('components.itemId', 'itemName itemCode uom itemCategory purchaseRate itemType');

    if (!bom) throw new ApiError(httpStatus.NOT_FOUND, 'BOM not found');

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('BOM Detail');

    // ── HEADER SECTION ──────────────────────────────────────────────────────────
    worksheet.mergeCells('A1:G1');
    const titleCell = worksheet.getCell('A1');
    titleCell.value = `BILL OF MATERIAL: ${bom.bomNumber}`;
    titleCell.font = { size: 16, bold: true };
    titleCell.alignment = { horizontal: 'center' };

    worksheet.addRow(['Product:', `${bom.finishedProductId?.itemName} (${bom.finishedProductId?.itemCode})`, '', 'Version:', bom.version]);
    worksheet.addRow(['BOM Type:', bom.bomType, '', 'Revision Date:', bom.revisionDate?.toISOString().split('T')[0]]);
    worksheet.addRow(['Batch Size:', `${bom.productionQuantity} ${bom.finishedProductId?.uom || 'Unit'}`, '', 'Status:', bom.status]);
    worksheet.addRow(['Unit Cost:', `₹ ${bom.finalProductionCostPerUnit?.toFixed(2)}`, '', 'Total Points:', bom.components.reduce((acc, c) => acc + (c.points || 0), 0)]);
    worksheet.addRow([]); // Gap

    // ── COMPONENTS TABLE ────────────────────────────────────────────────────────
    const tableHeader = ['#', 'Item Code', 'Item Name', 'Type', 'Quantity', 'UOM', 'Rate (₹)', 'Total (₹)', 'Points', 'Remarks'];
    const headerRow = worksheet.addRow(tableHeader);
    headerRow.eachCell((cell) => {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F81BD' } };
        cell.alignment = { horizontal: 'center' };
        cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
    });

    bom.components.forEach((c, idx) => {
        const row = worksheet.addRow([
            idx + 1,
            c.itemCode || c.itemId?.itemCode,
            c.itemName || c.itemId?.itemName,
            c.componentType || '',
            c.quantity,
            c.uom || c.itemId?.uom,
            c.rate?.toFixed(2),
            c.totalCost?.toFixed(2),
            c.points || 0,
            c.remarks || ''
        ]);
        row.eachCell((cell) => {
            cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
        });
    });

    // ── SUMMARY SECTION ─────────────────────────────────────────────────────────
    worksheet.addRow([]);
    worksheet.addRow(['', '', '', '', '', 'Raw Material Cost:', `₹ ${bom.totalRawMaterialCost?.toFixed(2)}`]);
    worksheet.addRow(['', '', '', '', '', 'Processing Cost:', `₹ ${bom.totalProcessCost?.toFixed(2)}`]);
    worksheet.addRow(['', '', '', '', '', 'Labour Cost:', `₹ ${bom.totalPointsLabourCost?.toFixed(2)}`]);
    worksheet.addRow(['', '', '', '', '', 'Overhead Cost:', `₹ ${bom.overheadCost?.toFixed(2)}`]);
    worksheet.addRow(['', '', '', '', '', 'Other Labour:', `₹ ${bom.labourCost?.toFixed(2)}`]);
    
    const finalRow = worksheet.addRow(['', '', '', '', '', 'TOTAL COST:', `₹ ${(bom.finalProductionCostPerUnit * bom.productionQuantity)?.toFixed(2)}`]);
    finalRow.getCell(6).font = { bold: true };
    finalRow.getCell(7).font = { bold: true, color: { argb: 'FFC00000' } };

    // Set widths
    worksheet.getColumn(1).width = 5;
    worksheet.getColumn(2).width = 20;
    worksheet.getColumn(3).width = 35;
    worksheet.getColumn(4).width = 10;
    worksheet.getColumn(5).width = 12;
    worksheet.getColumn(6).width = 20;
    worksheet.getColumn(7).width = 20;

    const buffer = await workbook.xlsx.writeBuffer();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=BOM_${bom.bomNumber}.xlsx`);
    res.send(buffer);
});
