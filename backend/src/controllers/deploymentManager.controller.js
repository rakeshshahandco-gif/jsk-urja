import httpStatus from 'http-status';
import mongoose from 'mongoose';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { Company } from '../models/company.model.js';
import {
    getDeploymentManagerOverview,
    pickDeploymentTrackingPatch,
    getClientDeployChecklist,
    applyCompanyReferenceDefaults,
    buildDeploymentReportMarkdown,
    readLocalGitInfo,
    addCompanyDeployHistory,
    getCompanyDeployHistory,
} from '../services/deploymentManager.service.js';

export const getOverview = asyncHandler(async (req, res) => {
    const overview = await getDeploymentManagerOverview();
    res.status(httpStatus.OK).json(new ApiResponse(httpStatus.OK, overview, 'Deployment manager overview'));
});

export const getChecklist = asyncHandler(async (req, res) => {
    const checklist = getClientDeployChecklist(req.params.clientKey);
    if (!checklist) throw new ApiError(httpStatus.NOT_FOUND, 'Client group not found');
    res.status(httpStatus.OK).json(new ApiResponse(httpStatus.OK, checklist, 'Client deploy checklist'));
});

export const getReport = asyncHandler(async (req, res) => {
    const overview = await getDeploymentManagerOverview();
    const markdown = buildDeploymentReportMarkdown(overview);
    res.status(httpStatus.OK).json(new ApiResponse(httpStatus.OK, { markdown, overview }, 'Deployment report'));
});

export const applyReferenceDefaults = asyncHandler(async (req, res) => {
    const { companyId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(companyId)) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid company id');
    }

    const { clientKey } = req.body || {};
    if (!clientKey) throw new ApiError(httpStatus.BAD_REQUEST, 'clientKey is required');

    try {
        const result = await applyCompanyReferenceDefaults(companyId, clientKey);
        res.status(httpStatus.OK).json(new ApiResponse(httpStatus.OK, result, 'Reference defaults applied'));
    } catch (err) {
        throw new ApiError(err.statusCode || httpStatus.INTERNAL_SERVER_ERROR, err.message);
    }
});

export const updateCompanyDeploymentTracking = asyncHandler(async (req, res) => {
    const { companyId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(companyId)) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid company id');
    }

    const patch = pickDeploymentTrackingPatch(req.body);
    if (!Object.keys(patch).length) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'No deployment tracking fields to update');
    }

    const company = await Company.findById(companyId);
    if (!company) throw new ApiError(httpStatus.NOT_FOUND, 'Company not found');

    company.deploymentConfig = {
        ...(company.deploymentConfig?.toObject?.() || company.deploymentConfig || {}),
        ...patch,
    };
    company.updatedBy = req.user?._id;
    await company.save();

    res.status(httpStatus.OK).json(new ApiResponse(httpStatus.OK, {
        _id: company._id,
        companyName: company.companyName,
        deploymentConfig: company.deploymentConfig,
    }, 'Deployment tracking updated'));
});

export const getLocalGit = asyncHandler(async (req, res) => {
    const git = await readLocalGitInfo();
    res.status(httpStatus.OK).json(new ApiResponse(httpStatus.OK, git, 'Local git info'));
});

export const getCompanyHistory = asyncHandler(async (req, res) => {
    const { companyId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(companyId)) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid company id');
    }
    try {
        const data = await getCompanyDeployHistory(companyId);
        res.status(httpStatus.OK).json(new ApiResponse(httpStatus.OK, data, 'Deploy history'));
    } catch (err) {
        throw new ApiError(err.statusCode || httpStatus.INTERNAL_SERVER_ERROR, err.message);
    }
});

export const addCompanyHistory = asyncHandler(async (req, res) => {
    const { companyId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(companyId)) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid company id');
    }
    try {
        const result = await addCompanyDeployHistory(companyId, req.body, req.user);
        res.status(httpStatus.CREATED).json(new ApiResponse(httpStatus.CREATED, result, 'Deploy record added'));
    } catch (err) {
        throw new ApiError(err.statusCode || httpStatus.INTERNAL_SERVER_ERROR, err.message);
    }
});
