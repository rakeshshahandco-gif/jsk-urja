import mongoose from 'mongoose';

/**
 * LeadActivity - append-only audit/history log for a Lead.
 * Used to show "Customer asked for product X, catalog shared, status changed"
 * style timeline in the Lead detail page and the Follow-up screen.
 */
const leadActivitySchema = new mongoose.Schema(
    {
        leadId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Lead',
            required: true,
            index: true,
        },
        type: {
            type: String,
            enum: [
                'created',
                'message_saved',
                'converted',
                'product_selected',
                'asset_shared',
                'status_changed',
                'followup_scheduled',
                'note_added',
                'assigned',
            ],
            required: true,
        },
        payload: { type: mongoose.Schema.Types.Mixed, default: {} },
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        at: { type: Date, default: Date.now },
    },
    { timestamps: false },
);

leadActivitySchema.index({ companyId: 1, leadId: 1, at: -1 });

const LeadActivity = mongoose.model('LeadActivity', leadActivitySchema);
export { LeadActivity };
export default LeadActivity;
