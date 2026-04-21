import mongoose from 'mongoose';

const communicationLogSchema = new mongoose.Schema(
    {
        date: {
            type: Date,
            default: Date.now,
        },
        documentType: {
            type: String,
            enum: ['Sales Order', 'Purchase Order', 'Sales Invoice'],
            required: true,
        },
        documentNumber: {
            type: String,
            required: true,
        },
        documentId: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
        },
        sentToName: {
            type: String,
            trim: true,
        },
        sentToEmail: {
            type: String,
            trim: true,
        },
        sentToWhatsApp: {
            type: String,
            trim: true,
        },
        sentBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        channel: {
            type: String,
            enum: ['Email', 'WhatsApp', 'Both'],
            required: true,
        },
        sendMode: {
            type: String,
            enum: ['Number', 'Group', 'Manual', 'manual'],
            default: 'Number',
        },
        groupName: {
            type: String,
            trim: true,
        },
        status: {
            type: String,
            default: 'Pending',
        },
        errorMessage: {
            type: String,
            trim: true,
        },
        metadata: {
            type: Object,
            default: {},
        }
    },
    { timestamps: true }
);

communicationLogSchema.index({ documentNumber: 1, documentType: 1 });
communicationLogSchema.index({ documentId: 1 });

const CommunicationLog = mongoose.model('CommunicationLog', communicationLogSchema);

export default CommunicationLog;
