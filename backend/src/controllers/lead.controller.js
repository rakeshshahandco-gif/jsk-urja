import pick from '../utils/pick.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { checkUserPermission } from '../utils/permissionUtils.js';
import { isLeadAdmin } from '../utils/leadVisibility.js';
import { getCompanyFeatureSettings } from '../services/companyFeatureSettings.service.js';
import * as leadService from '../services/lead.service.js';
import * as leadActivityService from '../services/leadActivity.service.js';

async function loadSettings(req) {
    return req.featureSettings || await getCompanyFeatureSettings(req.companyId);
}

function assertLeadCreateTask(user) {
    if (isLeadAdmin(user)) return;
    if (!checkUserPermission(user, 'crm.leads.create_task')) {
        throw new ApiError(403, 'Permission denied: crm.leads.create_task required');
    }
}

export const createLead = asyncHandler(async (req, res) => {
    const doc = await leadService.createLead(req.body, req.user.id);
    res.status(201).send(new ApiResponse(201, doc, 'Lead created'));
});

export const createLeadFromWhatsApp = asyncHandler(async (req, res) => {
    const doc = await leadService.createLeadFromWhatsApp(req.body, req.user.id);
    res.status(201).send(new ApiResponse(201, doc, 'Lead created from WhatsApp chat'));
});

export const getLeads = asyncHandler(async (req, res) => {
    const settings = await loadSettings(req);
    const filter = pick(req.query, [
        'search', 'status', 'source', 'assignedTo', 'scope',
        'ownerUserId', 'createdByUserId', 'dateFrom', 'dateTo',
    ]);
    const options = pick(req.query, ['page', 'limit', 'sortBy']);
    const result = await leadService.queryLeads(filter, options, req.user, settings);
    res.send(new ApiResponse(200, result));
});

export const getLeadVisibilityMeta = asyncHandler(async (req, res) => {
    const settings = await loadSettings(req);
    const meta = await leadService.getLeadVisibilityMeta(req.user, settings);
    res.send(new ApiResponse(200, meta));
});

function assertLeadReportView(user) {
    if (isLeadAdmin(user)) return;
    if (
        checkUserPermission(user, 'crm.leads.report_view')
        || checkUserPermission(user, 'crm.leads.report_view_all')
        || checkUserPermission(user, 'crm.leads.view')
        || checkUserPermission(user, 'reports.lead_report.view')
        || checkUserPermission(user, 'reports.lead_report.view_all')
    ) {
        return;
    }
    throw new ApiError(403, 'Permission denied: lead report view required');
}

export const getLeadReport = asyncHandler(async (req, res) => {
    assertLeadReportView(req.user);
    const settings = await loadSettings(req);
    const filter = pick(req.query, [
        'search', 'status', 'source', 'scope',
        'ownerUserId', 'createdByUserId', 'dateFrom', 'dateTo',
    ]);
    const options = pick(req.query, ['page', 'limit', 'sortBy']);
    const result = await leadService.queryLeadReport(filter, options, req.user, settings);
    res.send(new ApiResponse(200, result));
});

export const exportLeadReportExcel = asyncHandler(async (req, res) => {
    assertLeadReportView(req.user);
    const settings = await loadSettings(req);
    const filter = pick(req.query, [
        'search', 'status', 'source', 'scope',
        'ownerUserId', 'createdByUserId', 'dateFrom', 'dateTo',
    ]);
    const buffer = await leadService.exportLeadReportExcel(filter, req.user, settings);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=lead-report.xlsx');
    res.send(Buffer.from(buffer));
});

export const getLead = asyncHandler(async (req, res) => {
    const settings = await loadSettings(req);
    const doc = await leadService.getLeadById(req.params.id, req.user, settings);
    res.send(new ApiResponse(200, doc));
});

export const updateLead = asyncHandler(async (req, res) => {
    const settings = await loadSettings(req);
    const doc = await leadService.updateLead(req.params.id, req.body, req.user.id, req.user, settings);
    res.send(new ApiResponse(200, doc, 'Lead updated'));
});

export const deleteLead = asyncHandler(async (req, res) => {
    const settings = await loadSettings(req);
    await leadService.deleteLead(req.params.id, req.user, settings);
    res.send(new ApiResponse(200, null, 'Lead deleted'));
});

export const shareAsset = asyncHandler(async (req, res) => {
    const settings = await loadSettings(req);
    const doc = await leadService.shareAsset(req.params.id, req.body, req.user.id, req.user, settings);
    res.send(new ApiResponse(200, doc, 'Asset shared'));
});

export const getActivities = asyncHandler(async (req, res) => {
    const settings = await loadSettings(req);
    await leadService.getLeadById(req.params.id, req.user, settings);
    const limit = req.query.limit ? Number(req.query.limit) : 200;
    const list = await leadActivityService.getActivities(req.params.id, { limit });
    res.send(new ApiResponse(200, list));
});

export const getLeadTasks = asyncHandler(async (req, res) => {
    const settings = await loadSettings(req);
    const tasks = await leadService.getLeadTasks(req.params.id, req.user, settings);
    res.send(new ApiResponse(200, tasks));
});

export const createTaskFromLead = asyncHandler(async (req, res) => {
    assertLeadCreateTask(req.user);
    const settings = await loadSettings(req);
    const task = await leadService.createTaskFromLead(req.params.id, req.body, req.user, settings);
    res.status(201).send(new ApiResponse(201, task, 'Task created from lead'));
});
