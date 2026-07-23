import mongoose from 'mongoose';

/**
 * Company-scoped WhatsApp number health metadata cache.
 * Never stores auth/session/QR/media/binary.
 */
const whatsappBulkNumberHealthSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    normalizedNumber: { type: String, required: true, index: true },
    originalNumberSample: { type: String, default: '' },
    countryCode: { type: String, default: '' },
    nationalNumber: { type: String, default: '' },
    validationStatus: { type: String, default: 'NOT_CHECKED', index: true },
    reasonCode: { type: String, default: '' },
    validationReason: { type: String, default: '' },
    availabilityStatus: { type: String, default: 'NOT_CHECKED', index: true },
    checkedAt: { type: Date, default: null, index: true },
    cacheExpiresAt: { type: Date, default: null },
    checkSource: { type: String, default: '' },
    errorCode: { type: String, default: '' },
    duplicateCount: { type: Number, default: 0 },
    blacklisted: { type: Boolean, default: false },
    optedOut: { type: Boolean, default: false },
    riskLevel: { type: String, default: 'UNKNOWN', index: true },
    riskMeta: { type: mongoose.Schema.Types.Mixed, default: null },
    lastCampaignId: { type: mongoose.Schema.Types.ObjectId, ref: 'WhatsAppBulkCampaign', default: null },
    lastDeliveryStatus: { type: String, default: '' },
    lastReplyStatus: { type: String, default: '' },
    displayName: { type: String, default: '' },
    sourceType: { type: String, default: '' },
    sourceRef: { type: String, default: '' },
    eligible: { type: Boolean, default: false },
    checkedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    validationVersion: { type: Number, default: 1 },
  },
  { timestamps: true },
);

whatsappBulkNumberHealthSchema.index({ companyId: 1, normalizedNumber: 1 }, { unique: true });
whatsappBulkNumberHealthSchema.index({ companyId: 1, riskLevel: 1, checkedAt: -1 });

const WhatsAppBulkNumberHealth =
  mongoose.models.WhatsAppBulkNumberHealth ||
  mongoose.model('WhatsAppBulkNumberHealth', whatsappBulkNumberHealthSchema);

export default WhatsAppBulkNumberHealth;
