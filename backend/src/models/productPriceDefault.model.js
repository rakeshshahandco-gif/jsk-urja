import mongoose from 'mongoose';

const breakSchema = new mongoose.Schema({
    minQty: { type: Number, required: true, min: 0 },
    rate: { type: Number, required: true, min: 0 },
}, { _id: false });

const auditSchema = new mongoose.Schema({
    changedAt: { type: Date, default: Date.now },
    changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    changedByName: { type: String, default: '' },
    previousBreaks: { type: [breakSchema], default: [] },
    newBreaks: { type: [breakSchema], default: [] },
    sourcePriceListId: { type: mongoose.Schema.Types.ObjectId, ref: 'CustomerPriceList', default: null },
    sourcePriceListNo: { type: String, default: '' },
}, { _id: true });

const productPriceDefaultSchema = new mongoose.Schema({
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', required: true },
    currency: { type: String, default: 'INR', trim: true, uppercase: true },
    breaks: { type: [breakSchema], default: [] },
    sourcePriceListId: { type: mongoose.Schema.Types.ObjectId, ref: 'CustomerPriceList', default: null },
    sourcePriceListNo: { type: String, default: '' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedByName: { type: String, default: '' },
    audit: { type: [auditSchema], default: [] },
}, { timestamps: true });

productPriceDefaultSchema.index({ companyId: 1, itemId: 1, currency: 1 }, { unique: true });

export const ProductPriceDefault = mongoose.model('ProductPriceDefault', productPriceDefaultSchema);
