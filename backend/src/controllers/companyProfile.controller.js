import { CompanyProfile } from '../models/companyProfile.model.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import Joi from 'joi';

// Validation Schema
const companyProfileSchema = Joi.object({
    companyName: Joi.string().required(),
    address: Joi.string().allow('', null),
    city: Joi.string().allow('', null),
    state: Joi.string().allow('', null),
    stateCode: Joi.string().allow('', null),
    pincode: Joi.string().allow('', null),
    gstNumber: Joi.string().allow('', null),
    panNumber: Joi.string().allow('', null),
    logoUrl: Joi.string().allow('', null),
});

// @desc    Get company profile (Singleton)
// @route   GET /api/v1/company-profile
// @access  Private
export const getCompanyProfile = asyncHandler(async (req, res) => {
    let profile = await CompanyProfile.findOne();

    // If no profile exists, create a default empty one
    if (!profile) {
        profile = await CompanyProfile.create({
            companyName: 'Default Company Name',
        });
    }

    res.status(200).json(new ApiResponse(200, profile, 'Company profile fetched successfully'));
});

// @desc    Update company profile
// @route   PUT /api/v1/company-profile
// @access  Private
export const updateCompanyProfile = asyncHandler(async (req, res) => {
    const { error, value } = companyProfileSchema.validate(req.body, { allowUnknown: true });

    if (error) {
        throw new ApiError(400, error.details[0].message);
    }

    // Handle file upload
    if (req.file) {
        // Construct public URL path
        value.logoUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
    }

    let profile = await CompanyProfile.findOne();

    if (!profile) {
        profile = new CompanyProfile(value);
    } else {
        Object.assign(profile, value);
    }

    profile.updatedBy = req.user._id;
    await profile.save();

    res.status(200).json(new ApiResponse(200, profile, 'Company profile updated successfully'));
});
