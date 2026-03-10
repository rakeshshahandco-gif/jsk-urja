import httpStatus from 'http-status';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { ScrapEntry } from '../models/scrapEntry.model.js';
import { syncComplaintStatus } from './complaint.controller.js';

const generateScrapNo = async () => {
    const count = await ScrapEntry.countDocuments();
    return `SCR-${String(count + 1).padStart(4, '0')}`;
};

export const createScrapEntry = asyncHandler(async (req, res) => {
    const data = { ...req.body, createdBy: req.user.id };
    data.scrapNo = await generateScrapNo();
    const entry = await ScrapEntry.create(data);
    if (entry.complaintId) await syncComplaintStatus(entry.complaintId);
    res.status(httpStatus.CREATED).send({ success: true, data: entry });
});

export const getScrapEntries = asyncHandler(async (req, res) => {
    const { jobCardId, complaintId, page = 1, limit = 50 } = req.query;
    const filter = {};
    if (jobCardId) filter.jobCardId = jobCardId;
    if (complaintId) filter.complaintId = complaintId;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [data, total] = await Promise.all([
        ScrapEntry.find(filter).sort({ date: -1 }).skip(skip).limit(parseInt(limit)).lean(),
        ScrapEntry.countDocuments(filter),
    ]);
    res.send({ success: true, data, meta: { total } });
});

export const getScrapEntry = asyncHandler(async (req, res) => {
    const doc = await ScrapEntry.findById(req.params.id).lean();
    if (!doc) throw new ApiError(httpStatus.NOT_FOUND, 'Not found');
    res.send({ success: true, data: doc });
});

export const deleteScrapEntry = asyncHandler(async (req, res) => {
    const doc = await ScrapEntry.findById(req.params.id);
    if (!doc) throw new ApiError(httpStatus.NOT_FOUND, 'Not found');
    const complaintId = doc.complaintId;
    await doc.deleteOne();
    if (complaintId) await syncComplaintStatus(complaintId);
    res.send({ success: true, message: 'Deleted' });
});
