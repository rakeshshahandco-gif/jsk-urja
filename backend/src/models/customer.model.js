import mongoose from 'mongoose';

const customerSchema = mongoose.Schema(
    {
        customerName: {
            type: String,
            trim: true,
            default: "",
        },
        legalName: {
            type: String,
            trim: true,
            default: '',
        },
        tradeName: {
            type: String,
            trim: true,
            default: '',
        },
        contactPersons: [{
            name: {
                type: String,
                trim: true,
                default: "",
            },
            mobile: {
                type: String,
                trim: true,
                default: "",
            },
            mobile2: {
                type: String,
                trim: true,
            },
            mobile3: {
                type: String,
                trim: true,
                default: "",
            },
            mobile4: {
                type: String,
                trim: true,
                default: "",
            },
            mobile5: {
                type: String,
                trim: true,
                default: "",
            },
            whatsApp: {
                type: String,
                trim: true,
                default: "",
            },
            email: {
                type: String,
                trim: true,
                lowercase: true,
                match: /^\S+@\S+$/i,
            },
            isPrimary: {
                type: Boolean,
                default: false,
            }
        }],
        companyEmail: {
            type: String,
            trim: true,
            lowercase: true,
            match: /^\S+@\S+$/i,
        },
        website: {
            type: String,
            trim: true,
            default: "",
        },
        company: {
            type: String,
            trim: true,
        },
        companyBrand: {
            type: String,
            trim: true,
            default: "",
        },
        customerType: {
            type: String,
            default: '',
        },
        sticker: {
            type: String,
            trim: true,
            default: '',
        },
        stickers: [{
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Sticker',
        }],
        city: {
            type: String,
            trim: true,
        },
        state: {
            type: String,
            trim: true,
        },
        address: {
            type: String,
            trim: true,
        },
        billingStateCode: {
            type: String,
            trim: true,
            default: '',
        },
        shippingAddress: {
            type: String,
            trim: true,
            default: '',
        },
        shippingCity: {
            type: String,
            trim: true,
            default: '',
        },
        shippingState: {
            type: String,
            trim: true,
            default: '',
        },
        shippingStateCode: {
            type: String,
            trim: true,
            default: '',
        },
        additionalAddress: {
            type: String,
            trim: true,
            default: "",
        },
        pincode: {
            type: String,
            trim: true,
        },
        district: {
            type: String,
            trim: true,
        },
        taluka: {
            type: String,
            trim: true,
        },
        country: {
            type: String,
            trim: true,
            default: 'India',
        },
        status: {
            type: String,
            enum: ['running_high', 'running_low', 'inactive', 'lead'],
            default: 'lead',
        },
        leadSource: {
            type: String,
            trim: true,
            default: '',
        },
        assignedSalesperson: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            default: null,
        },
        leadStage: {
            type: String,
            enum: [
                'New', 
                'Contacted', 
                'Qualified', 
                'Interested',
                'Follow-up Required',
                'Quotation Required',
                'Sample Required',
                'Sample Sent', 
                'Sample Under Testing',
                'Negotiation', 
                'Converted to Order', 
                'Not Converted',
                'Lost', 
                'Hold',
                'Project Postponed',
                'Customer Not Responding',
                'Closed', 
                ''
            ],
            default: 'New',
        },
        notConvertedDetails: {
            reason: String,
            matter: String,
            offeredRate: Number,
            expectedRate: Number,
            competitorRate: Number,
            competitorName: String,
            requiredSpec: String,
            offeredSpec: String,
            issueDetails: String,
            expectedRequirementDate: Date,
            nextFollowUpDate: Date,
            assignedTo: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User'
            },
            remarks: String
        },
        leadDate: {
            type: Date,
            default: Date.now,
        },
        interestedProducts: {
            type: [String],
            default: [],
        },
        lostReason: {
            type: String,
            trim: true,
            default: '',
        },
        lostCompetitor: {
            type: String,
            trim: true,
            default: '',
        },
        notes: {
            type: String,
        },
        tags: {
            type: [String],
            default: [],
        },
        // GST Details
        gstNumber: {
            type: String,
            trim: true,
            uppercase: true,
            match: [/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/, 'Invalid GST number format'],
        },
        gstType: {
            type: String,
            enum: ['CGST / SGST', 'IGST', ''],
            default: '',
        },
        gstRegistrationType: {
            type: String,
            enum: ['Registered', 'Unregistered', 'Composite', 'Consumer', 'UIN', 'SEZ', 'Export', ''],
            default: '',
        },
        defaultPlaceOfSupply: {
            type: String,
            trim: true,
            default: '',
        },
        customerActivityType: {
            type: String,
            enum: ['B2B', 'B2C', ''],
            default: '',
        },
        exportCountry: {
            type: String,
            trim: true,
            default: '',
        },
        isDeleted: {
            type: Boolean,
            default: false,
        },
        deletedAt: {
            type: Date,
            default: null,
        },
        restoredAt: {
            type: Date,
            default: null,
        },
        restoredReason: {
            type: String,
            default: null,
        },
        customerCode: {
            type: String,
            unique: true,
            trim: true,
        },
        creditPeriod: {
            type: Number,
            default: 0,
        },
        gracePeriodDays: {
            type: Number,
            default: 0,
        },
        creditLimit: {
            type: Number,
            default: 0,
        },
        creditLimitAction: {
            type: String,
            enum: ['None', 'Warn', 'Block'],
            default: 'Warn',
        },
        paymentType: {
            type: String,
            enum: ['Cash', 'Credit'],
            default: 'Credit',
        },
        paymentTerms: {
            type: String,
            trim: true,
            default: '',
        },
        tcsApplicable: {
            type: Boolean,
            default: false,
        },
        tcsSection: {
            type: String,
            trim: true,
            default: '',
        },
        tcsRate: {
            type: Number,
            default: 0,
        },
        tcsThresholdLimit: {
            type: Number,
            default: 0,
        },
        panAvailable: {
            type: Boolean,
            default: false,
        },
        panNumber: {
            type: String,
            trim: true,
            uppercase: true,
            default: '',
        },
        tanNumber: {
            type: String,
            trim: true,
            uppercase: true,
            default: '',
        },
        cinNumber: {
            type: String,
            trim: true,
            uppercase: true,
            default: '',
        },
        iecNumber: {
            type: String,
            trim: true,
            uppercase: true,
            default: '',
        },
        gstState: {
            type: String,
            trim: true,
            default: '',
        },
        bankName: { type: String, trim: true, default: '' },
        bankBranch: { type: String, trim: true, default: '' },
        bankAccountNumber: { type: String, trim: true, default: '' },
        bankIfsc: { type: String, trim: true, uppercase: true, default: '' },
        bankSwift: { type: String, trim: true, uppercase: true, default: '' },
        bankUpi: { type: String, trim: true, default: '' },
        exportBuyerCode: { type: String, trim: true, default: '' },
        exportPort: { type: String, trim: true, default: '' },
        exportCurrency: { type: String, trim: true, default: '' },
        exportLcTerms: { type: String, trim: true, default: '' },
        exportPaymentTerms: { type: String, trim: true, default: '' },
        isExportCustomer: { type: Boolean, default: false },
        billWiseTracking: {
            type: Boolean,
            default: false,
        },
        interestApplicable: {
            type: Boolean,
            default: false,
        },
        collectionPersonId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            default: null,
        },
        riskCategory: {
            type: String,
            enum: ['', 'Low', 'Medium', 'High'],
            default: '',
        },
        creditRemarks: {
            type: String,
            trim: true,
            default: '',
        },
        openingBalance: {
            type: Number,
            default: 0,
        },
        drCr: {
            type: String,
            enum: ['Dr', 'Cr'],
            default: 'Dr',
        },
        // Sales / Referral Details
        referralDetails: {
            sourceType: {
                type: String,
                enum: ['Direct', 'Salesperson', 'Distributor', 'Dealer', 'Referral Partner', 'Other'],
                default: 'Direct',
            },
            salespersonId: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User',
                default: null,
            },
            distributorId: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Distributor',
                default: null,
            },
            incentiveApplicable: {
                type: Boolean,
                default: false,
            },
            incentiveType: {
                type: String,
                enum: ['Percentage of sales', 'Fixed amount per invoice', 'Fixed amount per customer', 'Item-wise incentive', 'Manual'],
                default: 'Percentage of sales',
            },
            incentiveValue: {
                type: Number,
                default: 0,
            },
            startDate: {
                type: Date,
                default: null,
            },
            endDate: {
                type: Date,
                default: null,
            },
            remarks: {
                type: String,
                default: '',
            }
        },
        ledgerId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'AccountLedger',
            default: null,
        },
        // MSME fields — mirrored on linked AccountLedger
        msmeApplicable: { type: Boolean, default: false },
        msmeRegNo: { type: String, trim: true, default: '' },
        msmeCategory: { type: String, enum: ['', 'Micro', 'Small', 'Medium'], default: '' },
        /** Dynamic industry / feature-config custom fields (featureKey → value) */
        industryCustomFields: { type: Map, of: String, default: {} },
    },
    {
        timestamps: true,
    }
);

// Pre-save hook for GST Automation
customerSchema.pre('save', function (next) {
    // 1. Handle GST Registration Type based on GST Number
    if (this.gstNumber && this.gstNumber.trim().length > 0) {
        if (!this.gstRegistrationType || this.gstRegistrationType === 'Unregistered' || this.gstRegistrationType === 'Consumer') {
            this.gstRegistrationType = 'Registered';
        }
    } else {
        if (!this.gstRegistrationType || this.gstRegistrationType === 'Registered' || this.gstRegistrationType === 'Unregistered') {
            this.gstRegistrationType = 'Consumer';
        }
    }

    // 2. Handle GST Type based on State or GST Number Prefix
    if (!this.gstType) {
        const stateStr = this.state ? String(this.state).trim().toLowerCase() : '';
        const gstPrefix = this.gstNumber ? String(this.gstNumber).trim().substring(0, 2) : '';
        
        let isMaharashtra = false;
        if (stateStr === 'maharashtra') {
            isMaharashtra = true;
        } else if (gstPrefix === '27') {
            isMaharashtra = true;
        }

        if (stateStr || gstPrefix) {
            this.gstType = isMaharashtra ? 'CGST / SGST' : 'IGST';
        }
    }

    next();
});

/**
 * 🛡️  SAFETY HOOK: Block isDeleted from being set via findOneAndUpdate / updateMany etc.
 * Any update operation that tries to set isDeleted=true must go through the
 * explicit deleteCustomerById service function only.
 * This prevents accidental deletion via bulk imports or API payload injection.
 */
const _stripIsDeletedFromUpdate = function (next) {
    const update = this.getUpdate();
    const options = this.getOptions();
    if (!update || options.bypassSecurity) return next();

    // Remove from $set
    if (update.$set && update.$set.isDeleted !== undefined) {
        console.warn('[CustomerModel] 🚨 Blocked attempt to set isDeleted via update operation!');
        delete update.$set.isDeleted;
    }

    // Remove from top-level
    if (update.isDeleted !== undefined) {
        console.warn('[CustomerModel] 🚨 Blocked attempt to set isDeleted via top-level update!');
        delete update.isDeleted;
    }

    next();
};

customerSchema.pre('findOneAndUpdate', _stripIsDeletedFromUpdate);
customerSchema.pre('updateOne', _stripIsDeletedFromUpdate);
customerSchema.pre('updateMany', _stripIsDeletedFromUpdate);
customerSchema.pre('findByIdAndUpdate', _stripIsDeletedFromUpdate);

// Validation: Ensure at least one contact person exists
customerSchema.path('contactPersons').validate(function (value) {
    return value && value.length > 0;
}, 'At least one contact person is required');

// Validation: Ensure exactly one contact is marked as primary
customerSchema.path('contactPersons').validate(function (value) {
    if (!value || value.length === 0) return true; // Will be caught by previous validator
    const primaryCount = value.filter(contact => contact.isPrimary).length;
    return primaryCount === 1;
}, 'Exactly one contact person must be marked as primary');

// Plugin to filter out soft deleted docs by default? 
// For simplicity we will handle it in Service layer query
customerSchema.index({ customerName: 'text', 'contactPersons.name': 'text', 'contactPersons.email': 'text', company: 'text' });

/**
 * @typedef Customer
 */
const Customer = mongoose.model('Customer', customerSchema);

export default Customer;
