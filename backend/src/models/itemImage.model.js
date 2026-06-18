import mongoose from 'mongoose';
import { ITEM_IMAGE_TYPES } from '../constants/itemImage.constants.js';

const itemImageSchema = new mongoose.Schema(
    {
        companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', default: null },
        itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', required: true },
        imageType: {
            type: String,
            required: true,
            enum: ITEM_IMAGE_TYPES,
        },
        fileName: { type: String, required: true, trim: true },
        originalName: { type: String, trim: true, default: '' },
        fileType: { type: String, trim: true, default: '' },
        imageUrl: { type: String, required: true, trim: true },
        thumbnailUrl: { type: String, trim: true, default: '' },
        fileSize: { type: Number, default: 0 },
        source: {
            type: String,
            enum: ['upload', 'mobile_scan', 'replace'],
            default: 'upload',
        },
        uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        isDeleted: { type: Boolean, default: false },
    },
    { timestamps: true },
);

itemImageSchema.index({ itemId: 1, imageType: 1, isDeleted: 1 });
itemImageSchema.index({ companyId: 1, itemId: 1, isDeleted: 1 });

const ItemImage = mongoose.model('ItemImage', itemImageSchema);
export default ItemImage;
