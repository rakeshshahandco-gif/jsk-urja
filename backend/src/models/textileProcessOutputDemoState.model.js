import mongoose from 'mongoose';

const textileProcessOutputDemoStateSchema = new mongoose.Schema({
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, unique: true, index: true },
    demoFgQtyPcs: { type: Number, default: 0, min: 0 },
    demoFgMeter: { type: Number, default: 0, min: 0 },
    itemName: { type: String, trim: true, default: 'KATHA SILK' },
    colour: { type: String, trim: true, default: 'BLUE' },
    fgItemName: { type: String, trim: true, default: 'FINISHED PRODUCT' },
    lastSeededAt: { type: Date, default: null },
    lastResetAt: { type: Date, default: null },
}, { timestamps: true });

const TextileProcessOutputDemoState = mongoose.model('TextileProcessOutputDemoState', textileProcessOutputDemoStateSchema);
export { TextileProcessOutputDemoState };
