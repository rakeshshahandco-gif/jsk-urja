import mongoose from 'mongoose';

const voucherTypeSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true, unique: true }, // e.g., RCPT, PMT, CASHRCPT
    nature: {
        type: String,
        enum: ['Receipt', 'Payment', 'Contra', 'Journal'],
        required: true
    },
    prefix: { type: String, default: '' },
    autoNumbering: { type: Boolean, default: true },
    startingNumber: { type: Number, default: 1 },
    nextNumber: { type: Number, default: 1 },

    active: { type: Boolean, default: true },
    remarks: { type: String, default: '' },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

const VoucherType = mongoose.model('VoucherType', voucherTypeSchema);
export { VoucherType };
