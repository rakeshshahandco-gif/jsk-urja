import httpStatus from 'http-status';
import { ApiError } from '../utils/ApiError.js';
import { TextileProcessRoute } from '../models/textileProcessRoute.model.js';
import { IndustryTemplate } from '../models/industryTemplate.model.js';
import { assertTextileCompany } from './textileProductionLot.service.js';
import {
    TEXTILE_ROUTE_PROCESS_OPTIONS,
    slugRouteCode,
} from '../constants/textileProcessRoute.constants.js';

function normalizeStages(stages = []) {
    return stages
        .map((s, i) => ({
            sequenceNo: Number(s.sequenceNo) || i + 1,
            processName: s.processName,
            customProcessName: s.customProcessName || '',
            allowSkip: s.allowSkip !== false,
            remarks: s.remarks || '',
        }))
        .sort((a, b) => a.sequenceNo - b.sequenceNo);
}

export function getProcessRouteMeta() {
    return {
        processOptions: TEXTILE_ROUTE_PROCESS_OPTIONS,
    };
}

export async function listProcessRoutes(companyId, query = {}) {
    await assertTextileCompany(companyId);
    const filter = { companyId };
    if (query.isActive === 'true' || query.isActive === 'false') {
        filter.isActive = query.isActive === 'true';
    }
    if (query.search) {
        const re = new RegExp(query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        filter.$or = [{ routeName: re }, { routeCode: re }, { description: re }];
    }
    return TextileProcessRoute.find(filter).sort({ routeName: 1 }).lean();
}

export async function getProcessRoute(id, companyId) {
    await assertTextileCompany(companyId);
    const doc = await TextileProcessRoute.findOne({ _id: id, companyId }).lean();
    if (!doc) throw new ApiError(httpStatus.NOT_FOUND, 'Process route not found');
    return doc;
}

export async function createProcessRoute(companyId, body, userId) {
    const { template } = await assertTextileCompany(companyId);
    const stages = normalizeStages(body.stages);
    if (!stages.length) throw new ApiError(httpStatus.BAD_REQUEST, 'At least one stage is required');
    if (!body.routeName?.trim()) throw new ApiError(httpStatus.BAD_REQUEST, 'Route name is required');

    const routeCode = body.routeCode?.trim()?.toUpperCase() || slugRouteCode(body.routeName);
    const exists = await TextileProcessRoute.findOne({ companyId, routeCode }).lean();
    if (exists) throw new ApiError(httpStatus.BAD_REQUEST, `Route code ${routeCode} already exists`);

    const doc = await TextileProcessRoute.create({
        companyId,
        routeName: body.routeName.trim(),
        routeCode,
        industryTemplateRef: body.industryTemplateRef || template._id,
        description: body.description || '',
        isActive: body.isActive !== false,
        stages,
        createdBy: userId,
        updatedBy: userId,
    });
    return doc;
}

export async function updateProcessRoute(id, companyId, body, userId) {
    await assertTextileCompany(companyId);
    const doc = await TextileProcessRoute.findOne({ _id: id, companyId });
    if (!doc) throw new ApiError(httpStatus.NOT_FOUND, 'Process route not found');

    if (body.routeName !== undefined) doc.routeName = String(body.routeName).trim();
    if (body.description !== undefined) doc.description = body.description || '';
    if (body.isActive !== undefined) doc.isActive = !!body.isActive;
    if (body.stages !== undefined) {
        const stages = normalizeStages(body.stages);
        if (!stages.length) throw new ApiError(httpStatus.BAD_REQUEST, 'At least one stage is required');
        doc.stages = stages;
    }
    doc.updatedBy = userId;
    await doc.save();
    return doc;
}

export async function deactivateProcessRoute(id, companyId, userId) {
    await assertTextileCompany(companyId);
    const doc = await TextileProcessRoute.findOne({ _id: id, companyId });
    if (!doc) throw new ApiError(httpStatus.NOT_FOUND, 'Process route not found');
    doc.isActive = false;
    doc.updatedBy = userId;
    await doc.save();
    return doc;
}
