import PrdChangeLog from '../models/prdChangeLog.model.js';
import { logPrdAudit } from '../utils/prdAuditLogger.js';

export const createChangeLog = async (req, res) => {
    try {
        req.body.requestedBy = req.user.id; // Initially requested by the active session user

        if (req.files && req.files.length > 0) {
            req.body.attachments = req.files.map(file => ({
                filename: file.originalname,
                url: `/uploads/prd/${file.filename}`,
                mimetype: file.mimetype,
                size: file.size
            }));
        }

        const change = await PrdChangeLog.create(req.body);
        
        await logPrdAudit(change._id, 'PrdChangeLog', 'Create', req.user.id, null, req.body, req.ip);
        
        await change.populate('requestedBy changedBy approvedBy testRef', 'name revisionNo testDate');
        res.status(201).json(change);
    } catch (error) {
        console.error('Error in createChangeLog:', error);
        res.status(400).json({ message: error.message });
    }
};

export const getChangeLogs = async (req, res) => {
    try {
        const { projectId } = req.query;
        let query = {};
        if (projectId) query.projectId = projectId;

        const changes = await PrdChangeLog.find(query)
            .populate('requestedBy changedBy approvedBy', 'name')
            .populate('testRef', 'testDate testStatus testType')
            .sort({ changeDate: -1, createdAt: -1 });

        res.status(200).json(changes);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

export const getChangeLog = async (req, res) => {
    try {
        const change = await PrdChangeLog.findById(req.params.id)
            .populate('requestedBy changedBy approvedBy', 'name')
            .populate('testRef');
            
        if (!change) return res.status(404).json({ message: 'Not found' });
        res.status(200).json(change);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

export const updateChangeLog = async (req, res) => {
    try {
        const change = await PrdChangeLog.findById(req.params.id);
        if (!change) return res.status(404).json({ message: 'Not found' });

        const oldData = change.toObject();

        if (req.files && req.files.length > 0) {
            const newAttachments = req.files.map(file => ({
                filename: file.originalname,
                url: `/uploads/prd/${file.filename}`,
                mimetype: file.mimetype,
                size: file.size
            }));
            req.body.attachments = [...(change.attachments || []), ...newAttachments];
        }

        Object.assign(change, req.body);
        await change.save();

        await logPrdAudit(change._id, 'PrdChangeLog', 'Update', req.user.id, oldData, req.body, req.ip);

        await change.populate('requestedBy changedBy approvedBy testRef', 'name testStatus');
        res.status(200).json(change);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

export const deleteChangeLog = async (req, res) => {
    try {
        const change = await PrdChangeLog.findById(req.params.id);
        if (!change) return res.status(404).json({ message: 'Not found' });

        await logPrdAudit(change._id, 'PrdChangeLog', 'Delete', req.user.id, change.toObject(), null, req.ip);
        
        await change.deleteOne();
        res.status(200).json({ message: 'Change log deleted' });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};
