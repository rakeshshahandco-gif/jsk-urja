import pick from '../utils/pick.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import * as leadService from '../services/lead.service.js';
import * as leadActivityService from '../services/leadActivity.service.js';

export const createLead = asyncHandler(async (req, res) => {
    const doc = await leadService.createLead(req.body, req.user.id);
    res.status(201).send(new ApiResponse(201, doc, 'Lead created'));
});

export const createLeadFromWhatsApp = asyncHandler(async (req, res) => {
    const doc = await leadService.createLeadFromWhatsApp(req.body, req.user.id);
    res.status(201).send(new ApiResponse(201, doc, 'Lead created from WhatsApp chat'));
});

export const getLeads = asyncHandler(async (req, res) => {
    const filter = pick(req.query, ['search', 'status', 'source', 'assignedTo']);
    const options = pick(req.query, ['page', 'limit', 'sortBy']);
    const result = await leadService.queryLeads(filter, options);
    res.send(new ApiResponse(200, result));
});

export const getLead = asyncHandler(async (req, res) => {
    const doc = await leadService.getLeadById(req.params.id);
    res.send(new ApiResponse(200, doc));
});

export const updateLead = asyncHandler(async (req, res) => {
    const doc = await leadService.updateLead(req.params.id, req.body, req.user.id);
    res.send(new ApiResponse(200, doc, 'Lead updated'));
});

export const deleteLead = asyncHandler(async (req, res) => {
    await leadService.deleteLead(req.params.id);
    res.send(new ApiResponse(200, null, 'Lead deleted'));
});

export const shareAsset = asyncHandler(async (req, res) => {
    const doc = await leadService.shareAsset(req.params.id, req.body, req.user.id);
    res.send(new ApiResponse(200, doc, 'Asset shared'));
});

export const getActivities = asyncHandler(async (req, res) => {
    const limit = req.query.limit ? Number(req.query.limit) : 200;
    const list = await leadActivityService.getActivities(req.params.id, { limit });
    res.send(new ApiResponse(200, list));
});
