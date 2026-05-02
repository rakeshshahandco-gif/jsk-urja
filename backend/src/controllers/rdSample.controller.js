import httpStatus from 'http-status';
import { RdSampleProject } from '../models/rdSampleProject.model.js';
import { RdSample } from '../models/rdSample.model.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import pick from '../utils/pick.js';

// --- RD PROJECT CONTROLLERS ---

export const createProject = asyncHandler(async (req, res) => {
    const project = await RdSampleProject.create({
        ...req.body,
        createdBy: req.user._id
    });
    res.status(httpStatus.CREATED).send(new ApiResponse(httpStatus.CREATED, project, 'R&D Project created successfully'));
});

export const getProjects = asyncHandler(async (req, res) => {
    const filter = pick(req.query, ['status', 'rdOwner']);
    const options = pick(req.query, ['sortBy', 'limit', 'page', 'search']);
    
    const query = { ...filter };
    if (options.search) {
        query.$or = [
            { projectName: { $regex: options.search, $options: 'i' } },
            { productName: { $regex: options.search, $options: 'i' } },
            { productCode: { $regex: options.search, $options: 'i' } }
        ];
    }

    const projects = await RdSampleProject.find(query)
        .populate('rdOwner', 'name email')
        .sort(options.sortBy || '-createdAt');

    res.send(new ApiResponse(httpStatus.OK, projects));
});

export const getProject = asyncHandler(async (req, res) => {
    const project = await RdSampleProject.findById(req.params.projectId).populate('rdOwner', 'name email');
    if (!project) {
        throw new ApiError(httpStatus.NOT_FOUND, 'Project not found');
    }
    res.send(new ApiResponse(httpStatus.OK, project));
});

export const updateProject = asyncHandler(async (req, res) => {
    const project = await RdSampleProject.findByIdAndUpdate(req.params.projectId, req.body, { new: true });
    if (!project) {
        throw new ApiError(httpStatus.NOT_FOUND, 'Project not found');
    }
    res.send(new ApiResponse(httpStatus.OK, project, 'Project updated successfully'));
});

export const deleteProject = asyncHandler(async (req, res) => {
    const samplesCount = await RdSample.countDocuments({ project: req.params.projectId });
    if (samplesCount > 0) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Cannot delete project with existing samples');
    }
    await RdSampleProject.findByIdAndDelete(req.params.projectId);
    res.send(new ApiResponse(httpStatus.OK, null, 'Project deleted successfully'));
});

// --- RD SAMPLE CONTROLLERS ---

const generateSampleNo = async () => {
    const lastSample = await RdSample.findOne().sort({ createdAt: -1 });
    let nextNum = 1;
    if (lastSample && lastSample.entryNo) {
        const match = lastSample.entryNo.match(/SAM-(\d+)/);
        if (match) {
            nextNum = parseInt(match[1]) + 1;
        }
    }
    return `SAM-${String(nextNum).padStart(4, '0')}`;
};

export const createSample = asyncHandler(async (req, res) => {
    if (!req.body.entryNo) {
        req.body.entryNo = await generateSampleNo();
    }
    const { testStatus, notConvertedDetails } = req.body;
    if (['Rejected', 'Not Converted', 'Hold'].includes(testStatus)) {
        if (!notConvertedDetails || !notConvertedDetails.reason || !notConvertedDetails.matter) {
            throw new ApiError(httpStatus.BAD_REQUEST, 'Reason and detailed matter are mandatory for Rejected, Not Converted, or Hold status');
        }
    }

    const sample = await RdSample.create({
        ...req.body,
        createdBy: req.user._id
    });
    res.status(httpStatus.CREATED).send(new ApiResponse(httpStatus.CREATED, sample, 'Sample entry created successfully'));
});

export const getSamples = asyncHandler(async (req, res) => {
    const filter = pick(req.query, ['project', 'testStatus', 'supplierCountry', 'finalSelectionStatus']);
    const options = pick(req.query, ['sortBy', 'limit', 'page', 'search']);
    
    const query = { ...filter };
    
    // Explicitly remove empty string or null values to prevent Mongoose CastErrors
    Object.keys(query).forEach(key => {
        if (query[key] === '' || query[key] === null || query[key] === undefined) {
            delete query[key];
        }
    });

    console.log(`🔍 [getSamples] Querying with fixed filter:`, JSON.stringify(query));

    if (options.search) {
        query.$or = [
            { itemName: { $regex: options.search, $options: 'i' } },
            { supplierName: { $regex: options.search, $options: 'i' } },
            { partNumber: { $regex: options.search, $options: 'i' } }
        ];
    }

    const samples = await RdSample.find(query)
        .populate('project', 'projectName productName')
        .sort(options.sortBy || '-createdAt');

    res.send(new ApiResponse(httpStatus.OK, samples));
});

export const getSample = asyncHandler(async (req, res) => {
    const sample = await RdSample.findById(req.params.sampleId)
        .populate('project')
        .populate('testHistory.testedBy', 'name');
    if (!sample) {
        throw new ApiError(httpStatus.NOT_FOUND, 'Sample not found');
    }
    res.send(new ApiResponse(httpStatus.OK, sample));
});

export const updateSample = asyncHandler(async (req, res) => {
    const { testStatus, notConvertedDetails } = req.body;
    if (testStatus && ['Rejected', 'Not Converted', 'Hold'].includes(testStatus)) {
        if (!notConvertedDetails || !notConvertedDetails.reason || !notConvertedDetails.matter) {
            throw new ApiError(httpStatus.BAD_REQUEST, 'Reason and detailed matter are mandatory for Rejected, Not Converted, or Hold status');
        }
    }

    const sample = await RdSample.findByIdAndUpdate(req.params.sampleId, req.body, { new: true });
    if (!sample) {
        throw new ApiError(httpStatus.NOT_FOUND, 'Sample not found');
    }
    res.send(new ApiResponse(httpStatus.OK, sample, 'Sample updated successfully'));
});

export const deleteSample = asyncHandler(async (req, res) => {
    await RdSample.findByIdAndDelete(req.params.sampleId);
    res.send(new ApiResponse(httpStatus.OK, null, 'Sample deleted successfully'));
});

export const addTestHistory = asyncHandler(async (req, res) => {
    const sample = await RdSample.findById(req.params.sampleId);
    if (!sample) {
        throw new ApiError(httpStatus.NOT_FOUND, 'Sample not found');
    }
    
    sample.testHistory.push({
        ...req.body,
        testedBy: req.user._id,
        testDate: new Date()
    });
    
    // Update main status if provided
    if (req.body.testStatus) {
        sample.testStatus = req.body.testStatus;
    }

    await sample.save();
    res.send(new ApiResponse(httpStatus.OK, sample, 'Test history added successfully'));
});

export const getComparisonReport = asyncHandler(async (req, res) => {
    const { projectId } = req.query;
    if (!projectId) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Project ID is required');
    }

    const samples = await RdSample.find({ project: projectId })
        .populate('project', 'projectName productName')
        .sort({ unitRate: 1 });

    res.send(new ApiResponse(httpStatus.OK, samples));
});
