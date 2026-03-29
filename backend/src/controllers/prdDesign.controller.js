import PrdDesign from '../models/prdDesign.model.js';
import { logPrdAudit } from '../utils/prdAuditLogger.js';

export const createPrdDesign = async (req, res) => {
    try {
        req.body.changedBy = req.user.id;
        
        if (req.files && req.files.length > 0) {
            req.body.attachments = req.files.map(file => ({
                filename: file.originalname,
                url: `/uploads/prd/${file.filename}`,
                mimetype: file.mimetype,
                size: file.size
            }));
        }

        const design = await PrdDesign.create(req.body);
        await logPrdAudit(design._id, 'PrdDesign', 'Create', req.user.id, null, req.body, req.ip);
        
        await design.populate([{ path: 'changedBy', select: 'name' }, { path: 'checkedBy', select: 'name' }]);
        res.status(201).json(design);
    } catch (error) {
        console.error('Error in createPrdDesign:', error);
        res.status(400).json({ message: error.message });
    }
};

export const getPrdDesigns = async (req, res) => {
    try {
        const { projectId } = req.query;
        let query = {};
        if (projectId) query.projectId = projectId;

        const designs = await PrdDesign.find(query)
            .populate('changedBy checkedBy approvedBy', 'name')
            .sort({ date: -1, createdAt: -1 });

        res.status(200).json(designs);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

export const updatePrdDesign = async (req, res) => {
    try {
        const design = await PrdDesign.findById(req.params.id);
        if (!design) return res.status(404).json({ message: 'Not found' });

        const oldData = design.toObject();

        if (req.files && req.files.length > 0) {
            const newAttachments = req.files.map(file => ({
                filename: file.originalname,
                url: `/uploads/prd/${file.filename}`,
                mimetype: file.mimetype,
                size: file.size
            }));
            req.body.attachments = [...(design.attachments || []), ...newAttachments];
        }

        Object.assign(design, req.body);
        await design.save();

        await logPrdAudit(design._id, 'PrdDesign', 'Update', req.user.id, oldData, req.body, req.ip);

        await design.populate('changedBy checkedBy approvedBy', 'name');
        res.status(200).json(design);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

export const deletePrdDesign = async (req, res) => {
    try {
        const design = await PrdDesign.findById(req.params.id);
        if (!design) return res.status(404).json({ message: 'Not found' });

        await logPrdAudit(design._id, 'PrdDesign', 'Delete', req.user.id, design.toObject(), null, req.ip);
        
        await design.deleteOne();
        res.status(200).json({ message: 'Design deleted' });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};
