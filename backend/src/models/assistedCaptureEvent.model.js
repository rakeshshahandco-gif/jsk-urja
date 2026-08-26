import mongoose from 'mongoose';

const eventStatusValues = ['received', 'processing', 'completed', 'partially_completed', 'failed'];

const assistedCaptureEventSchema = new mongoose.Schema(
    {
        companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
        campaignId: { type: mongoose.Schema.Types.ObjectId, ref: 'SearchCampaign', required: true, index: true },
        queryId: { type: mongoose.Schema.Types.ObjectId, ref: 'SearchQuery', required: true, index: true },
        sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'AssistedCaptureSession', required: true, index: true },
        eventIdempotencyKey: { type: String, required: true, trim: true, maxlength: 200 },
        eventSequence: { type: Number, required: true, min: 1 },
        eventFingerprint: { type: String, required: true, trim: true, maxlength: 64 },
        status: { type: String, enum: eventStatusValues, default: 'received', index: true },
        visibleResultCount: { type: Number, default: 0 },
        submittedResultCount: { type: Number, default: 0 },
        acceptedCount: { type: Number, default: 0 },
        insertedCount: { type: Number, default: 0 },
        updatedExistingCount: { type: Number, default: 0 },
        rejectedCount: { type: Number, default: 0 },
        rawCaptureBatchId: { type: mongoose.Schema.Types.ObjectId, ref: 'RawCaptureBatch', default: null },
        requestFingerprint: { type: String, default: '', trim: true, maxlength: 64 },
        validationErrors: { type: [mongoose.Schema.Types.Mixed], default: [] },
        capturedAt: { type: Date, default: null },
        agentId: { type: String, default: '', trim: true, maxlength: 120 },
        agentVersion: { type: String, default: '', trim: true, maxlength: 80 },
        failureCode: { type: String, default: '', trim: true, maxlength: 80 },
        failureMessage: { type: String, default: '', trim: true, maxlength: 500 },
        createdByAgentId: { type: String, default: '', trim: true, maxlength: 120 },
    },
    { timestamps: true, collection: 'assisted_capture_events', autoCreate: false, autoIndex: false },
);

assistedCaptureEventSchema.index({ companyId: 1, sessionId: 1, eventIdempotencyKey: 1 }, { unique: true });
assistedCaptureEventSchema.index({ companyId: 1, sessionId: 1, eventSequence: 1 }, { unique: true });
assistedCaptureEventSchema.index({ companyId: 1, queryId: 1, createdAt: -1 });

const AssistedCaptureEvent = mongoose.models.AssistedCaptureEvent
    || mongoose.model('AssistedCaptureEvent', assistedCaptureEventSchema);

export { AssistedCaptureEvent, eventStatusValues as ASSISTED_CAPTURE_EVENT_STATUSES };
export default AssistedCaptureEvent;
