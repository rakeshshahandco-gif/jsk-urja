import { RetestConfirmation } from '../models/retestConfirmation.model.js';
import { ReworkJobCard } from '../models/reworkJobCard.model.js';
import { ProductionFailure } from '../models/productionFailure.model.js';
import { ReworkOutput } from '../models/reworkOutput.model.js';
import { Item } from '../models/item.model.js';
import { StockLedger } from '../models/stockLedger.model.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const generateRetestNo = async () => {
    const last = await RetestConfirmation.findOne().sort({ createdAt: -1 });
    if (!last || !last.retestNo) return 'RTC-0001';
    const num = parseInt(last.retestNo.split('-')[1]);
    return `RTC-${String(num + 1).padStart(4, '0')}`;
};

export const createRetest = asyncHandler(async (req, res) => {
    const data = req.body;

    const jobCard = await ReworkJobCard.findById(data.jobCardId);
    if (!jobCard) throw new ApiError(404, 'Job Card not found');

    data.jobCardNo = jobCard.jobCardNo;
    data.retestNo = await generateRetestNo();

    const retest = await RetestConfirmation.create(data);

    // If passed, move REPAIR -> SALEABLE
    // Practically, it was in FAILED bucket as PROD_FAILURE
    // Let's add it back to SALEABLE stock directly.
    if (data.qtyPassed > 0) {
        const item = await Item.findById(jobCard.itemId);
        if (item) {
            item.currentStock += data.qtyPassed;
            await item.save();

            await StockLedger.create({
                date: new Date(),
                itemId: item._id,
                itemCode: item.itemCode,
                itemName: item.itemName,
                transactionType: 'REWORK_QC_PASS',
                stockBucket: 'SALEABLE',
                referenceNo: retest.retestNo,
                referenceId: retest._id,
                inQty: data.qtyPassed,
                outQty: 0,
                remarks: `QC Passed after rework on ${jobCard.jobCardNo}`,
                createdBy: req.user?._id
            });
            retest.stockMoved = true;
            await retest.save();
        }
    }

    const failure = await ProductionFailure.findById(jobCard.failureId);
    if (failure) {
        failure.qtyPassedAfterRetest += data.qtyPassed;

        // If everything is accounted for (repaired - passed - failed again = 0?), close it
        // Or if handled by user manually, keep it simple:
        failure.status = (failure.qtyFailed === failure.qtyPassedAfterRetest + failure.qtyScrap) ? 'Closed' : 'Partially Passed';
        await failure.save();
    }

    res.status(201).json(retest);
});

export const getRetests = asyncHandler(async (req, res) => {
    const filter = {};
    if (req.query.jobCardId) filter.jobCardId = req.query.jobCardId;

    const retests = await RetestConfirmation.find(filter).sort({ createdAt: -1 });
    res.json(retests);
});
