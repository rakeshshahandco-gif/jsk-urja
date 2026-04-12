import { Transporter } from '../models/transporter.model.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const createTransporter = asyncHandler(async (req, res) => {
    const { transporterName, transporterId } = req.body;
    
    if (!transporterName || !transporterId) {
        throw new ApiError(400, 'Transporter Name and ID (GSTIN) are required');
    }

    const existing = await Transporter.findOne({ transporterId, isDeleted: false });
    if (existing) {
        throw new ApiError(400, 'Transporter ID already exists');
    }

    const transporter = await Transporter.create({
        ...req.body,
        createdBy: req.user._id,
    });

    res.status(201).json(new ApiResponse(201, transporter, 'Transporter created successfully'));
});

export const getTransporters = asyncHandler(async (req, res) => {
    const { search } = req.query;
    const filter = { isDeleted: false };
    
    if (search) {
        filter.$or = [
            { transporterName: { $regex: search, $options: 'i' } },
            { transporterId: { $regex: search, $options: 'i' } },
        ];
    }

    const transporters = await Transporter.find(filter).sort({ transporterName: 1 });
    res.status(200).json(new ApiResponse(200, transporters));
});

export const getTransporterById = asyncHandler(async (req, res) => {
    const transporter = await Transporter.findOne({ _id: req.params.id, isDeleted: false });
    if (!transporter) {
        throw new ApiError(404, 'Transporter not found');
    }
    res.status(200).json(new ApiResponse(200, transporter));
});

export const updateTransporter = asyncHandler(async (req, res) => {
    const transporter = await Transporter.findOneAndUpdate(
        { _id: req.params.id, isDeleted: false },
        { ...req.body, updatedBy: req.user._id },
        { new: true, runValidators: true }
    );
    if (!transporter) {
        throw new ApiError(404, 'Transporter not found');
    }
    res.status(200).json(new ApiResponse(200, transporter, 'Transporter updated successfully'));
});

export const deleteTransporter = asyncHandler(async (req, res) => {
    const transporter = await Transporter.findOneAndUpdate(
        { _id: req.params.id, isDeleted: false },
        { isDeleted: true, updatedBy: req.user._id },
        { new: true }
    );
    if (!transporter) {
        throw new ApiError(404, 'Transporter not found');
    }
    res.status(200).json(new ApiResponse(200, null, 'Transporter deleted successfully'));
});
