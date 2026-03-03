import mongoose from 'mongoose';

const supplierSchema = new mongoose.Schema({
    supplierCode: { type: String, unique: true, trim: true, uppercase: true },
    supplierName: { type: String, required: true, trim: true },
    contactPerson: { type: String, trim: true, default: '' },
    phone: { type: String, trim: true, default: '' },
    email: { type: String, trim: true, lowercase: true, default: '' },
    address: { type: String, trim: true, default: '' },
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
    remarks: { type: String, trim: true, default: '' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

supplierSchema.index({ supplierName: 'text', supplierCode: 'text' });

const Supplier = mongoose.model('Supplier', supplierSchema);
export { Supplier };
