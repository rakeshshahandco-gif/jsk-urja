import PrdIssue from '../models/prdIssue.model.js';
import { logPrdAudit } from '../utils/prdAuditLogger.js';

export const createIssue = async (req, res) => {
    try {
        req.body.foundBy = req.user.id;

        if (req.files && req.files.length > 0) {
            req.body.attachments = req.files.map(file => ({
                filename: file.originalname,
                url: `/uploads/prd/${file.filename}`,
                mimetype: file.mimetype,
                size: file.size
            }));
        }

        const issue = await PrdIssue.create(req.body);
        
        await logPrdAudit(issue._id, 'PrdIssue', 'Create', req.user.id, null, req.body, req.ip);
        
        await issue.populate('foundBy assignedTo', 'name');
        res.status(201).json(issue);
    } catch (error) {
        console.error('Error in createIssue:', error);
        res.status(400).json({ message: error.message });
    }
};

export const getIssues = async (req, res) => {
    try {
        const { projectId } = req.query;
        let query = {};
        if (projectId) query.projectId = projectId;

        const issues = await PrdIssue.find(query)
            .populate('foundBy assignedTo', 'name')
            .sort({ date: -1, createdAt: -1 });

        res.status(200).json(issues);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

export const getIssue = async (req, res) => {
    try {
        const issue = await PrdIssue.findById(req.params.id)
            .populate('foundBy assignedTo', 'name');
        if (!issue) return res.status(404).json({ message: 'Not found' });
        res.status(200).json(issue);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

export const updateIssue = async (req, res) => {
    try {
        const issue = await PrdIssue.findById(req.params.id);
        if (!issue) return res.status(404).json({ message: 'Not found' });

        const oldData = issue.toObject();

        if (req.files && req.files.length > 0) {
            const newAttachments = req.files.map(file => ({
                filename: file.originalname,
                url: `/uploads/prd/${file.filename}`,
                mimetype: file.mimetype,
                size: file.size
            }));
            req.body.attachments = [...(issue.attachments || []), ...newAttachments];
        }

        Object.assign(issue, req.body);
        await issue.save();

        await logPrdAudit(issue._id, 'PrdIssue', 'Update', req.user.id, oldData, req.body, req.ip);

        await issue.populate('foundBy assignedTo', 'name');
        res.status(200).json(issue);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

export const deleteIssue = async (req, res) => {
    try {
        const issue = await PrdIssue.findById(req.params.id);
        if (!issue) return res.status(404).json({ message: 'Not found' });

        await logPrdAudit(issue._id, 'PrdIssue', 'Delete', req.user.id, issue.toObject(), null, req.ip);
        
        await issue.deleteOne();
        res.status(200).json({ message: 'Issue deleted' });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};
