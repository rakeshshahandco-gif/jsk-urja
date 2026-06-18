import mongoose from 'mongoose';

const textileProcessOutputDemoAuditSchema = new mongoose.Schema({
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    date: { type: Date, default: Date.now },
    itemName: { type: String, trim: true, default: '' },
    colour: { type: String, trim: true, default: '' },
    qtyPcs: { type: Number, default: 0, min: 0 },
    meterQty: { type: Number, default: 0, min: 0 },
    sourceProcess: { type: String, trim: true, default: 'Dyeing' },
    transferMode: { type: String, enum: ['full', 'partial'], default: 'full' },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    userName: { type: String, trim: true, default: '' },
    isDemo: { type: Boolean, default: true, index: true },
    remarks: { type: String, trim: true, default: 'DEMO MODE — localhost testing only' },
}, { timestamps: true });

textileProcessOutputDemoAuditSchema.index({ companyId: 1, createdAt: -1 });

const TextileProcessOutputDemoAudit = mongoose.model('TextileProcessOutputDemoAudit', textileProcessOutputDemoAuditSchema);
export { TextileProcessOutputDemoAudit };
