import { Company } from '../models/company.model.js';
import { CompanyProfile } from '../models/companyProfile.model.js';

// ─── Helper: seed default company from existing CompanyProfile ───────────────
const seedDefaultCompanyIfNeeded = async () => {
    const count = await Company.countDocuments();
    if (count === 0) {
        // Pull data from the existing single CompanyProfile
        const profile = await CompanyProfile.findOne();
        await Company.create({
            companyName: profile?.companyName || 'Main Company',
            legalName: profile?.companyName || '',
            address: profile?.address || '',
            city: profile?.city || '',
            state: profile?.state || '',
            pincode: profile?.pincode || '',
            country: 'India',
            gstNumber: profile?.gstNumber || '',
            panNumber: profile?.panNumber || '',
            cinNumber: profile?.cin || '',
            email: profile?.email || '',
            mobile: profile?.phone || '',
            logoUrl: profile?.logoUrl || '',
            bankDetails: {
                bankName: profile?.bankName || '',
                accountNo: profile?.accountNo || '',
                branchName: profile?.branchName || '',
                ifscCode: profile?.ifscCode || '',
            },
            isDefault: true,
            isActive: true,
        });
    }
};

// GET /companies  — list all companies (admin only)
export const listCompanies = async (req, res) => {
    try {
        await seedDefaultCompanyIfNeeded();
        const companies = await Company.find().sort({ isDefault: -1, createdAt: 1 });
        res.json({ success: true, data: companies });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// GET /companies/active  — list active companies (for switcher)
export const listActiveCompanies = async (req, res) => {
    try {
        await seedDefaultCompanyIfNeeded();
        const companies = await Company.find({ isActive: true }).sort({ isDefault: -1, companyName: 1 });
        res.json({ success: true, data: companies });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// GET /companies/:id
export const getCompany = async (req, res) => {
    try {
        const company = await Company.findById(req.params.id);
        if (!company) return res.status(404).json({ success: false, message: 'Company not found' });
        res.json({ success: true, data: company });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// POST /companies  — create new company
export const createCompany = async (req, res) => {
    try {
        const { isDefault, ...rest } = req.body;
        const company = await Company.create({
            ...rest,
            isDefault: false, // new companies are never default
            createdBy: req.user?._id,
        });
        res.status(201).json({ success: true, data: company, message: 'Company created successfully' });
    } catch (err) {
        if (err.code === 11000) {
            return res.status(400).json({ success: false, message: 'A company with this name already exists' });
        }
        res.status(500).json({ success: false, message: err.message });
    }
};

// PUT /companies/:id  — update company
export const updateCompany = async (req, res) => {
    try {
        const { isDefault, ...rest } = req.body; // cannot change isDefault via update
        const company = await Company.findByIdAndUpdate(
            req.params.id,
            { ...rest, updatedBy: req.user?._id },
            { new: true, runValidators: true }
        );
        if (!company) return res.status(404).json({ success: false, message: 'Company not found' });
        res.json({ success: true, data: company, message: 'Company updated successfully' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// PATCH /companies/:id/toggle-active  — activate / deactivate
export const toggleCompanyActive = async (req, res) => {
    try {
        const company = await Company.findById(req.params.id);
        if (!company) return res.status(404).json({ success: false, message: 'Company not found' });
        if (company.isDefault) {
            return res.status(400).json({ success: false, message: 'Cannot deactivate the default company' });
        }
        company.isActive = !company.isActive;
        await company.save();
        res.json({ success: true, data: company, message: `Company ${company.isActive ? 'activated' : 'deactivated'}` });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// POST /companies/upload-logo  — upload company logo
export const uploadCompanyLogo = async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });
        const logoUrl = `/uploads/${req.file.filename}`;
        res.json({ success: true, logoUrl, message: 'Logo uploaded successfully' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};
