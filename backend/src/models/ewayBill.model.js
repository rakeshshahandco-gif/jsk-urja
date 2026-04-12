import mongoose from 'mongoose';

const ewayBillItemSchema = new mongoose.Schema({
    productName: { type: String, required: true },
    productDesc: { type: String, default: '' },
    hsnCode: { type: String, default: '' },
    quantity: { type: Number, default: 0 },
    qtyUnit: { type: String, default: 'NOS' },
    taxableAmount: { type: Number, default: 0 },
    cgstRate: { type: Number, default: 0 },
    sgstRate: { type: Number, default: 0 },
    igstRate: { type: Number, default: 0 },
    cessRate: { type: Number, default: 0 },
}, { _id: false });

const ewayBillSchema = new mongoose.Schema(
    {
        salesInvoiceId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'SalesInvoice',
            required: true,
            unique: true,
        },
        customerId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Customer',
        },
        transporterId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Transporter',
            default: null,
        },
        
        // E-way Bill Details (Finalized)
        ewayBillNo: { type: String, default: '' },
        ewayBillDate: { type: Date, default: null },
        validUntil: { type: Date, default: null },
        
        status: {
            type: String,
            enum: [
                'Draft', 
                'Part A Ready', 
                'Part B Pending', 
                'Ready for JSON Export', 
                'Assigned to Transporter',
                'EWB Generated', 
                'Cancelled', 
                'Expired'
            ],
            default: 'Draft',
        },

        // Part A Details
        partA: {
            supplyType: { type: String, default: 'Outward' },
            subSupplyType: { type: String, default: 'Supply' },
            docType: { type: String, default: 'Tax Invoice' },
            docNo: { type: String, default: '' },
            docDate: { type: Date, default: null },
            
            // From Details
            fromGstin: { type: String, default: '' },
            fromTrdName: { type: String, default: '' },
            fromAddr1: { type: String, default: '' },
            fromAddr2: { type: String, default: '' },
            fromPlace: { type: String, default: '' },
            fromPincode: { type: String, default: '' },
            fromStateCode: { type: Number, default: 0 },
            
            // To Details
            toGstin: { type: String, default: '' },
            toTrdName: { type: String, default: '' },
            toAddr1: { type: String, default: '' },
            toAddr2: { type: String, default: '' },
            toPlace: { type: String, default: '' },
            toPincode: { type: String, default: '' },
            toStateCode: { type: Number, default: 0 },
            
            // Values
            totalValue: { type: Number, default: 0 },
            cgstValue: { type: Number, default: 0 },
            sgstValue: { type: Number, default: 0 },
            igstValue: { type: Number, default: 0 },
            cessValue: { type: Number, default: 0 },
            totInvValue: { type: Number, default: 0 },
            
            // Item List
            itemList: [ewayBillItemSchema],
        },

        // Part B Details
        partB: {
            transId: { type: String, default: '' },
            transName: { type: String, default: '' },
            transMode: { 
                type: String, 
                enum: ['Road', 'Rail', 'Air', 'Ship', ''], 
                default: 'Road' 
            },
            distance: { type: Number, default: 0 },
            transDocNo: { type: String, default: '' },
            transDocDate: { type: Date, default: null },
            vehicleNo: { type: String, default: '' },
            vehicleType: { 
                type: String, 
                enum: ['Regular', 'OverDimensionalCargo', ''], 
                default: 'Regular' 
            },
        },

        jsonExportedAt: { type: Date, default: null },
        cancelledAt: { type: Date, default: null },
        cancelReason: { type: String, default: '' },
        remarks: { type: String, default: '' },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    },
    { timestamps: true }
);

ewayBillSchema.index({ salesInvoiceId: 1 });
ewayBillSchema.index({ ewayBillNo: 1 });
ewayBillSchema.index({ status: 1 });

export const EwayBill = mongoose.model('EwayBill', ewayBillSchema);
