import mongoose from 'mongoose';

const prdAuditSchema = new mongoose.Schema(
    {
        entityId: {
            type: mongoose.Schema.Types.ObjectId,
            required: true
        },
        entityType: {
            type: String,
            required: true,
            enum: [
                'PrdProject',
                'PrdComponent',
                'PrdDesign',
                'PrdPrototype',
                'PrdTestReport',
                'PrdChangeLog',
                'PrdIssue',
                'PrdApproval'
            ]
        },
        action: {
            type: String,
            required: true,
            enum: ['Create', 'Update', 'Delete', 'StatusChange', 'SoftDelete']
        },
        changedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true
        },
        date: {
            type: Date,
            default: Date.now
        },
        changes: [{
            field: String,
            oldValue: String,
            newValue: String
        }],
        reason: {
            type: String
        },
        ipAddress: {
            type: String
        }
    },
    {
        timestamps: true
    }
);

// Index for fast lookups by project or document
prdAuditSchema.index({ entityId: 1, entityType: 1 });
prdAuditSchema.index({ date: -1 });

export const PrdAudit = mongoose.model('PrdAudit', prdAuditSchema);
export default PrdAudit;
