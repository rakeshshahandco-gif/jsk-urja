import httpStatus from 'http-status';
import { ApiError } from '../utils/ApiError.js';
import { WorkflowProductionLot } from '../models/workflowProductionLot.model.js';
import { Company } from '../models/company.model.js';
import { Item } from '../models/item.model.js';
import { WorkflowMaster } from '../models/workflowMaster.model.js';
import { buildWorkflowVersion } from './companyWorkflowAssignment.service.js';

function pushAudit(lot, action, userId, stageIndex, stageName, details = {}) {
    lot.auditLog.push({
        action,
        stageIndex,
        stageName: stageName || '',
        details,
        performedBy: userId,
        performedAt: new Date(),
    });
}

async function generateLotNo() {
    const prefix = `WFP-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`;
    const count = await WorkflowProductionLot.countDocuments({ lotNo: new RegExp(`^${prefix}`) });
    return `${prefix}-${String(count + 1).padStart(4, '0')}`;
}

async function resolveWorkflowForCompany(companyId) {
    const company = await Company.findById(companyId).lean();
    if (!company) throw new ApiError(httpStatus.NOT_FOUND, 'Company not found');

    let workflow = null;
    if (company.activeWorkflow && company.assignedWorkflowRef) {
        workflow = await WorkflowMaster.findById(company.assignedWorkflowRef).lean();
    }
    if (!workflow && company.industryTemplateRef) {
        workflow = await WorkflowMaster.findOne({
            industryTemplateRef: company.industryTemplateRef,
            isActive: true,
        })
            .sort({ updatedAt: -1 })
            .lean();
    }

    return { company, workflow };
}

function buildStageStates(workflowStages = []) {
    return (workflowStages || [])
        .slice()
        .sort((a, b) => (a.sequenceNo || 0) - (b.sequenceNo || 0))
        .map((s, idx) => ({
            stageKey: String(s._id || `seq-${idx + 1}`),
            stageName: s.stageName,
            sequenceNo: s.sequenceNo || idx + 1,
            stageType: s.stageType || 'general',
            allowStart: s.allowStart !== false,
            allowComplete: s.allowComplete !== false,
            allowSkip: !!s.allowSkip,
            remarksRequired: !!s.remarksRequired,
            attachmentRequired: !!s.attachmentRequired,
            status: 'pending',
            qtyStarted: 0,
            qtyCompleted: 0,
            pendingQty: 0,
            remarks: '',
            attachmentUrl: '',
            attachmentName: '',
        }));
}

function recomputeLotTotals(lot) {
    lot.pendingQty = Math.max(0, Number(lot.qtyStarted || 0) - Number(lot.qtyCompleted || 0));
}

function getCarryForwardQty(lot, stageIndex) {
    if (stageIndex === 0) return Number(lot.qtyStarted || 0);
    const prev = lot.stages[stageIndex - 1];
    if (!prev) return 0;
    if (prev.status === 'completed') return Number(prev.qtyCompleted || 0);
    if (prev.status === 'skipped') return Number(prev.qtyStarted || 0);
    return 0;
}

function assertCurrentStage(lot, stageIndex) {
    if (stageIndex !== lot.currentStageIndex) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Action allowed only on the current workflow stage');
    }
    const stage = lot.stages[stageIndex];
    if (!stage) throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid stage index');
    return stage;
}

export async function getWorkflowPreviewForCompany(companyId) {
    const { company, workflow } = await resolveWorkflowForCompany(companyId);
    return {
        companyId: company._id,
        companyName: company.companyName,
        activeWorkflow: !!company.activeWorkflow,
        assignedWorkflowRef: company.assignedWorkflowRef,
        workflow: workflow
            ? {
                _id: workflow._id,
                workflowName: workflow.workflowName,
                workflowCode: workflow.workflowCode,
                description: workflow.description,
                isActive: workflow.isActive,
                stages: buildStageStates(workflow.stages),
            }
            : null,
        warnings: !company.activeWorkflow ? ['no_active_workflow_assignment'] : (!workflow ? ['workflow_not_found'] : []),
    };
}

export async function listWorkflowProductionLots({ companyId, lotStatus, search, limit = 100 } = {}) {
    const filter = { isDeleted: false };
    if (companyId) filter.companyId = companyId;
    if (lotStatus) filter.lotStatus = lotStatus;
    if (search) {
        filter.$or = [
            { lotNo: new RegExp(search, 'i') },
            { batchNo: new RegExp(search, 'i') },
            { itemName: new RegExp(search, 'i') },
        ];
    }
    return WorkflowProductionLot.find(filter)
        .sort({ createdAt: -1 })
        .limit(limit)
        .populate('itemId', 'itemCode itemName')
        .populate('createdBy', 'name email')
        .lean();
}

export async function getWorkflowProductionLotById(id) {
    const lot = await WorkflowProductionLot.findOne({ _id: id, isDeleted: false })
        .populate('itemId', 'itemCode itemName')
        .populate('createdBy', 'name email')
        .populate('stages.startedBy', 'name email')
        .populate('stages.completedBy', 'name email');
    if (!lot) throw new ApiError(httpStatus.NOT_FOUND, 'Production lot not found');
    return lot;
}

export async function createWorkflowProductionLot(payload, userId) {
    const { companyId, itemId, qtyStarted, batchNo, financialYearId, lotNo: customLotNo } = payload;
    if (!companyId) throw new ApiError(httpStatus.BAD_REQUEST, 'companyId is required');
    if (!itemId) throw new ApiError(httpStatus.BAD_REQUEST, 'itemId is required');
    if (!qtyStarted || Number(qtyStarted) <= 0) throw new ApiError(httpStatus.BAD_REQUEST, 'qtyStarted must be greater than zero');

    const { company, workflow } = await resolveWorkflowForCompany(companyId);
    if (!company.activeWorkflow || !company.assignedWorkflowRef) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Company has no active workflow assignment. Configure in Company Profile.');
    }
    if (!workflow || !workflow.isActive) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Assigned workflow not found or inactive');
    }
    if (!workflow.stages?.length) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Workflow has no stages defined');
    }

    const item = await Item.findById(itemId).lean();
    if (!item || item.isDeleted) throw new ApiError(httpStatus.BAD_REQUEST, 'Item not found');

    const lotNo = customLotNo ? String(customLotNo).trim().toUpperCase() : await generateLotNo();
    const stages = buildStageStates(workflow.stages);
    const qty = Number(qtyStarted);

    const lot = await WorkflowProductionLot.create({
        lotNo,
        batchNo: batchNo || lotNo,
        companyId,
        financialYearId: financialYearId || null,
        itemId: item._id,
        itemCode: item.itemCode || '',
        itemName: item.itemName || item.name || '',
        qtyStarted: qty,
        qtyCompleted: 0,
        pendingQty: qty,
        assignedWorkflowRef: workflow._id,
        workflowVersion: buildWorkflowVersion(workflow),
        workflowName: workflow.workflowName,
        workflowCode: workflow.workflowCode,
        currentStageIndex: 0,
        lotStatus: 'draft',
        stages,
        createdBy: userId,
        updatedBy: userId,
    });

    pushAudit(lot, 'lot_created', userId, null, '', { lotNo, qtyStarted: qty, workflowName: workflow.workflowName });
    await lot.save();
    return lot;
}

export async function startWorkflowProductionStage(lotId, stageIndex, { qtyStarted, remarks }, userId) {
    const lot = await getWorkflowProductionLotById(lotId);
    const idx = Number(stageIndex);
    const stage = assertCurrentStage(lot, idx);

    if (!stage.allowStart) throw new ApiError(httpStatus.BAD_REQUEST, 'This stage does not allow start');
    if (stage.status !== 'pending') throw new ApiError(httpStatus.BAD_REQUEST, 'Stage is not pending');

    const carry = getCarryForwardQty(lot, idx);
    const qty = qtyStarted != null && qtyStarted !== '' ? Number(qtyStarted) : carry;
    if (qty <= 0) throw new ApiError(httpStatus.BAD_REQUEST, 'Qty started must be greater than zero');
    if (idx === 0 && qty > Number(lot.qtyStarted)) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Cannot start more than lot qty started');
    }
    if (idx > 0 && qty > carry) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Cannot start more than carried forward qty from previous stage');
    }

    stage.status = 'started';
    stage.qtyStarted = qty;
    stage.pendingQty = qty;
    stage.startedAt = new Date();
    stage.startedBy = userId;
    if (remarks) stage.remarks = remarks;

    lot.lotStatus = 'in_progress';
    lot.updatedBy = userId;
    recomputeLotTotals(lot);
    pushAudit(lot, 'stage_started', userId, idx, stage.stageName, { qtyStarted: qty, remarks: remarks || '' });
    await lot.save();
    return lot;
}

export async function completeWorkflowProductionStage(lotId, stageIndex, { qtyCompleted, remarks, attachmentUrl, attachmentName }, userId) {
    const lot = await getWorkflowProductionLotById(lotId);
    const idx = Number(stageIndex);
    const stage = assertCurrentStage(lot, idx);

    if (!stage.allowComplete) throw new ApiError(httpStatus.BAD_REQUEST, 'This stage does not allow complete');
    if (stage.status !== 'started') throw new ApiError(httpStatus.BAD_REQUEST, 'Stage must be started before completion');

    const qty = Number(qtyCompleted);
    if (!qty || qty <= 0) throw new ApiError(httpStatus.BAD_REQUEST, 'Qty completed must be greater than zero');
    if (qty > Number(stage.qtyStarted || 0)) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Cannot complete more than started qty for this stage');
    }
    if (stage.remarksRequired && !String(remarks || stage.remarks || '').trim()) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Remarks are required for this stage');
    }
    if (stage.attachmentRequired && !attachmentUrl && !stage.attachmentUrl) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Attachment is required for this stage');
    }

    stage.status = 'completed';
    stage.qtyCompleted = qty;
    stage.pendingQty = Math.max(0, Number(stage.qtyStarted || 0) - qty);
    stage.completedAt = new Date();
    stage.completedBy = userId;
    if (remarks !== undefined) stage.remarks = remarks || '';
    if (attachmentUrl) {
        stage.attachmentUrl = attachmentUrl;
        stage.attachmentName = attachmentName || '';
    }

    const isLast = idx >= lot.stages.length - 1;
    if (isLast) {
        lot.qtyCompleted = qty;
        lot.lotStatus = 'completed';
        lot.currentStageIndex = idx;
    } else {
        lot.currentStageIndex = idx + 1;
    }

    lot.updatedBy = userId;
    recomputeLotTotals(lot);
    pushAudit(lot, 'stage_completed', userId, idx, stage.stageName, {
        qtyCompleted: qty,
        remarks: stage.remarks,
        movedToStage: isLast ? null : lot.stages[lot.currentStageIndex]?.stageName,
    });
    await lot.save();
    return lot;
}

export async function skipWorkflowProductionStage(lotId, stageIndex, { remarks }, userId) {
    const lot = await getWorkflowProductionLotById(lotId);
    const idx = Number(stageIndex);
    const stage = assertCurrentStage(lot, idx);

    if (!stage.allowSkip) throw new ApiError(httpStatus.BAD_REQUEST, 'This stage does not allow skip');
    if (!['pending', 'started'].includes(stage.status)) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Stage cannot be skipped in current status');
    }

    if (stage.status === 'pending') {
        const carry = getCarryForwardQty(lot, idx);
        stage.qtyStarted = carry;
        stage.pendingQty = carry;
    }

    stage.status = 'skipped';
    stage.completedAt = new Date();
    stage.completedBy = userId;
    if (remarks) stage.remarks = remarks;

    const isLast = idx >= lot.stages.length - 1;
    if (isLast) {
        lot.qtyCompleted = Number(stage.qtyStarted || 0);
        lot.lotStatus = 'completed';
    } else {
        lot.currentStageIndex = idx + 1;
        lot.lotStatus = 'in_progress';
    }

    lot.updatedBy = userId;
    recomputeLotTotals(lot);
    pushAudit(lot, 'stage_skipped', userId, idx, stage.stageName, { remarks: remarks || '' });
    await lot.save();
    return lot;
}
