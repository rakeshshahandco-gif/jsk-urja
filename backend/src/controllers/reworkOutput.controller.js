import { ReworkOutput } from '../models/reworkOutput.model.js';
import { ReworkJobCard } from '../models/reworkJobCard.model.js';
import { ProductionFailure } from '../models/productionFailure.model.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const generateOutputNo = async () => {
    const last = await ReworkOutput.findOne().sort({ createdAt: -1 });
    if (!last || !last.outputNo) return 'RWO-0001';
    const num = parseInt(last.outputNo.split('-')[1]);
    return `RWO-${String(num + 1).padStart(4, '0')}`;
};

export const createOutput = asyncHandler(async (req, res) => {
    const data = req.body;

    // Verify Job Card
    const jobCard = await ReworkJobCard.findById(data.jobCardId);
    if (!jobCard) throw new ApiError(404, 'Job Card not found');

    data.jobCardNo = jobCard.jobCardNo;
    data.outputNo = await generateOutputNo();

    const output = await ReworkOutput.create(data);

    // Update Job Card and Failure totals
    // A single job card might hold multiple output results theoretically, but practically it's one.
    jobCard.qtyRepaired += data.qtyRepaired;
    jobCard.qtyNonRepairable += data.qtyScrap;
    jobCard.status = 'Repaired'; // Setting status
    await jobCard.save();

    const failure = await ProductionFailure.findById(jobCard.failureId);
    if (failure) {
        failure.qtyRepaired += data.qtyRepaired;
        failure.qtyFailedAgain += data.qtyFailedAgain;
        failure.qtyScrap += data.qtyScrap;
        failure.status = 'Retest Pending';
        await failure.save();
    }

    res.status(201).json(output);
});

export const getOutputs = asyncHandler(async (req, res) => {
    const filter = {};
    if (req.query.jobCardId) filter.jobCardId = req.query.jobCardId;

    const outputs = await ReworkOutput.find(filter).sort({ createdAt: -1 });
    res.json(outputs);
});
