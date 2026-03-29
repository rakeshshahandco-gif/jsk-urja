import mongoose from 'mongoose';
import PrdAudit from '../models/prdAudit.model.js';
import PrdProject from '../models/prdProject.model.js';

// Custom logic to get ALL audits connected to a specific Project (combining Designs, Exams, Issues, etc.)
export const getProjectAudits = async (req, res) => {
    try {
        const { projectId } = req.params;

        // Fetch the project to establish existence
        const project = await PrdProject.findById(projectId);
        if (!project) return res.status(404).json({ message: 'Project not found' });

        // Retrieve all entity IDs tied to this project from all relevant collections
        // To save complex recursive querying, we just query audits where entityType = PrdProject and entityId = projectId
        // OR we just fetch all children and get their IDs.
        
        // Simpler approach: We can just use the project ID for project level.
        // For full timeline, we query by a custom 'projectId' field IF we added it to Audit. 
        // We didn't, we only have entityId. But wait, `logPrdAudit` function does not take projectId.

        // So we will just query all documents that have projectId = projectId in their respective tables.
        const [
            components, designs, prototypes, tests, issues, changes, approvals
        ] = await Promise.all([
            mongoose.model('PrdComponent').find({ projectId }).select('_id'),
            mongoose.model('PrdDesign').find({ projectId }).select('_id'),
            mongoose.model('PrdPrototype').find({ projectId }).select('_id'),
            mongoose.model('PrdTestReport').find({ projectId }).select('_id'),
            mongoose.model('PrdIssue').find({ projectId }).select('_id'),
            mongoose.model('PrdChangeLog').find({ projectId }).select('_id'),
            mongoose.model('PrdApproval').find({ projectId }).select('_id'),
        ]);

        const allEntityIds = [
            projectId, // The project itself
            ...components.map(c => c._id),
            ...designs.map(d => d._id),
            ...prototypes.map(p => p._id),
            ...tests.map(t => t._id),
            ...issues.map(i => i._id),
            ...changes.map(c => c._id),
            ...approvals.map(a => a._id),
        ];

        const audits = await PrdAudit.find({ entityId: { $in: allEntityIds } })
            .populate('changedBy', 'name')
            .sort({ date: -1 })
            .limit(100); // Prevent massive payloads

        res.status(200).json(audits);
    } catch (error) {
        console.error('Audit Load Error:', error);
        res.status(400).json({ message: error.message });
    }
};

export const getSystemAudits = async (req, res) => {
    try {
        const audits = await PrdAudit.find({})
            .populate('changedBy', 'name')
            .sort({ date: -1 })
            .limit(200);

        res.status(200).json(audits);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};
