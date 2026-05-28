import { CompanyProfile } from '../models/companyProfile.model.js';
import { Company } from '../models/company.model.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import Joi from 'joi';

/** Copy missing profile fields from the active Company row (Render often has Company filled but an empty CompanyProfile). */
const mergeCompanyIntoProfile = (profile, company) => {
    if (!profile || !company) return false;
    const bank = company.bankDetails || {};
    const pairs = [
        ['companyName', company.companyName],
        ['address', company.address],
        ['city', company.city],
        ['state', company.state],
        ['pincode', company.pincode],
        ['gstNumber', company.gstNumber],
        ['panNumber', company.panNumber],
        ['email', company.email],
        ['phone', company.mobile || company.phone],
        ['cin', company.cinNumber],
        ['logoUrl', company.logoUrl],
        ['bankName', bank.bankName],
        ['accountNo', bank.accountNo],
        ['branchName', bank.branchName],
        ['ifscCode', bank.ifscCode],
    ];
    let changed = false;
    for (const [key, val] of pairs) {
        const v = val != null ? String(val).trim() : '';
        if (v && !String(profile[key] || '').trim()) {
            profile[key] = v;
            changed = true;
        }
    }
    return changed;
};

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
    tanNumber: Joi.string().trim().uppercase().allow('', null),
    email: Joi.string().allow('', null),
    phone: Joi.string().allow('', null),
    urn: Joi.string().allow('', null),
    cin: Joi.string().allow('', null),
    logoUrl: Joi.string().allow('', null),
    logoHeight: Joi.number().min(20).max(150).allow(null),
});

// @desc    Get company profile (Singleton)
// @route   GET /api/v1/company-profile
// @access  Private
export const getCompanyProfile = asyncHandler(async (req, res) => {
    if (!req.companyId) {
        throw new ApiError(400, 'Active company is required');
    }
    const company = await Company.findById(req.companyId).lean();
    let profile = await CompanyProfile.findOne({ companyId: req.companyId });

    // Legacy fallback: old singleton profile docs (without companyId) still exist
    // on some Render DBs. Re-attach one to the active company by company name.
    if (!profile && company?.companyName) {
        const legacy = await CompanyProfile.findOne({
            $or: [
                { companyId: { $exists: false } },
                { companyId: null },
            ],
            companyName: company.companyName,
        });
        if (legacy) {
            legacy.companyId = req.companyId;
            profile = legacy;
        }
    }

    if (!profile) {
        profile = new CompanyProfile({
            companyName: company?.companyName || 'Default Company Name',
            companyId: req.companyId,
        });
        mergeCompanyIntoProfile(profile, company);
        await profile.save();
    } else if (mergeCompanyIntoProfile(profile, company)) {
        await profile.save();
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

    if (!req.companyId) {
        throw new ApiError(400, 'Active company is required');
    }
    let profile = await CompanyProfile.findOne({ companyId: req.companyId });

    if (!profile) {
        profile = new CompanyProfile({ ...value, companyId: req.companyId });
    } else {
        Object.assign(profile, value);
    }

    profile.updatedBy = req.user._id;
    await profile.save();

    res.status(200).json(new ApiResponse(200, profile, 'Company profile updated successfully'));
});
