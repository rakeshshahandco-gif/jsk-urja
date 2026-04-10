import mongoose from 'mongoose';

const customerSchema = mongoose.Schema(
    {
        customerName: {
            type: String,
            trim: true,
            default: "",
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
            enum: ['Registered', 'Unregistered', 'Composite', 'Consumer', ''],
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
        paymentType: {
            type: String,
            enum: ['Cash', 'Credit'],
            default: 'Credit',
        },
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
