import httpStatus from 'http-status';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import * as industryTemplateService from '../services/industryTemplate.service.js';

export const listTemplates = asyncHandler(async (req, res) => {
    const filter = {};
    if (req.query.isActive !== undefined) filter.isActive = req.query.isActive === 'true';
    const templates = await industryTemplateService.listIndustryTemplates(filter);
    res.json({ success: true, data: templates });
});

export const getTemplate = asyncHandler(async (req, res) => {
    const template = await industryTemplateService.getIndustryTemplateById(req.params.id);
    if (!template) {
        throw new ApiError(httpStatus.NOT_FOUND, 'Industry template not found');
    }
    res.json({ success: true, data: template });
});

const resolveUserId = (user) => user?._id || user?.id || null;

export const createTemplate = asyncHandler(async (req, res) => {
    const template = await industryTemplateService.createIndustryTemplate(req.body, resolveUserId(req.user));
    res.status(httpStatus.CREATED).json({ success: true, data: template, message: 'Industry template created' });
});

export const updateTemplate = asyncHandler(async (req, res) => {
    const template = await industryTemplateService.updateIndustryTemplate(req.params.id, req.body, resolveUserId(req.user));
    res.json({ success: true, data: template, message: 'Industry template updated' });
});

export const toggleTemplateActive = asyncHandler(async (req, res) => {
    const template = await industryTemplateService.toggleIndustryTemplateActive(req.params.id, resolveUserId(req.user));
    res.json({
        success: true,
        data: template,
        message: `Template ${template.isActive ? 'activated' : 'deactivated'}`,
    });
});

/** Read-only helper for future phases — resolves effective template without changing company data. */
export const resolveForCompany = asyncHandler(async (req, res) => {
    const template = await industryTemplateService.resolveCompanyIndustryTemplate(req.params.companyId);
    res.json({ success: true, data: template });
});

export const getDefaultTemplate = asyncHandler(async (req, res) => {
    const template = await industryTemplateService.getDefaultIndustryTemplate();
    res.json({ success: true, data: template });
});
