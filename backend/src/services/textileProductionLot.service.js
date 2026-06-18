import httpStatus from 'http-status';
import { ApiError } from '../utils/ApiError.js';
import { WorkflowProductionLot } from '../models/workflowProductionLot.model.js';
import { Company } from '../models/company.model.js';
import { IndustryTemplate } from '../models/industryTemplate.model.js';
import { Item } from '../models/item.model.js';
import { WorkflowMaster } from '../models/workflowMaster.model.js';
import { buildWorkflowVersion } from './companyWorkflowAssignment.service.js';
import {
    TEXTILE_INDUSTRY_CODES,
    findTextileStageIndex,
    isTextileStageName,
} from '../constants/textileProductionLot.constants.js';
import {
    getWorkflowProductionLotById,
    startWorkflowProductionStage,
    completeWorkflowProductionStage,
} from './workflowProductionLot.service.js';
import {
    lookupTextileJobWorkRate,
    buildLabourCost,
} from './textileJobWorkRate.service.js';
import { processNameFromStageName } from '../constants/textileJobWorkRate.constants.js';

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

async function generateTextileLotNo() {
    const prefix = `TXL-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`;
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

function buildInitialStageWip(stages = []) {
    return stages.map((s, idx) => ({
        stageIndex: idx,
        stageName: s.stageName,
        wipMeter: 0,
        status: 'pending',
    }));
}

export async function assertTextileCompany(companyId) {
    const company = await Company.findById(companyId).lean();
    if (!company) throw new ApiError(httpStatus.NOT_FOUND, 'Company not found');
    if (!company.industryTemplateRef) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Company has no industry template. Textile production requires Textile / Handloom template.');
    }
    const template = await IndustryTemplate.findById(company.industryTemplateRef).lean();
    const code = String(template?.templateCode || '').toUpperCase();
    const name = String(template?.templateName || '').toLowerCase();
    const isTextile = TEXTILE_INDUSTRY_CODES.includes(code) || name.includes('textile') || name.includes('handloom');
    if (!isTextile) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Textile production is only available for Textile / Handloom industry template companies.');
    }
    return { company, template };
}

export async function getTextileEligibility(companyId) {
    try {
        const { company, template } = await assertTextileCompany(companyId);
        const { workflow } = await resolveWorkflowForCompany(companyId);
        return {
            eligible: true,
            companyId: company._id,
            companyName: company.companyName,
            templateCode: template.templateCode,
            templateName: template.templateName,
            activeWorkflow: !!company.activeWorkflow,
            workflowName: workflow?.workflowName || null,
        };
    } catch (err) {
        if (err instanceof ApiError && err.statusCode === httpStatus.BAD_REQUEST) {
            return { eligible: false, message: err.message };
        }
        throw err;
    }
}

function assertTextileLot(lot) {
    if (!lot || lot.productionModule !== 'textile') {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Not a textile production lot');
    }
    if (!lot.textile) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Textile details missing on lot');
    }
    return lot;
}

function syncStageWip(lot, stageIndex, wipMeter, status) {
    if (!lot.textile.stageWip?.length) {
        lot.textile.stageWip = buildInitialStageWip(lot.stages);
    }
    const entry = lot.textile.stageWip[stageIndex];
    if (entry) {
        entry.wipMeter = wipMeter;
        entry.status = status;
        entry.stageName = lot.stages[stageIndex]?.stageName || entry.stageName;
    }
}

function recomputeTextileBalances(lot) {
    const t = lot.textile;
    t.shortageWastageTotal = Math.max(0, Number(t.meterIssuedTotal || 0) - Number(t.meterReturnedTotal || 0));
}

function getOutstandingIssuedMeter(lot) {
    return Math.max(0, Number(lot.textile.meterIssuedTotal || 0) - Number(lot.textile.meterReturnedTotal || 0));
}

export async function listTextileProductionLots({ companyId, lotStatus, search, limit = 100 } = {}) {
    if (companyId) await assertTextileCompany(companyId);
    const filter = { isDeleted: false, productionModule: 'textile' };
    if (companyId) filter.companyId = companyId;
    if (lotStatus) filter.lotStatus = lotStatus;
    if (search) {
        filter.$or = [
            { lotNo: new RegExp(search, 'i') },
            { batchNo: new RegExp(search, 'i') },
            { 'textile.rollNo': new RegExp(search, 'i') },
            { 'textile.fabricName': new RegExp(search, 'i') },
            { 'textile.barcode': new RegExp(search, 'i') },
        ];
    }
    return WorkflowProductionLot.find(filter)
        .sort({ createdAt: -1 })
        .limit(limit)
        .populate('itemId', 'itemCode itemName')
        .populate('createdBy', 'name email')
        .lean();
}

export async function createTextileProductionLot(payload, userId) {
    const {
        companyId,
        itemId,
        meter,
        rollNo,
        batchNo,
        fabricName,
        fabricQuality,
        fabricType,
        gsm,
        width,
        barcode,
        colour,
        shade,
        remarks,
        financialYearId,
    } = payload;

    if (!meter || Number(meter) <= 0) throw new ApiError(httpStatus.BAD_REQUEST, 'meter must be greater than zero');
    if (!itemId) throw new ApiError(httpStatus.BAD_REQUEST, 'itemId is required');

    await assertTextileCompany(companyId);
    const { company, workflow } = await resolveWorkflowForCompany(companyId);
    if (!company.activeWorkflow || !company.assignedWorkflowRef) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Company has no active workflow assignment.');
    }
    if (!workflow?.isActive || !workflow.stages?.length) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Assigned workflow not found or has no stages');
    }

    const item = await Item.findById(itemId).lean();
    if (!item || item.isDeleted) throw new ApiError(httpStatus.BAD_REQUEST, 'Item not found');

    const lotNo = await generateTextileLotNo();
    const qty = Number(meter);
    const stages = buildStageStates(workflow.stages);

    const lot = await WorkflowProductionLot.create({
        lotNo,
        batchNo: batchNo || rollNo || lotNo,
        companyId,
        financialYearId: financialYearId || null,
        itemId: item._id,
        itemCode: item.itemCode || '',
        itemName: fabricName || item.itemName || item.name || '',
        qtyStarted: qty,
        qtyCompleted: 0,
        pendingQty: qty,
        assignedWorkflowRef: workflow._id,
        workflowVersion: buildWorkflowVersion(workflow),
        workflowName: workflow.workflowName,
        workflowCode: workflow.workflowCode,
        currentStageIndex: 0,
        lotStatus: 'draft',
        productionModule: 'textile',
        textile: {
            fabricName: fabricName || item.itemName || '',
            fabricQuality: fabricQuality || '',
            fabricType: fabricType || '',
            gsm: gsm != null ? Number(gsm) : null,
            width: width != null ? Number(width) : null,
            meter: qty,
            rollNo: rollNo || lotNo,
            barcode: barcode || '',
            colour: colour || '',
            shade: shade || '',
            greyFabricMeter: qty,
            availableMeter: qty,
            meterIssuedTotal: 0,
            meterReturnedTotal: 0,
            shortageWastageTotal: 0,
            finishedMeter: 0,
            demoFinishedStockMeter: 0,
            remarks: remarks || '',
            dyeingIssues: [],
            dyeingReturns: [],
            stageWip: buildInitialStageWip(stages),
        },
        stages,
        createdBy: userId,
        updatedBy: userId,
    });

    pushAudit(lot, 'textile_lot_created', userId, null, 'Grey Fabric Inward', {
        lotNo,
        meter: qty,
        rollNo: rollNo || lotNo,
        workflowName: workflow.workflowName,
    });
    await lot.save();
    return lot;
}

export async function getTextileProductionLotById(id) {
    const lot = await getWorkflowProductionLotById(id);
    assertTextileLot(lot);
    return lot;
}

export async function recordDyeingIssue(lotId, payload, userId) {
    const lot = await getTextileProductionLotById(lotId);
    const dyeingIdx = findTextileStageIndex(lot.stages, 'DYEING');
    if (dyeingIdx < 0) throw new ApiError(httpStatus.BAD_REQUEST, 'Dyeing stage not found in workflow');

    const greyIdx = findTextileStageIndex(lot.stages, 'GREY_FABRIC');
    if (greyIdx >= 0 && lot.stages[greyIdx].status !== 'completed') {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Complete Grey Fabric inward before dyeing issue');
    }
    if (lot.currentStageIndex !== dyeingIdx) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Lot must be at Dyeing stage for issue entry');
    }

    const meterIssued = Number(payload.meterIssued);
    if (!meterIssued || meterIssued <= 0) throw new ApiError(httpStatus.BAD_REQUEST, 'meterIssued must be greater than zero');
    if (meterIssued > Number(lot.textile.availableMeter || 0)) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Cannot issue more meter than available grey fabric meter');
    }

    const vendorWorker = payload.vendorWorker || payload.dyerName || lot.textile.dyerName || '';
    const processName = payload.processName || 'Dyeing';
    let rateType = payload.rateType || '';
    let rateApplied = payload.rateApplied != null ? Number(payload.rateApplied) : 0;
    let rateMasterId = payload.rateMasterId || null;

    if ((!rateType || !rateApplied) && vendorWorker) {
        const resolved = await lookupTextileJobWorkRate(lot.companyId, {
            processName,
            vendorWorker,
            fabricType: lot.textile.fabricType,
        });
        if (resolved) {
            rateType = rateType || resolved.rateType;
            rateApplied = rateApplied || resolved.appliedRate;
            rateMasterId = rateMasterId || resolved._id;
        }
    }

    const labourCost = buildLabourCost(meterIssued, rateApplied, rateType);

    const issueNo = `DI-${String((lot.textile.dyeingIssues?.length || 0) + 1).padStart(3, '0')}`;
    lot.textile.dyeingIssues.push({
        issueNo,
        dyeingChallanNo: payload.dyeingChallanNo || lot.textile.dyeingChallanNo || '',
        dyerName: vendorWorker,
        vendorWorker,
        processName,
        partyType: payload.partyType || 'vendor',
        rateType,
        rateApplied,
        labourCost,
        rateMasterId,
        meterIssued,
        issuedBy: userId,
        remarks: payload.remarks || '',
    });

    lot.textile.processCostTotal = Number(lot.textile.processCostTotal || 0) + labourCost;

    lot.textile.availableMeter = Math.max(0, Number(lot.textile.availableMeter || 0) - meterIssued);
    lot.textile.meterIssuedTotal = Number(lot.textile.meterIssuedTotal || 0) + meterIssued;
    if (payload.dyerName) lot.textile.dyerName = payload.dyerName;
    if (payload.dyeingChallanNo) lot.textile.dyeingChallanNo = payload.dyeingChallanNo;

    const stage = lot.stages[dyeingIdx];
    if (stage.status === 'pending') {
        stage.status = 'started';
        stage.qtyStarted = Number(lot.textile.meterIssuedTotal || 0);
        stage.pendingQty = stage.qtyStarted;
        stage.startedAt = new Date();
        stage.startedBy = userId;
        lot.lotStatus = 'in_progress';
    } else {
        stage.qtyStarted = Number(lot.textile.meterIssuedTotal || 0);
        stage.pendingQty = getOutstandingIssuedMeter(lot);
    }

    syncStageWip(lot, dyeingIdx, getOutstandingIssuedMeter(lot), stage.status);
    recomputeTextileBalances(lot);
    lot.updatedBy = userId;
    pushAudit(lot, 'dyeing_issue', userId, dyeingIdx, stage.stageName, {
        issueNo,
        meterIssued,
        availableMeter: lot.textile.availableMeter,
        dyeingChallanNo: payload.dyeingChallanNo || '',
    });
    await lot.save();
    return lot;
}

export async function recordDyeingReturn(lotId, payload, userId) {
    const lot = await getTextileProductionLotById(lotId);
    const dyeingIdx = findTextileStageIndex(lot.stages, 'DYEING');
    if (dyeingIdx < 0) throw new ApiError(httpStatus.BAD_REQUEST, 'Dyeing stage not found');
    if (lot.currentStageIndex !== dyeingIdx) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Lot must be at Dyeing stage for return entry');
    }

    const outstanding = getOutstandingIssuedMeter(lot);
    const meterReturned = Number(payload.meterReturned);
    if (!meterReturned || meterReturned <= 0) throw new ApiError(httpStatus.BAD_REQUEST, 'meterReturned must be greater than zero');
    if (meterReturned > outstanding) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Cannot return more meter than outstanding issued meter');
    }

    const returnNo = `DR-${String((lot.textile.dyeingReturns?.length || 0) + 1).padStart(3, '0')}`;
    lot.textile.dyeingReturns.push({
        returnNo,
        dyeingChallanNo: payload.dyeingChallanNo || lot.textile.dyeingChallanNo || '',
        dyerName: payload.dyerName || lot.textile.dyerName || '',
        meterReturned,
        shortageWastage: 0,
        returnedBy: userId,
        remarks: payload.remarks || '',
    });

    lot.textile.meterReturnedTotal = Number(lot.textile.meterReturnedTotal || 0) + meterReturned;
    recomputeTextileBalances(lot);

    const stage = lot.stages[dyeingIdx];
    stage.pendingQty = getOutstandingIssuedMeter(lot);
    syncStageWip(lot, dyeingIdx, Number(lot.textile.meterReturnedTotal || 0), stage.status);

    lot.updatedBy = userId;
    pushAudit(lot, 'dyeing_return', userId, dyeingIdx, stage.stageName, {
        returnNo,
        meterReturned,
        shortageWastageTotal: lot.textile.shortageWastageTotal,
    });
    await lot.save();
    return lot;
}

export async function completeTextileDyeingStage(lotId, payload, userId) {
    const lot = await getTextileProductionLotById(lotId);
    const dyeingIdx = findTextileStageIndex(lot.stages, 'DYEING');
    if (dyeingIdx < 0) throw new ApiError(httpStatus.BAD_REQUEST, 'Dyeing stage not found');
    if (lot.currentStageIndex !== dyeingIdx) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Lot is not at Dyeing stage');
    }

    if (Number(lot.textile.meterReturnedTotal || 0) <= 0) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Record at least one dyeing return before completing dyeing');
    }
    if (Number(lot.textile.meterIssuedTotal || 0) <= 0) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Record dyeing issue before completing dyeing stage');
    }

    const qtyCompleted = Number(lot.textile.meterReturnedTotal || 0);
    const updated = await completeWorkflowProductionStage(
        lotId,
        dyeingIdx,
        { qtyCompleted, remarks: payload?.remarks || lot.stages[dyeingIdx].remarks || '' },
        userId,
    );

    syncStageWip(updated, dyeingIdx, 0, 'completed');
    updated.updatedBy = userId;
    await updated.save();
    return updated;
}

export async function startTextileStage(lotId, stageIndex, payload, userId) {
    await getTextileProductionLotById(lotId);
    const idx = Number(stageIndex);
    const updated = await startWorkflowProductionStage(lotId, idx, payload, userId);
    const meter = Number(updated.stages[idx]?.qtyStarted || 0);
    syncStageWip(updated, idx, meter, 'started');
    updated.updatedBy = userId;
    await updated.save();
    return updated;
}

export async function completeTextileStage(lotId, stageIndex, payload, userId) {
    const lot = await getTextileProductionLotById(lotId);
    const idx = Number(stageIndex);
    const stageName = lot.stages[idx]?.stageName || '';

    if (isTextileStageName(stageName, 'DYEING')) {
        return completeTextileDyeingStage(lotId, payload, userId);
    }

    const updated = await completeWorkflowProductionStage(lotId, idx, payload, userId);
    const qty = Number(payload?.qtyCompleted ?? updated.stages[idx]?.qtyCompleted ?? 0);
    syncStageWip(updated, idx, 0, 'completed');

    const processName = payload?.processName || processNameFromStageName(stageName);
    const vendorWorker = payload?.vendorWorker || '';
    if (processName && vendorWorker && qty > 0) {
        let rateType = payload.rateType || '';
        let rateApplied = payload.rateApplied != null ? Number(payload.rateApplied) : 0;
        let rateMasterId = payload.rateMasterId || null;

        if ((!rateType || !rateApplied) && vendorWorker) {
            const resolved = await lookupTextileJobWorkRate(updated.companyId, {
                processName,
                vendorWorker,
                fabricType: updated.textile?.fabricType,
            });
            if (resolved) {
                rateType = rateType || resolved.rateType;
                rateApplied = rateApplied || resolved.appliedRate;
                rateMasterId = rateMasterId || resolved._id;
            }
        }

        const labourCost = buildLabourCost(qty, rateApplied, rateType);
        if (labourCost > 0) {
            updated.textile.stageLabourCosts = updated.textile.stageLabourCosts || [];
            updated.textile.stageLabourCosts.push({
                stageIndex: idx,
                stageName,
                processName,
                vendorWorker,
                partyType: payload.partyType || 'worker',
                rateType,
                rateApplied,
                quantity: qty,
                labourCost,
                rateMasterId,
                recordedBy: userId,
                remarks: payload?.remarks || '',
            });
            updated.textile.processCostTotal = Number(updated.textile.processCostTotal || 0) + labourCost;
            pushAudit(updated, 'stage_labour_cost', userId, idx, stageName, {
                processName,
                vendorWorker,
                quantity: qty,
                labourCost,
            });
        }
    }

    if (isTextileStageName(stageName, 'FINISHED_FABRIC') || idx >= updated.stages.length - 1) {
        updated.textile.finishedMeter = qty;
        updated.textile.demoFinishedStockMeter = qty;
        pushAudit(updated, 'demo_finished_stock', userId, idx, stageName, {
            demoFinishedStockMeter: qty,
            note: 'Demo-only stock tracking on lot document',
        });
    } else if (isTextileStageName(stageName, 'PRINTING') || isTextileStageName(stageName, 'FINISHING')) {
        updated.textile.finishedMeter = qty;
    }

    updated.updatedBy = userId;
    await updated.save();
    return updated;
}

export async function getTextileLotReport(lotId) {
    const lot = await getTextileProductionLotById(lotId);
    const t = lot.textile;
    const currentStage = lot.stages[lot.currentStageIndex];

    return {
        lotId: lot._id,
        lotNo: lot.lotNo,
        rollNo: t.rollNo,
        batchNo: lot.batchNo,
        fabricName: t.fabricName,
        fabricQuality: t.fabricQuality,
        fabricType: t.fabricType,
        gsm: t.gsm,
        width: t.width,
        colour: t.colour,
        shade: t.shade,
        lotStatus: lot.lotStatus,
        currentStageIndex: lot.currentStageIndex,
        currentStageName: currentStage?.stageName || '',
        currentStageStatus: currentStage?.status || '',
        greyFabricMeter: t.greyFabricMeter,
        availableMeter: t.availableMeter,
        meterIssuedTotal: t.meterIssuedTotal,
        meterReturnedTotal: t.meterReturnedTotal,
        shortageWastageTotal: t.shortageWastageTotal,
        finishedMeter: t.finishedMeter,
        demoFinishedStockMeter: t.demoFinishedStockMeter,
        stageWip: t.stageWip || [],
        dyeingIssues: t.dyeingIssues || [],
        dyeingReturns: t.dyeingReturns || [],
        stageLabourCosts: t.stageLabourCosts || [],
        processCostTotal: t.processCostTotal || 0,
        auditLog: lot.auditLog || [],
        stages: (lot.stages || []).map((s, i) => ({
            index: i,
            stageName: s.stageName,
            status: s.status,
            qtyStarted: s.qtyStarted,
            qtyCompleted: s.qtyCompleted,
            pendingQty: s.pendingQty,
            wipMeter: t.stageWip?.[i]?.wipMeter ?? 0,
        })),
    };
}
