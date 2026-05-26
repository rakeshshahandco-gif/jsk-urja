import mongoose from 'mongoose';

/**
 * ProductCatalog - Sales/marketing catalog of products available for sharing
 * to leads via WhatsApp. Intentionally decoupled from the Item (inventory)
 * model: linking to an Item is optional and read-only. This keeps the
 * inventory / sales / GST / stock flows completely untouched.
 *
 * Tenant scoping is added automatically by the global tenantSchemaPlugin
 * (see backend/src/config/db.js).
 */
const productCatalogSchema = new mongoose.Schema(
    {
        name: { type: String, required: true, trim: true },
        code: { type: String, required: true, trim: true },
        category: { type: String, trim: true, default: '' },

        shortDescription: { type: String, trim: true, default: '' },
        detailedDescription: { type: String, trim: true, default: '' },

        technicalSpecs: { type: mongoose.Schema.Types.Mixed, default: {} },

        imageUrl: { type: String, trim: true, default: '' },
        catalogPdfUrl: { type: String, trim: true, default: '' },
        datasheetPdfUrl: { type: String, trim: true, default: '' },
        brochureUrl: { type: String, trim: true, default: '' },
        videoUrl: { type: String, trim: true, default: '' },

        linkedItemId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Item',
            default: null,
        },

        isActive: { type: Boolean, default: true },

        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    },
    { timestamps: true },
);

productCatalogSchema.index({ companyId: 1, code: 1 }, { unique: true });
productCatalogSchema.index({ companyId: 1, isActive: 1 });
productCatalogSchema.index({ name: 'text', code: 'text', category: 'text' });

const ProductCatalog = mongoose.model('ProductCatalog', productCatalogSchema);
export { ProductCatalog };
export default ProductCatalog;
