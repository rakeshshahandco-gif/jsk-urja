import PrdTestReport from '../models/prdTestReport.model.js';
import PrdPrototype from '../models/prdPrototype.model.js';
import { logPrdAudit } from '../utils/prdAuditLogger.js';

export const createTestReport = async (req, res) => {
    try {
        req.body.testedBy = req.user.id;

        // Auto-calculate passed/failed based on child readings vs passing logic would go here.
        // For now, trusting client logic + server-side baseline.

        if (req.files && req.files.length > 0) {
            req.body.attachments = req.files.map(file => ({
                filename: file.originalname,
                url: `/uploads/prd/${file.filename}`,
                mimetype: file.mimetype,
                size: file.size
            }));
        }

        const report = await PrdTestReport.create(req.body);
        
        // Auto-update Prototype status
        if (req.body.prototypeId) {
            const proto = await PrdPrototype.findById(req.body.prototypeId);
            if (proto) {
                proto.status = req.body.testStatus === 'Pass' ? 'Tested - Pass' : 'Tested - Fail';
                await proto.save();
            }
        }

        await logPrdAudit(report._id, 'PrdTestReport', 'Create', req.user.id, null, req.body, req.ip);
        
        await report.populate([
            { path: 'testedBy', select: 'name' },
            { path: 'prototypeId', select: 'revisionNo status' },
            { path: 'details.parameterId', select: 'parameterName unit upperLimit lowerLimit inputType isMandatory' }
        ]);
        
        res.status(201).json(report);
    } catch (error) {
        console.error('Error in createTestReport:', error);
        res.status(400).json({ message: error.message });
    }
};

export const getTestReports = async (req, res) => {
    try {
        const { projectId } = req.query;
        let query = {};
        if (projectId) query.projectId = projectId;

        const reports = await PrdTestReport.find(query)
            .populate('testedBy verifiedBy', 'name')
            .populate('prototypeId', 'revisionNo sampleType firmwareVersion pcbVersion')
            .sort({ testDate: -1, createdAt: -1 });

        res.status(200).json(reports);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

export const getTestReport = async (req, res) => {
    try {
        const report = await PrdTestReport.findById(req.params.id)
            .populate('testedBy verifiedBy', 'name')
            .populate('prototypeId')
            .populate('details.parameterId');

        if (!report) return res.status(404).json({ message: 'Not found' });
        res.status(200).json(report);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

export const updateTestReport = async (req, res) => {
    try {
        const report = await PrdTestReport.findById(req.params.id);
        if (!report) return res.status(404).json({ message: 'Not found' });

        const oldData = report.toObject();

        if (req.files && req.files.length > 0) {
            const newAttachments = req.files.map(file => ({
                filename: file.originalname,
                url: `/uploads/prd/${file.filename}`,
                mimetype: file.mimetype,
                size: file.size
            }));
            req.body.attachments = [...(report.attachments || []), ...newAttachments];
        }

        Object.assign(report, req.body);
        await report.save();

        await logPrdAudit(report._id, 'PrdTestReport', 'Update', req.user.id, oldData, req.body, req.ip);

        // Update prototype status linked logic
        if (report.prototypeId) {
            const proto = await PrdPrototype.findById(report.prototypeId);
            if (proto) {
                proto.status = report.testStatus === 'Pass' ? 'Tested - Pass' : 'Tested - Fail';
                await proto.save();
            }
        }

        await report.populate('testedBy verifiedBy', 'name');
        res.status(200).json(report);
    } catch (error) {
        console.error('Update test error:', error);
        res.status(400).json({ message: error.message });
    }
};

export const deleteTestReport = async (req, res) => {
    try {
        const report = await PrdTestReport.findById(req.params.id);
        if (!report) return res.status(404).json({ message: 'Not found' });

        await logPrdAudit(report._id, 'PrdTestReport', 'Delete', req.user.id, report.toObject(), null, req.ip);
        
        await report.deleteOne();
        res.status(200).json({ message: 'Test report deleted' });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};
