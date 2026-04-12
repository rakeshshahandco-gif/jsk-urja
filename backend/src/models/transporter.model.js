import mongoose from 'mongoose';

const transporterSchema = new mongoose.Schema(
    {
        transporterName: {
            type: String,
            required: true,
            trim: true,
        },
        transporterId: {
            type: String,
            required: true,
            unique: true,
            trim: true,
            uppercase: true,
            description: 'GSTIN of the transporter or Transporter ID',
        },
        type: {
            type: String,
            enum: ['Transporter', 'Courier'],
            default: 'Transporter',
        },

        phone: {
            type: String,
            trim: true,
            default: '',
        },
        email: {
            type: String,
            trim: true,
            lowercase: true,
            default: '',
        },
        address: {
            type: String,
            trim: true,
            default: '',
        },
        isDeleted: {
            type: Boolean,
            default: false,
        },
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
        },
        updatedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
        },
    },
    { timestamps: true }
);

transporterSchema.index({ transporterName: 'text', transporterId: 'text' });

export const Transporter = mongoose.model('Transporter', transporterSchema);
