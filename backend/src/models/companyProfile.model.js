import mongoose from 'mongoose';

const companyProfileSchema = new mongoose.Schema(
    {
        companyName: {
            type: String,
            required: true,
            trim: true,
        },
        address: {
            type: String,
            trim: true,
            default: '',
        },
        city: {
            type: String,
            trim: true,
            default: '',
        },
        state: {
            type: String,
            trim: true,
            default: '',
        },
        stateCode: {
            type: String,
            trim: true,
            default: '',
        },
        pincode: {
            type: String,
            trim: true,
            default: '',
        },
        gstNumber: {
            type: String,
            trim: true,
            default: '',
        },
        tradeName: {  // Added for GSTR-1
            type: String,
            trim: true,
            default: '',
        },
        gstFilingFrequency: { // Monthly / Quarterly
            type: String,
            enum: ['Monthly', 'Quarterly', ''],
            default: '',
        },
        aatoBracket: {       // Up to 5Cr / Above 5Cr for HSN validation rules
            type: String,
            enum: ['Up to 5Cr', 'Above 5Cr', ''],
            default: '',
        },
        defaultDocumentSeries: { // Mapping series for GSTR-1 Table 13 Documents Issued
            taxInvoice: { type: mongoose.Schema.Types.ObjectId, ref: 'InvoiceSeries', default: null },
            creditNote: { type: mongoose.Schema.Types.ObjectId, ref: 'InvoiceSeries', default: null },
            debitNote: { type: mongoose.Schema.Types.ObjectId, ref: 'InvoiceSeries', default: null },
            billOfSupply: { type: mongoose.Schema.Types.ObjectId, ref: 'InvoiceSeries', default: null },
        },
        panNumber: {
            type: String,
            trim: true,
            default: '',
        },
        email: {
            type: String,
            trim: true,
            default: '',
        },
        phone: {
            type: String,
            trim: true,
            default: '',
        },
        urn: {
            type: String,
            trim: true,
            default: '',
        },
        cin: {
            type: String,
            trim: true,
            default: '',
        },
        bankName: {
            type: String,
            trim: true,
            default: '',
        },
        accountNo: {
            type: String,
            trim: true,
            default: '',
        },
        branchName: {
            type: String,
            trim: true,
            default: '',
        },
        ifscCode: {
            type: String,
            trim: true,
            default: '',
        },
        logoUrl: {
            type: String,
            trim: true,
            default: '',
        },
        logoHeight: {
            type: Number,
            default: 65,
        },
        emailSettings: {
            senderName: { type: String, trim: true, default: '' },
            emailId: { type: String, trim: true, default: '' },
            appPassword: { type: String, trim: true, default: '' },
            replyTo: { type: String, trim: true, default: '' },
        },
        whatsAppSettings: {
            appId: { type: String, trim: true, default: '' },
            phoneNumberId: { type: String, trim: true, default: '' },
            accessToken: { type: String, trim: true, default: '' },
            businessAccountId: { type: String, trim: true, default: '' },
            provider: { type: String, enum: ['meta', 'ultramsg', 'none'], default: 'none' },
            instanceId: { type: String, trim: true, default: '' }, // For 3rd party like UltraMsg
        },
        updatedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
        },
    },
    { timestamps: true }
);

export const CompanyProfile = mongoose.model('CompanyProfile', companyProfileSchema);
