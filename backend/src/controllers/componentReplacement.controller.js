import { ComponentReplacement } from '../models/componentReplacement.model.js';
import { Item } from '../models/item.model.js';
import { StockLedger } from '../models/stockLedger.model.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const generateEntryNo = async () => {
    const count = await ComponentReplacement.countDocuments();
    const y = new Date().getFullYear();
    return `CR-${y}-${String(count + 1).padStart(5, '0')}`;
};

// POST /component-replacements
export const createComponentReplacement = asyncHandler(async (req, res) => {
    const { date, workOrderId, workOrderNo, finishedItemId, finishedItemName, qtyUnderTesting, testedBy, remarks, components } = req.body;

    if (!components || components.length === 0) throw new ApiError(400, 'At least one component is required');

    const entryNo = await generateEntryNo();

    // Validate and reduce stock for each component
    const ledgerEntries = [];
    const processedComponents = [];

    for (const comp of components) {
        const item = await Item.findById(comp.itemId);
        if (!item) throw new ApiError(404, `Component not found: ${comp.itemId}`);

        const replQty = Number(comp.replacementQty);
        if (!item.allowNegativeStock && (item.currentStock || 0) < replQty) {
            throw new ApiError(400, `Insufficient stock for ${item.itemName}. Available: ${item.currentStock}, Required: ${replQty}`);
        }

        item.currentStock = (item.currentStock || 0) - replQty;
        await item.save();

        ledgerEntries.push({
            date: date ? new Date(date) : new Date(),
            itemId: item._id,
            itemCode: item.itemCode,
            itemName: item.itemName,
            transactionType: 'COMPONENT_REPLACEMENT',
            referenceNo: entryNo,
            referenceId: null,
            inQty: 0,
            outQty: replQty,
            rate: item.valuationRate || 0,
            amount: Math.round(replQty * (item.valuationRate || 0) * 100) / 100,
            runningStock: item.currentStock,
            remarks: `Component Replacement: ${entryNo}`,
            createdBy: req.user._id,
        });

        processedComponents.push({
            itemId: comp.itemId,
            itemCode: item.itemCode,
            itemName: item.itemName,
            uom: item.uom || 'NOS',
            damagedQty: comp.damagedQty || 0,
            replacementQty: replQty,
            reason: comp.reason || '',
        });
    }

    const entry = await ComponentReplacement.create({
        entryNo,
        date: date || new Date(),
        workOrderId: workOrderId || null,
        workOrderNo: workOrderNo || '',
        finishedItemId: finishedItemId || null,
        finishedItemName: finishedItemName || '',
        qtyUnderTesting: qtyUnderTesting || 0,
        testedBy: testedBy || '',
        remarks: remarks || '',
        components: processedComponents,
        createdBy: req.user._id,
    });

    // Update ledger reference IDs and save
    for (const le of ledgerEntries) le.referenceId = entry._id;
    await StockLedger.insertMany(ledgerEntries);

    res.status(201).json(new ApiResponse(201, entry, `Component Replacement ${entryNo} created. Stock reduced.`));
});

// GET /component-replacements
export const getComponentReplacements = asyncHandler(async (req, res) => {
    const { page = 1, limit = 30 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);
    const total = await ComponentReplacement.countDocuments();
    const entries = await ComponentReplacement.find()
        .sort({ date: -1 }).skip(skip).limit(Number(limit))
        .populate('createdBy', 'name');
    res.json(new ApiResponse(200, { entries, total, page: Number(page), pages: Math.ceil(total / Number(limit)) }, 'Component Replacements'));
});

// GET /component-replacements/:id
export const getComponentReplacementById = asyncHandler(async (req, res) => {
    const entry = await ComponentReplacement.findById(req.params.id).populate('createdBy', 'name');
    if (!entry) throw new ApiError(404, 'Entry not found');
    res.json(new ApiResponse(200, entry, 'Component Replacement'));
});
