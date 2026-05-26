import mongoose from 'mongoose';

const narrationTemplateSchema = new mongoose.Schema({
    title: { type: String, required: true, trim: true },
    narration: { type: String, required: true, trim: true },
    voucherNature: {
        type: String,
        enum: ['Receipt', 'Payment', 'Journal', 'Expense', 'Contra', 'Debit Note', 'Credit Note', 'Sales', 'Purchase', 'Any'],
        default: 'Any',
    },
    isActive: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

narrationTemplateSchema.index({ voucherNature: 1 });
narrationTemplateSchema.index({ title: 'text', narration: 'text' });

const NarrationTemplate = mongoose.model('NarrationTemplate', narrationTemplateSchema);
export { NarrationTemplate };
