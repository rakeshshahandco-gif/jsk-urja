import PrdPrototype from '../models/prdPrototype.model.js';
import { logPrdAudit } from '../utils/prdAuditLogger.js';

export const createPrdPrototype = async (req, res) => {
    try {
        req.body.assembledBy = req.user.id;
        
        const prototype = await PrdPrototype.create(req.body);
        await logPrdAudit(prototype._id, 'PrdPrototype', 'Create', req.user.id, null, req.body, req.ip);
        
        await prototype.populate('assembledBy', 'name');
        res.status(201).json(prototype);
    } catch (error) {
        console.error('Error in createPrdPrototype:', error);
        res.status(400).json({ message: error.message });
    }
};

export const getPrdPrototypes = async (req, res) => {
    try {
        const { projectId } = req.query;
        let query = {};
        if (projectId) query.projectId = projectId;

        const prototypes = await PrdPrototype.find(query)
            .populate('assembledBy', 'name')
            .sort({ buildDate: -1, createdAt: -1 });

        res.status(200).json(prototypes);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

export const updatePrdPrototype = async (req, res) => {
    try {
        const prototype = await PrdPrototype.findById(req.params.id);
        if (!prototype) return res.status(404).json({ message: 'Not found' });

        const oldData = prototype.toObject();

        Object.assign(prototype, req.body);
        await prototype.save();

        await logPrdAudit(prototype._id, 'PrdPrototype', 'Update', req.user.id, oldData, req.body, req.ip);

        await prototype.populate('assembledBy', 'name');
        res.status(200).json(prototype);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

export const deletePrdPrototype = async (req, res) => {
    try {
        const prototype = await PrdPrototype.findById(req.params.id);
        if (!prototype) return res.status(404).json({ message: 'Not found' });

        await logPrdAudit(prototype._id, 'PrdPrototype', 'Delete', req.user.id, prototype.toObject(), null, req.ip);
        
        await prototype.deleteOne();
        res.status(200).json({ message: 'Prototype deleted' });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};
