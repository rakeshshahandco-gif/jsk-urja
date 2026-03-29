import PrdComponent from '../models/prdComponent.model.js';
import PrdAudit from '../models/prdAudit.model.js';
import { logPrdAudit } from '../utils/prdAuditLogger.js';

export const createPrdComponent = async (req, res) => {
    try {
        req.body.enteredBy = req.user.id;
        const component = await PrdComponent.create(req.body);
        
        await logPrdAudit(component._id, 'PrdComponent', 'Create', req.user.id, null, req.body, req.ip);
        
        // Populate enteredBy for response
        await component.populate('enteredBy', 'name');
        res.status(201).json(component);
    } catch (error) {
        console.error('Error in createPrdComponent:', error);
        res.status(400).json({ message: error.message });
    }
};

export const getPrdComponents = async (req, res) => {
    try {
        const { projectId } = req.query;
        let query = {};
        if (projectId) query.projectId = projectId;

        const components = await PrdComponent.find(query)
            .populate('enteredBy', 'name')
            .sort({ date: -1, createdAt: -1 });

        res.status(200).json(components);
    } catch (error) {
        console.error('Error in getPrdComponents:', error);
        res.status(400).json({ message: error.message });
    }
};

export const getPrdComponent = async (req, res) => {
    try {
        const component = await PrdComponent.findById(req.params.id)
            .populate('enteredBy', 'name');
            
        if (!component) {
            return res.status(404).json({ message: 'Component research record not found' });
        }
        res.status(200).json(component);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

export const updatePrdComponent = async (req, res) => {
    try {
        const component = await PrdComponent.findById(req.params.id);
        if (!component) return res.status(404).json({ message: 'Not found' });

        const oldData = component.toObject();
        
        Object.assign(component, req.body);
        await component.save();

        await logPrdAudit(component._id, 'PrdComponent', 'Update', req.user.id, oldData, req.body, req.ip);

        await component.populate('enteredBy', 'name');
        res.status(200).json(component);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

export const deletePrdComponent = async (req, res) => {
    try {
        const component = await PrdComponent.findById(req.params.id);
        if (!component) return res.status(404).json({ message: 'Not found' });

        await logPrdAudit(component._id, 'PrdComponent', 'Delete', req.user.id, component.toObject(), null, req.ip);
        
        await component.deleteOne();
        res.status(200).json({ message: 'Component deleted' });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};
