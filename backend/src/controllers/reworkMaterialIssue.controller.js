import { ReworkMaterialIssue } from '../models/reworkMaterialIssue.model.js';
import { ReworkJobCard } from '../models/reworkJobCard.model.js';
import { Item } from '../models/item.model.js';
import { StockLedger } from '../models/stockLedger.model.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const generateIssueNo = async () => {
    const last = await ReworkMaterialIssue.findOne().sort({ createdAt: -1 });
    if (!last || !last.issueNo) return 'RMI-0001';
    const num = parseInt(last.issueNo.split('-')[1]);
    return `RMI-${String(num + 1).padStart(4, '0')}`;
};

export const createMaterialIssue = asyncHandler(async (req, res) => {
    const data = req.body;

    // Verify Job Card
    const jobCard = await ReworkJobCard.findById(data.jobCardId);
    if (!jobCard) throw new ApiError(404, 'Job Card not found');

    data.jobCardNo = jobCard.jobCardNo;
    data.issueNo = await generateIssueNo();

    // Verify all items and check stock BEFORE doing anything
    const itemUpdates = [];
    const stockLedgerEntries = [];

    for (const comp of data.components) {
        const item = await Item.findById(comp.itemId);
        if (!item) throw new ApiError(404, `Component item ${comp.itemId} not found`);
        if (item.currentStock < comp.qtyIssued) {
            throw new ApiError(400, `Insufficient stock for component ${item.itemName}. Available: ${item.currentStock}, Requested: ${comp.qtyIssued}`);
        }

        comp.itemCode = item.itemCode;
        comp.itemName = item.itemName;
        comp.uom = item.uom;

        itemUpdates.push({ item, qty: comp.qtyIssued });
        stockLedgerEntries.push({
            date: new Date(),
            itemId: item._id,
            itemCode: item.itemCode,
            itemName: item.itemName,
            transactionType: 'REWORK_CONSUMPTION',
            stockBucket: 'SALEABLE', // Taking good raw materials
            referenceNo: data.issueNo,
            inQty: 0,
            outQty: comp.qtyIssued,
            remarks: `Issued for rework job card ${data.jobCardNo}`,
            createdBy: req.user?._id
        });
    }

    const issue = await ReworkMaterialIssue.create(data);

    // Apply Stock Reductions
    for (const update of itemUpdates) {
        update.item.currentStock -= update.qty;
        await update.item.save();
    }

    for (const entry of stockLedgerEntries) {
        entry.referenceId = issue._id;
        await StockLedger.create(entry);
    }

    issue.stockEffect = true;
    await issue.save();

    res.status(201).json(issue);
});

export const getMaterialIssues = asyncHandler(async (req, res) => {
    const filter = {};
    if (req.query.jobCardId) filter.jobCardId = req.query.jobCardId;

    const issues = await ReworkMaterialIssue.find(filter).sort({ createdAt: -1 });
    res.json(issues);
});
