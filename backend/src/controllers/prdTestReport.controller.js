import PrdTestReport from '../models/prdTestReport.model.js';
import PrdPrototype from '../models/prdPrototype.model.js';
import { logPrdAudit } from '../utils/prdAuditLogger.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';

export const createTestReport = asyncHandler(async (req, res) => {
    req.body.testedBy = req.user.id;

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
    
    res.status(201).json(new ApiResponse(201, report, 'Test report created successfully'));
});

export const getTestReports = asyncHandler(async (req, res) => {
    const { projectId } = req.query;
    let query = {};
    if (projectId) query.projectId = projectId;

    const reports = await PrdTestReport.find(query)
        .populate('testedBy verifiedBy', 'name')
        .populate('prototypeId', 'revisionNo sampleType firmwareVersion pcbVersion')
        .sort({ testDate: -1, createdAt: -1 });

    res.status(200).json(new ApiResponse(200, reports, 'Test reports fetched successfully'));
});

export const getTestReport = asyncHandler(async (req, res) => {
    const report = await PrdTestReport.findById(req.params.id)
        .populate('testedBy verifiedBy', 'name')
        .populate('prototypeId')
        .populate('details.parameterId');

    if (!report) throw new ApiError(404, 'Test report not found');
    res.status(200).json(new ApiResponse(200, report, 'Test report fetched successfully'));
});

export const updateTestReport = asyncHandler(async (req, res) => {
    const report = await PrdTestReport.findById(req.params.id);
    if (!report) throw new ApiError(404, 'Test report not found');

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
    res.status(200).json(new ApiResponse(200, report, 'Test report updated successfully'));
});

export const deleteTestReport = asyncHandler(async (req, res) => {
    const report = await PrdTestReport.findById(req.params.id);
    if (!report) throw new ApiError(404, 'Test report not found');

    await logPrdAudit(report._id, 'PrdTestReport', 'Delete', req.user.id, report.toObject(), null, req.ip);
    
    await report.deleteOne();
    res.status(200).json(new ApiResponse(200, null, 'Test report deleted successfully'));
});
