import mongoose from 'mongoose';

const eInvoiceDraftSchema = new mongoose.Schema(
    {
        salesInvoiceId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'SalesInvoice',
            required: true,
            unique: true,
        },
        customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', default: null },

        invoiceNumber: { type: String, default: '' },
        invoiceDate: { type: Date, default: null },
        customerName: { type: String, default: '' },
        customerGstin: { type: String, default: '' },

        status: {
            type: String,
            enum: ['Draft', 'Ready for JSON Export', 'IRN Generated', 'Cancelled'],
            default: 'Draft',
        },

        /** NIC IRP v1.1 payload snapshot */
        payload: { type: mongoose.Schema.Types.Mixed, default: null },

        irn: { type: String, trim: true, default: '' },
        irnAckNo: { type: String, trim: true, default: '' },
        irnAckDate: { type: Date, default: null },
        signedQrCode: { type: String, default: '' },

        jsonExportedAt: { type: Date, default: null },
        irnGeneratedAt: { type: Date, default: null },
        remarks: { type: String, default: '' },

        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    },
    { timestamps: true },
);

eInvoiceDraftSchema.index({ status: 1 });
eInvoiceDraftSchema.index({ invoiceNumber: 1 });
eInvoiceDraftSchema.index({ irn: 1 });

export const EInvoiceDraft = mongoose.model('EInvoiceDraft', eInvoiceDraftSchema);
