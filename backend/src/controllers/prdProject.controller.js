import PrdProject from '../models/prdProject.model.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { logPrdAudit } from '../middlewares/prdAuth.middleware.js';

export const createProject = asyncHandler(async (req, res) => {
    const { productCode, productName, category, rdOwner } = req.body;
    
    if (!productCode || !productName || !category || !rdOwner) {
        throw new ApiError(400, 'Product Code, Name, Category, and R&D Owner are required');
    }

    const existing = await PrdProject.findOne({ productCode });
    if (existing) {
        throw new ApiError(400, `Product Code ${productCode} already exists`);
    }

    const projectData = { ...req.body, createdBy: req.user._id };

    // Handle attachments if any
    if (req.files && req.files.length > 0) {
        projectData.attachments = req.files.map(f => ({
            filename: f.originalname,
            url: f.path.replace(/\\\\/g, '/'),
            mimetype: f.mimetype,
            size: f.size
        }));
    }

    const project = await PrdProject.create(projectData);

    await logPrdAudit(req, project._id, 'PrdProject', 'Create', [], `Project ${productCode} created`);

    res.status(201).json(new ApiResponse(201, project, 'Product Development Project created successfully'));
});

export const getProjects = asyncHandler(async (req, res) => {
    const { 
        page = 1, 
        limit = 10, 
        search, 
        category, 
        status, 
        currentStage,
        rdOwner 
    } = req.query;

    const query = {};

    if (search) {
        query.$or = [
            { productCode: { $regex: search, $options: 'i' } },
            { productName: { $regex: search, $options: 'i' } },
            { customerName: { $regex: search, $options: 'i' } }
        ];
    }

    if (category) query.category = category;
    if (status) query.status = status;
    if (currentStage) query.currentStage = currentStage;
    if (rdOwner) query.rdOwner = rdOwner;

    const options = {
        skip: (parseInt(page) - 1) * parseInt(limit),
        limit: parseInt(limit),
        sort: { updatedAt: -1 }
    };

    const [projects, total] = await Promise.all([
        PrdProject.find(query, null, options)
            .populate('rdOwner', 'name email')
            .populate('hardwareDeveloper', 'name email')
            .populate('firmwareDeveloper', 'name')
            .populate('testingEngineer', 'name'),
        PrdProject.countDocuments(query)
    ]);

    res.json(new ApiResponse(200, {
        results: projects,
        totalResults: total,
        totalPages: Math.ceil(total / parseInt(limit)),
        page: parseInt(page)
    }, 'Projects fetched'));
});

export const getProjectById = asyncHandler(async (req, res) => {
    const project = await PrdProject.findById(req.params.id)
        .populate('rdOwner', 'name email')
        .populate('hardwareDeveloper', 'name email')
        .populate('firmwareDeveloper', 'name email')
        .populate('testingEngineer', 'name email');

    if (!project) throw new ApiError(404, 'Project not found');

    res.json(new ApiResponse(200, project, 'Project fetched successfully'));
});

export const updateProject = asyncHandler(async (req, res) => {
    const project = await PrdProject.findById(req.params.id);
    if (!project) throw new ApiError(404, 'Project not found');

    const oldValues = { ...project.toObject() };
    const updates = req.body;
    let changes = [];

    // Track primitive changes
    Object.keys(updates).forEach(key => {
        if (updates[key] !== undefined && key !== 'attachments' && String(project[key]) !== String(updates[key])) {
            changes.push({ field: key, oldValue: String(project[key]), newValue: String(updates[key]) });
            project[key] = updates[key];
        }
    });

    if (req.files && req.files.length > 0) {
        const newAttachments = req.files.map(f => ({
            filename: f.originalname,
            url: f.path.replace(/\\\\/g, '/'),
            mimetype: f.mimetype,
            size: f.size
        }));
        project.attachments.push(...newAttachments);
        changes.push({ field: 'attachments', oldValue: 'Uploaded', newValue: `${req.files.length} new files` });
    }

    await project.save();

    if (changes.length > 0) {
        await logPrdAudit(req, project._id, 'PrdProject', 'Update', changes, 'Project metadata updated');
    }

    res.json(new ApiResponse(200, project, 'Project updated successfully'));
});

export const deleteProject = asyncHandler(async (req, res) => {
    // Only superadmin can delete per middleware, this is the final handler
    const project = await PrdProject.findById(req.params.id);
    if (!project) throw new ApiError(404, 'Project not found');

    await PrdProject.findByIdAndDelete(req.params.id);
    
    await logPrdAudit(req, project._id, 'PrdProject', 'Delete', [], `Project ${project.productCode} completely deleted by Admin`);

    res.json(new ApiResponse(200, null, 'Project deleted successfully'));
});
