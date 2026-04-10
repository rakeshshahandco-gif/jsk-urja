import mongoose from 'mongoose';

const complaintItemSchema = new mongoose.Schema({
    itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', default: null },
    itemCode: { type: String, default: '' },
    itemName: { type: String, required: true },
    uom: { type: String, default: 'NOS' },
    qtySold: { type: Number, default: 0 },
    qtyFaultyReported: { type: Number, default: 1, min: 0 },
    approvedReplacementQty: { type: Number, default: 0 },
    dispatchedQty: { type: Number, default: 0 },
    faultyReceivedQty: { type: Number, default: 0 },
    pendingReturnQty: { type: Number, default: 0 },
    complaintReason: {
        type: String,
        // enum: ['Not Working', 'Low Output', 'Flickering', 'Dimming Issue', 'Driver Failure',
        //     'PCB Burnt', 'CCT Not Changing',Physical Damage', 'Wrong Item', 'Other'],
        default: 'Not Working',
    },
    actionRequired: {
        type: String,
        // enum: ['Replacement to be sent', 'Repair only', 'Return for inspection', 'Credit note later', 'No action / under review'],
        default: 'Replacement to be sent',
    },
    notes: { type: String, default: '' },
}, { _id: true });

const complaintSchema = new mongoose.Schema({
    complaintNo: { type: String, unique: true, trim: true },
    date: { type: Date, required: true, default: Date.now },
    status: {
        type: String,
        // enum: ['Open', 'Under Review', 'Approved', 'Replacement Sent', 'Waiting Faulty Return',
        //     'Faulty Partially Received', 'Faulty Fully Received', 'In QC', 'Repair In Process',
        //     'Closed', 'Closed with Scrap', 'Cancelled'],
        default: 'Open',
    },
    priority: { type: String, /* enum: ['Low', 'Medium', 'High', 'Urgent'], */ default: 'Medium' },

    // Customer
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', default: null },
    customerName: { type: String, required: true },
    contactPerson: { type: String, default: '' },
    mobile: { type: String, default: '' },
    email: { type: String, default: '' },

    // Invoice / Order links
    salesInvoiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'SalesInvoice', default: null },
    salesInvoiceNo: { type: String, default: '' },
    salesInvoiceDate: { type: Date, default: null },
    salesOrderId: { type: mongoose.Schema.Types.ObjectId, ref: 'SalesOrder', default: null },
    salesOrderNo: { type: String, default: '' },

    // Complaint meta
    faultCategory: {
        type: String,
        // enum: ['Customer Complaint', 'Warranty Return', 'Transit Damage', 'Production Defect', 'Old Service Return'],
        default: 'Customer Complaint',
    },
    warrantyStatus: { type: String, /* enum: ['In Warranty', 'Out of Warranty', 'Unknown'], */ default: 'Unknown' },

    // Line items
    items: [complaintItemSchema],

    // Approval
    approvedBy: { type: String, default: '' },
    approvedOn: { type: Date, default: null },
    approvalNotes: { type: String, default: '' },

    // Footer
    internalRemarks: { type: String, default: '' },
    closureRemarks: { type: String, default: '' },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

complaintSchema.index({ complaintNo: 1 });
complaintSchema.index({ customerId: 1, date: -1 });
complaintSchema.index({ status: 1 });

const Complaint = mongoose.model('Complaint', complaintSchema);
export { Complaint };
