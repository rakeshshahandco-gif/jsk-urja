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
            enum: ['led_light_manufacturer', 'led_light_showroom', 'home_automation_provider', 'interior_designer', 'builders', 'dealer', 'distributor', ''],
            default: '',
        },
        area: {
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
        pincode: {
            type: String,
            trim: true,
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
        // Product Interest
        interestedProducts: {
            type: [String],
            enum: [
                'PHASE CUT DIMMABLE DRIVER AND DIMMER',
                'ANALOG DRIVER & DIMMER',
                'DALI DRIVER & DIMMER',
                'SMART DRIVER – BLE',
                'SMART DRIVER – ZIGBEE',
                ''  // Allow empty strings for flexibility
            ],
            default: [],
        },
        productNotes: {
            type: String,
            trim: true,
        },
        isDeleted: {
            type: Boolean,
            default: false,
        },
    },
    {
        timestamps: true,
    }
);

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
