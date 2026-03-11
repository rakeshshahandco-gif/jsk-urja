import { ReworkJobCard } from '../models/reworkJobCard.model.js';
import { ProductionFailure } from '../models/productionFailure.model.js';
import { Item } from '../models/item.model.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const generateJobCardNo = async () => {
    const last = await ReworkJobCard.findOne().sort({ createdAt: -1 });
    if (!last || !last.jobCardNo) return 'RJC-0001';
    const num = parseInt(last.jobCardNo.split('-')[1]);
    return `RJC-${String(num + 1).padStart(4, '0')}`;
};

export const createJobCard = asyncHandler(async (req, res) => {
    const data = req.body;

    // Verify Failure Entry
    const failure = await ProductionFailure.findById(data.failureId);
    if (!failure) throw new ApiError(404, 'Production Failure record not found');

    const unassignedQty = failure.qtyFailed - (failure.qtyRepaired + failure.qtyScrap); // Very basic check

    if (data.qtyReceived > failure.qtyFailed) {
        throw new ApiError(400, `Cannot create Job Card for qty ${data.qtyReceived}. Only ${failure.qtyFailed} originally failed.`);
    }

    // Verify Item
    const item = await Item.findById(data.itemId);
    if (!item) throw new ApiError(404, 'Item not found');

    data.jobCardNo = await generateJobCardNo();
    data.itemCode = item.itemCode;
    data.itemName = item.itemName;
    data.failureNo = failure.failureNo;
    data.workOrderId = failure.workOrderId;
    data.workOrderNo = failure.workOrderNo;

    const jobCard = await ReworkJobCard.create(data);

    // Update Failure Status to indicate it's under repair
    failure.status = 'Under Repair';
    await failure.save();

    res.status(201).json(jobCard);
});

export const getJobCards = asyncHandler(async (req, res) => {
    const filter = {};
    if (req.query.failureId) filter.failureId = req.query.failureId;

    const jobCards = await ReworkJobCard.find(filter).sort({ createdAt: -1 });
    res.json(jobCards);
});

export const getJobCardById = asyncHandler(async (req, res) => {
    const jobCard = await ReworkJobCard.findById(req.params.id);
    if (!jobCard) throw new ApiError(404, 'Job Card not found');
    res.json(jobCard);
});

export const updateJobCard = asyncHandler(async (req, res) => {
    const jobCard = await ReworkJobCard.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!jobCard) throw new ApiError(404, 'Job Card not found');
    res.json(jobCard);
});
