import mongoose from 'mongoose';

const supplierSchema = new mongoose.Schema({
    supplierCode: { type: String, unique: true, trim: true, uppercase: true },
    supplierName: { type: String, required: true, trim: true },
    contactPerson: { type: String, trim: true, default: '' },
    phone: { type: String, trim: true, default: '' },
    whatsApp: { type: String, trim: true, default: '' },
    email: { type: String, trim: true, lowercase: true, default: '' },
    address: { type: String, trim: true, default: '' },
    area: { type: String, trim: true, default: '' },
    city: { type: String, trim: true, default: '' },
    state: { type: String, trim: true, default: '' },
    pincode: { type: String, trim: true, default: '' },
    country: { type: String, trim: true, default: 'India' },
    gstNumber: { type: String, trim: true, uppercase: true, default: '' },
    gstType: { type: String, enum: ['CGST / SGST', 'IGST', ''], default: '' },
    panNumber: { type: String, trim: true, uppercase: true, default: '' },
    paymentTerms: { type: String, trim: true, default: '' },
    bankName: { type: String, trim: true, default: '' },
    bankAccountNo: { type: String, trim: true, default: '' },
    bankIfsc: { type: String, trim: true, uppercase: true, default: '' },
    isActive: { type: Boolean, default: true },
    openingBalance: { type: Number, default: 0 },
    openingBalanceDrCr: { type: String, enum: ['Dr', 'Cr'], default: 'Cr' },
    remarks: { type: String, trim: true, default: '' },
    // 🛡️ Soft-delete fields — supplier data is NEVER hard-deleted
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

supplierSchema.index({ supplierName: 'text', supplierCode: 'text' });

/**
 * 🛡️  SAFETY HOOK: Block isDeleted from being set via findOneAndUpdate / updateMany
 */
const _stripIsDeletedFromUpdate = function (next) {
    const update = this.getUpdate();
    if (!update) return next();
    if (update.$set && update.$set.isDeleted !== undefined) delete update.$set.isDeleted;
    if (update.isDeleted !== undefined) delete update.isDeleted;
    next();
};
supplierSchema.pre('findOneAndUpdate', _stripIsDeletedFromUpdate);
supplierSchema.pre('updateOne', _stripIsDeletedFromUpdate);
supplierSchema.pre('updateMany', _stripIsDeletedFromUpdate);
supplierSchema.pre('findByIdAndUpdate', _stripIsDeletedFromUpdate);

const Supplier = mongoose.model('Supplier', supplierSchema);
export { Supplier };
