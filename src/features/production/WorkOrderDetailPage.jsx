import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
    getWorkOrderById, releaseWorkOrder, updateWorkOrder, updateStage, updateMaterialStatus, refreshMaterialStock,
    addProductionLog, deleteProductionLog, cancelSectionWorkOrder, restoreSectionWorkOrder, deleteWorkOrder, addMaterialLater, addMaterialLaterBulk, addMissingMaterialToProduct, createSupplementaryWorkOrder, createSupplementaryWorkOrderBulk, createSupplementaryFromMaterialIssue, completeMaterialAddition, getStageMaterialConsumption
} from '@/services/workOrderApi';
import { PATHS } from '@/routes/paths';
import { useCompany } from '@/contexts/CompanyContext';
import { useAuth } from '@/hooks/useAuth';
import { isTextileIndustryCompany } from '@/utils/industryInventoryLabels';
import { getWorkOrderLabels, isTextileWorkOrder } from '@/utils/textileWorkOrder';
import toast from 'react-hot-toast';
import WorkOrderSectionPanel from '@/features/production/WorkOrderSectionPanel';
import {
    buildProductionSheetPrintHtml,
    buildSupplementaryWorkOrderPrintHtml,
    buildLateMaterialIssueNoteHtml,
    openProductionSheetPrintWindow,
    openProductionSheetPrintPreview,
} from '@/features/production/buildProductionSheetPrintHtml';

// ─── Status Colors ───────────────────────────────────────────────────────────
const WO_STATUS_COLORS = {
    'Draft': { color: '#000000', bg: '#e2e8f0' },
    'Released': { color: '#000000', bg: '#bfdbfe' },
    'In Process': { color: '#000000', bg: '#a7f3d0' },
    'WIP – Waiting Material': { color: '#000000', bg: '#fecaca' },
    'On Hold': { color: '#000000', bg: '#e9d5ff' },
    'Completed': { color: '#000000', bg: '#6ee7b7' },
    'Closed': { color: '#000000', bg: '#cbd5e1' },
    'Cancelled': { color: '#000000', bg: '#fecaca' },
    'Pending': { color: '#000000', bg: '#fde68a' },
};

function supplementaryDisplayStatus(wo) {
    if (['Completed', 'Closed', 'Cancelled'].includes(wo?.status) || wo?.displayStatus) {
        return wo.displayStatus || wo.status;
    }
    return 'Pending';
}

const STAGE_STATUS_COLORS = {
    'Not Started': { color: '#000000', bg: '#e2e8f0', icon: '○' },
    'Running': { color: '#000000', bg: '#fde68a', icon: '▶' },
    'In Progress': { color: '#000000', bg: '#fde68a', icon: '▶' },
    'Completed': { color: '#000000', bg: '#a7f3d0', icon: '✓' },
    'QC Hold': { color: '#000000', bg: '#fed7aa', icon: '⏸' },
    'Failed': { color: '#000000', bg: '#fecaca', icon: '✕' },
    'Rework': { color: '#000000', bg: '#ddd6fe', icon: '↺' },
};

const ELECTRONICS_TABS = ['Overview', 'BOM & Material', 'Process Execution', 'QC & Testing', 'WIP & Exceptions', 'Material History'];
const TEXTILE_TABS = ['Overview', 'BOM & Material', 'Process Execution', 'Process QC', 'WIP & Exceptions', 'Material History'];

// ─── Input style ─────────────────────────────────────────────────────────────
const inp = {
    padding: '8px 12px', background: '#ffffff', border: '1px solid #d1d5db',
    borderRadius: '6px', color: '#1e293b', fontSize: '13px', outline: 'none', width: '100%', boxSizing: 'border-box',
};

function woProductDisplay(wo) {
    const fp = wo?.finishedProductId && typeof wo.finishedProductId === 'object' ? wo.finishedProductId : {};
    return {
        productName: wo?.finishedProductName || fp.itemName || fp.name || '—',
        modelNo: fp.modelNo || wo?.finishedProductModelNo || wo?.modelNo || '—',
        itemCode: fp.itemCode || wo?.finishedProductItemCode || '—',
    };
}

function isBomRequiredLine(m) {
    return m?.bomIsMandatory !== false;
}

function isDeferredLine(m) {
    return isBomRequiredLine(m) && m?.isMandatory === false;
}

function materialStatusLabel(m, currentMandatory = m?.isMandatory) {
    const deferred = isBomRequiredLine(m) && currentMandatory === false;
    if (deferred && Number(m?.shortQty) > 0) return 'Pending Material';
    if (deferred) return 'Deferred for Current Stage';
    if (Number(m?.shortQty) > 0) return 'Short';
    return 'Available';
}

const COMPONENT_PROCESS_TYPES = ['SMD', 'TH', 'PCB', 'OTHER'];

function normalizeComponentProcessType(raw) {
    const v = String(raw || '').trim().toUpperCase();
    return COMPONENT_PROCESS_TYPES.includes(v) ? v : '';
}

function bomComponentsForProcessType(wo) {
    if (Array.isArray(wo?.bomId?.components) && wo.bomId.components.length) return wo.bomId.components;
    return [];
}

/** Reuses BOM componentType, then explicit WO/item SMD|TH|PCB. Does not guess from names. */
function resolveComponentProcessType(m, bomComponents = []) {
    const bom = (bomComponents || []).find((c) =>
        (m?.itemId && c?.itemId && String(c.itemId) === String(m.itemId))
        || (m?.itemCode && c?.itemCode && String(c.itemCode) === String(m.itemCode))
    );
    const fromBom = normalizeComponentProcessType(bom?.componentType);
    if (fromBom) return fromBom;
    const fromLine = normalizeComponentProcessType(m?.itemType);
    if (fromLine && fromLine !== 'OTHER') return fromLine;
    return 'UNCLASSIFIED';
}

function isMaterialAvailableForSelect(m) {
    return !(Number(m?.shortQty) > 0);
}

function processTypeForStage(stage) {
    const seq = Number(stage?.seq);
    if (seq === 1) return 'PCB';
    if (seq === 2) return 'SMD';
    if (seq === 3) return 'TH';
    return '';
}

function pendingProceedWarning(count) {
    const n = Number(count) || 0;
    const noun = n === 1 ? 'component is' : 'components are';
    return `${n} ${noun} pending. Production may proceed temporarily.`;
}

function isUnresolvedPendingLine(m) {
    return isDeferredLine(m) && remainingToIssueOf(m) > 0;
}

function PendingMaterialBannerActions({ count, onManage, onViewBom }) {
    const btn = {
        padding: '6px 14px',
        borderRadius: '6px',
        fontSize: '12px',
        fontWeight: 700,
        cursor: 'pointer',
    };
    return (
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
                type="button"
                onClick={onManage}
                style={{ ...btn, background: '#fff', color: '#92400e', border: '1px solid #f59e0b' }}
            >
                Manage Pending Material ({count})
            </button>
            {onViewBom && (
                <button
                    type="button"
                    onClick={onViewBom}
                    style={{ ...btn, background: '#fef3c7', color: '#92400e', border: '1px solid #fcd34d' }}
                >
                    View BOM
                </button>
            )}
        </div>
    );
}

function deferredByForMaterial(wo, materialId) {
    const hits = (wo.mandatoryChangeHistory || []).filter((h) =>
        String(h.materialId) === String(materialId) && h.newMandatory === false
    );
    if (!hits.length) return '';
    hits.sort((a, b) => new Date(b.changedAt) - new Date(a.changedAt));
    const by = hits[0].changedBy;
    return (by && typeof by === 'object' ? by.name : '') || '';
}

function stageQtyStarted(stage) {
    return Math.max(0, Number(stage?.inputQty) || 0);
}

function stageQtyCompleted(stage) {
    if (isNaStage(stage)) return 0;
    return Math.max(0, Number(stage?.outputQty) || 0);
}

function stageWipQty(stage) {
    return Math.max(0, stageQtyStarted(stage) - stageQtyCompleted(stage));
}

function getApplicablePreviousStage(stages, seq) {
    const n = Number(seq);
    return [...(stages || [])]
        .filter((s) => Number(s.seq) < n && !isNaStage(s))
        .sort((a, b) => Number(b.seq) - Number(a.seq))[0] || null;
}

function getApplicableNextStage(stages, seq) {
    const n = Number(seq);
    return [...(stages || [])]
        .filter((s) => Number(s.seq) > n && !isNaStage(s))
        .sort((a, b) => Number(a.seq) - Number(b.seq))[0] || null;
}

/** Available For Current Stage = Previous Completed - Current Started (min 0). First applicable stage: null. */
function getAvailableFromPrevious(stages, seq, currentStarted = null) {
    const n = Number(seq);
    if (!Number.isFinite(n) || n <= 1) return null;
    const prev = getApplicablePreviousStage(stages, n);
    if (!prev) return null;
    const current = (stages || []).find((s) => Number(s.seq) === n);
    const started = currentStarted != null ? Math.max(0, Number(currentStarted) || 0) : stageQtyStarted(current);
    return Math.max(0, stageQtyCompleted(prev) - started);
}

function getReadyForNext(stages, seq) {
    const current = (stages || []).find((s) => Number(s.seq) === Number(seq));
    if (!current) return 0;
    const next = getApplicableNextStage(stages, seq);
    const nextStarted = next ? stageQtyStarted(next) : 0;
    return Math.max(0, stageQtyCompleted(current) - nextStarted);
}

/** Display-only label. Stored values remain Not Started / Running / Completed / QC Hold / Failed / Rework. */
function displayStageStatus(stage) {
    const raw = String(stage?.status || 'Not Started');
    if (raw === 'Running') return 'In Progress';
    return raw;
}

function getSequenceBlocker(stages, seq, options = {}) {
    const n = Number(seq);
    if (!Number.isFinite(n) || n <= 1) return null;
    const current = (stages || []).find((s) => Number(s.seq) === n);
    if (current && isNaStage(current)) return null;
    const prev = getApplicablePreviousStage(stages, n);
    if (!prev) return null;
    const proposedStarted = options.proposedStarted != null
        ? Math.max(0, Number(options.proposedStarted) || 0)
        : stageQtyStarted(current);
    const prevCompleted = stageQtyCompleted(prev);
    if (proposedStarted > prevCompleted) {
        return { ...prev, reason: 'qty', prevCompleted, proposedStarted };
    }
    if (proposedStarted <= 0 && prevCompleted <= 0) {
        return { ...prev, reason: 'waiting', prevCompleted, proposedStarted };
    }
    return null;
}

function stageHasProgress(stage) {
    const status = String(stage?.status || 'Not Started');
    if (status !== 'Not Started') return true;
    return stageQtyStarted(stage) > 0 || (Number(stage?.outputQty) || 0) > 0;
}

function getSequenceInconsistencies(stages) {
    return [...(stages || [])]
        .filter((s) => Number(s.seq) > 1 && !isNaStage(s) && stageHasProgress(s))
        .map((s) => {
            const previous = getApplicablePreviousStage(stages, s.seq);
            if (!previous) return null;
            if (stageQtyStarted(s) <= stageQtyCompleted(previous) && stageQtyCompleted(s) <= stageQtyCompleted(previous)) {
                return null;
            }
            return { stage: s, previous };
        })
        .filter(Boolean);
}

function completeBeforeHint(_current, blocker) {
    return `Waiting for output from ${blocker?.stageName || 'the previous stage'}.`;
}

function cannotStartMessage(current, blocker) {
    const currentName = current?.stageName || 'this stage';
    const prevName = blocker?.stageName || 'the previous stage';
    if (blocker?.reason === 'qty') {
        return `Cannot start ${blocker.proposedStarted} pcs in ${currentName}. Only ${blocker.prevCompleted} pcs have been completed in ${prevName}.`;
    }
    return `Waiting for output from ${prevName}.`;
}

function sectionLabelForMaterial(wo, m) {
    if (m?.sectionName) return m.sectionName;
    if (wo?.bomSectionName) return wo.bomSectionName;
    if (m?.sectionNo) return `Section ${m.sectionNo}`;
    return '—';
}

function formatWhen(dt) {
    if (!dt) return '';
    const d = new Date(dt);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleString();
}

function deferredDateForMaterial(wo, materialId) {
    const hits = (wo.mandatoryChangeHistory || []).filter((h) =>
        String(h.materialId) === String(materialId) && h.newMandatory === false
    );
    if (!hits.length) return null;
    hits.sort((a, b) => new Date(b.changedAt) - new Date(a.changedAt));
    return hits[0].changedAt || null;
}

const AUTO_MATERIAL_REMARKS = [
    'Phase 1 read-only snapshot — Section WO does not reserve or consume stock',
];

function addedLaterQtyOf(m) {
    return Math.max(0, Number(m?.addedLaterQty) || 0);
}

function remainingToAllocateOf(m) {
    if (m?.remainingToAllocateQty != null) return Math.max(0, Number(m.remainingToAllocateQty) || 0);
    if (m?.remainingPendingQty != null) return Math.max(0, Number(m.remainingPendingQty) || 0);
    const req = Math.max(0, Number(m?.requiredQty) || 0);
    const allocated = Math.max(0, Number(m?.supplementaryAllocatedQty) || 0);
    const deferred = isBomRequiredLine(m) && m?.isMandatory === false;
    if (!deferred && addedLaterQtyOf(m) <= 0 && allocated <= 0) return 0;
    return Math.max(0, req - addedLaterQtyOf(m) - allocated);
}

function remainingToResolveLive(m) {
    const req = Math.max(0, Number(m?.requiredQty) || 0);
    return Math.max(0, req - addedLaterQtyOf(m) - (Number(m?.supplementaryCompletedQty) || 0));
}

function remainingToIssueOf(m) {
    if (m?.remainingToIssueQty != null) return Math.max(0, Number(m.remainingToIssueQty) || 0);
    const req = Math.max(0, Number(m?.requiredQty) || 0);
    const posted = Math.max(0, Number(m?.postedIssueQty) || 0);
    return Math.max(0, req - posted);
}

function remainingToResolveOf(m) {
    if (m?.remainingToResolveQty != null) return Math.max(0, Number(m.remainingToResolveQty) || 0);
    const req = Math.max(0, Number(m?.requiredQty) || 0);
    const completed = Math.max(0, Number(m?.supplementaryCompletedQty) || 0);
    const deferred = isBomRequiredLine(m) && m?.isMandatory === false;
    if (!deferred && addedLaterQtyOf(m) <= 0 && completed <= 0 && !(Number(m?.supplementaryAllocatedQty) > 0)) return 0;
    return Math.max(0, req - addedLaterQtyOf(m) - completed);
}

function remainingPendingQtyOf(m) {
    return remainingToAllocateOf(m);
}

function lateMaterialStatusOf(m) {
    if (m?.lateMaterialStatus) return m.lateMaterialStatus;
    const req = Math.max(0, Number(m?.requiredQty) || 0);
    const remainingResolve = remainingToResolveOf(m);
    const resolved = addedLaterQtyOf(m) + Math.max(0, Number(m?.supplementaryCompletedQty) || 0);
    if (remainingResolve === 0 && resolved >= req && req > 0) return 'Fully Resolved';
    if (resolved > 0 && remainingResolve > 0) return `Partially Resolved — ${resolved}/${req}`;
    return 'Pending Material';
}

function isNaStage(stage) {
    return stage?.notApplicable === true || stage?.isApplicable === false;
}

const LATE_MATERIAL_PROCESS_WARNING = 'Issuing late material deducts inventory now. Parent Work Order completion will consume only the remaining unissued quantity. Printing this note does not change stock.';

function supplementaryRowsForMaterial(wo, m) {
    return (wo.supplementaryWorkOrders || []).filter((w) =>
        (w.supplementaryMaterials || []).some((sm) =>
            String(sm.materialId) === String(m?._id) || (m?.itemId && String(sm.itemId) === String(m.itemId))
        )
    );
}

function displayMaterialRemark(raw) {
    const s = String(raw || '').trim();
    if (!s) return '';
    if (AUTO_MATERIAL_REMARKS.includes(s)) return '';
    return String(raw || '');
}

import { BrandedLoader } from '@/components/ui/BrandedLoading';


export default function WorkOrderDetailPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const { selectedCompany } = useCompany();
    const [wo, setWo] = useState(null);
    const [loading, setLoading] = useState(true);
    const initialTab = (() => {
        const raw = parseInt(searchParams.get('tab') || '0', 10);
        return Number.isFinite(raw) && raw >= 0 ? raw : 0;
    })();
    const [tab, setTab] = useState(initialTab);
    const [saving, setSaving] = useState(false);
    const [pendingDrawerOpen, setPendingDrawerOpen] = useState(false);

    const load = useCallback(() => {
        getWorkOrderById(id)
            .then(setWo)
            .catch(() => toast.error('Failed to load Work Order'))
            .finally(() => setLoading(false));
    }, [id]);

    useEffect(() => { load(); }, [load]);

    useEffect(() => {
        if (!pendingDrawerOpen || !wo) return;
        const items = wo.woKind === 'section'
            ? (wo.materialStatus || []).filter((m) => isUnresolvedPendingLine(m))
            : (wo.materialStatus || []).filter((m) => isDeferredLine(m));
        if (items.length === 0) setPendingDrawerOpen(false);
    }, [wo, pendingDrawerOpen]);

    const handleRelease = async () => {
        setSaving(true);
        try { await releaseWorkOrder(id); toast.success('WO Released!'); load(); }
        catch (e) { toast.error(e.response?.data?.message || e.message); }
        finally { setSaving(false); }
    };

    const handleCancelSection = async () => {
        if (!window.confirm('Cancel this Section Work Order? Parent and sibling section WOs will not be cancelled.')) return;
        setSaving(true);
        try { await cancelSectionWorkOrder(id); toast.success('Section WO cancelled'); load(); }
        catch (e) { toast.error(e.response?.data?.message || e.message); }
        finally { setSaving(false); }
    };

    const isIdleDraftSection = wo?.woKind === 'section'
        && wo.status === 'Draft'
        && !wo.inventorySynced
        && !(wo.supplementaryWorkOrders || []).length
        && !(wo.materialEventHistory || []).length
        && !(wo.mandatoryChangeHistory || []).length
        && !(wo.stages || []).some((s) => (s.status && s.status !== 'Not Started') || (s.productionLogs || []).length || (Number(s.outputQty) || 0) > 0)
        && !(wo.materialStatus || []).some((m) => (Number(m.addedLaterQty) || 0) > 0 || (Number(m.supplementaryAllocatedQty) || 0) > 0);

    const handleDeleteDraftSection = async () => {
        if (!window.confirm('Delete this Draft Section Work Order? The same section number can be created again.')) return;
        setSaving(true);
        try {
            await deleteWorkOrder(id);
            toast.success('Draft Section WO deleted');
            const parentId = wo?.parentWorkOrderId?._id || wo?.parentWorkOrderId;
            navigate(parentId ? PATHS.PRODUCTION.WO_DETAIL(parentId) : PATHS.PRODUCTION.WORK_ORDERS);
        } catch (e) { toast.error(e.response?.data?.message || e.message); }
        finally { setSaving(false); }
    };

    const handleRestoreSection = async () => {
        const parentId = wo?.parentWorkOrderId?._id || wo?.parentWorkOrderId;
        if (!parentId) return toast.error('Parent Work Order is missing. Restore from the parent Section panel.');
        if (!window.confirm(`Restore / Reopen ${wo.woNumber}? History will be preserved.`)) return;
        setSaving(true);
        try {
            await restoreSectionWorkOrder(parentId, { sectionWorkOrderId: wo._id, bomSectionNo: wo.bomSectionNo });
            toast.success('Section WO restored');
            load();
        } catch (e) { toast.error(e.response?.data?.message || e.message); }
        finally { setSaving(false); }
    };

    if (loading) return <BrandedLoader size={120} />;
    if (!wo) return <div style={{ padding: '60px', textAlign: 'center', color: '#ef4444', background: '#f8f9fa', minHeight: '100vh' }}>Work Order not found</div>;

    const isTextile = isTextileWorkOrder(wo) || isTextileIndustryCompany(selectedCompany);
    const labels = getWorkOrderLabels(isTextile);
    const isSectionWo = wo.woKind === 'section';
    const isSupplementaryWo = wo.woKind === 'supplementary';
    const TABS = isSupplementaryWo
        ? ['Overview', 'Material History']
        : (isTextile ? TEXTILE_TABS : ELECTRONICS_TABS);

    const displayStatus = isSupplementaryWo ? supplementaryDisplayStatus(wo) : wo.status;
    const sc = WO_STATUS_COLORS[displayStatus] || WO_STATUS_COLORS[wo.status] || WO_STATUS_COLORS['Draft'];
    const deferredPending = (wo.materialStatus || []).filter(m => isDeferredLine(m));
    const unresolvedPending = (wo.materialStatus || []).filter(m => isUnresolvedPendingLine(m));
    const currentMandatoryShortages = (wo.materialStatus || []).filter(m => m.isMandatory && m.shortQty > 0);
    const parentRef = wo.parentWorkOrderId && typeof wo.parentWorkOrderId === 'object' ? wo.parentWorkOrderId : null;
    const sourceSectionRef = wo.sourceSectionWorkOrderId && typeof wo.sourceSectionWorkOrderId === 'object' ? wo.sourceSectionWorkOrderId : null;
    const progressStages = isSupplementaryWo ? (wo.stages || []).filter((s) => !isNaStage(s)) : (wo.stages || []);
    const pct = progressStages.length ? Math.round((progressStages.filter(s => s.status === 'Completed').length / progressStages.length) * 100) : 0;
    const pendingManageItems = isSectionWo ? unresolvedPending : deferredPending;
    const pendingBannerCount = isSectionWo ? unresolvedPending.length : deferredPending.length;
    const sectionDeferredResolved = isSectionWo && deferredPending.length > 0 && unresolvedPending.length === 0;

    const handlePrintProductionSheet = () => {
        const html = isSupplementaryWo
            ? buildSupplementaryWorkOrderPrintHtml({
                wo,
                companyName: selectedCompany?.companyName,
                company: selectedCompany,
                sourceSectionWo: sourceSectionRef,
            })
            : buildProductionSheetPrintHtml({
                wo,
                companyName: selectedCompany?.companyName,
                isTextile,
            });
        openProductionSheetPrintWindow(html);
    };

    return (
        <div style={{ fontFamily: "'Inter', sans-serif", background: '#f8f9fa', minHeight: '100vh', color: '#1e293b' }}>
            {/* Top bar */}
            <div style={{ background: '#ffffff', borderBottom: '1px solid #e5e7eb', padding: '16px 28px' }}>
                <button
                    onClick={() => navigate(PATHS.PRODUCTION.WORK_ORDERS)}
                    style={{ background: 'none', border: 'none', color: '#64748b', fontSize: '13px', cursor: 'pointer', padding: 0, marginBottom: '8px' }}
                >{labels.backLink}</button>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 700 }}>{wo.woNumber}</h1>
                            {isSectionWo && (
                                <span style={{ padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 800, background: '#fef3c7', color: '#92400e', letterSpacing: 0.3 }}>SECTION WORK ORDER</span>
                            )}
                            {isSupplementaryWo && (
                                <span style={{ padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 800, background: '#e0e7ff', color: '#3730a3', letterSpacing: 0.3 }}>SUPPLEMENTARY WORK ORDER</span>
                            )}
                            <span style={{ padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 600, background: sc.bg, color: sc.color }}>{displayStatus}</span>
                            <span style={{ fontSize: '13px', color: '#94a3b8' }}>Priority: <strong style={{ color: '#f59e0b' }}>{wo.priority}</strong></span>
                        </div>
                        <div style={{ color: '#64748b', fontSize: '13px', marginTop: '4px' }}>
                            {(isSectionWo || isSupplementaryWo) && (
                                <span>
                                    Parent:{' '}
                                    {parentRef?._id ? (
                                        <button type="button" onClick={() => navigate(PATHS.PRODUCTION.WO_DETAIL(parentRef._id))} style={{ background: 'none', border: 'none', color: '#2563eb', padding: 0, cursor: 'pointer', fontWeight: 700 }}>{parentRef.woNumber}</button>
                                    ) : '—'}
                                    {isSupplementaryWo && sourceSectionRef?._id && (
                                        <>
                                            {' · '}Section WO:{' '}
                                            <button type="button" onClick={() => navigate(PATHS.PRODUCTION.WO_DETAIL(sourceSectionRef._id))} style={{ background: 'none', border: 'none', color: '#2563eb', padding: 0, cursor: 'pointer', fontWeight: 700 }}>{sourceSectionRef.woNumber}</button>
                                        </>
                                    )}
                                    {' · '}Section: <strong>{wo.bomSectionName || '—'}</strong>
                                    {' · '}
                                </span>
                            )}
                            {(() => { const p = woProductDisplay(wo); return `${p.productName} · Model No: ${p.modelNo} · Item Code: ${p.itemCode}`; })()}
                            {isTextile && wo.textile?.designNo ? ` · Design: ${wo.textile.designNo}` : ''}
                            {' · '}{isTextile ? 'Qty' : 'Target'}: {wo.targetQty}{isTextile ? ' PCS' : ' pcs'}
                            {isSectionWo ? ` · Completed: ${wo.completedQty ?? 0} · Stage: ${wo.currentStageName || '—'}` : ''}
                            {isSupplementaryWo && wo.materialIssueNo ? ` · Material Issue: ${wo.materialIssueNo}` : ''}
                            {' · '}{labels.detailSupervisor}: {wo.textile?.assignedVendorWorker || wo.supervisor || '—'}
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                            onClick={handlePrintProductionSheet}
                            style={{ padding: '9px 18px', borderRadius: '8px', background: '#e2e8f0', color: '#475569', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}
                        >{isSupplementaryWo ? '🖨️ Print / PDF Supplementary WO' : '🖨️ Print Production Sheet'}</button>
                        {isSupplementaryWo && displayStatus !== 'Completed' && displayStatus !== 'Cancelled' && (
                            <button
                                onClick={async () => {
                                    const issued = (wo.supplementaryMaterials || wo.materialStatus || [])
                                        .map((m, i) => `${i + 1}. ${m.itemCode || ''} ${m.itemName || ''} × ${m.qty ?? m.requiredQty ?? '—'}`)
                                        .join('\n');
                                    if (!window.confirm(`Confirm that these issued missing materials have been physically fitted to this section/product?\n\n${issued || 'No lines'}\n\nStock will not be deducted again.`)) return;
                                    setSaving(true);
                                    try {
                                        await completeMaterialAddition(wo._id);
                                        toast.success('Material addition marked completed. Stock was not deducted.');
                                        load();
                                    } catch (e) { toast.error(e.response?.data?.message || e.message); }
                                    finally { setSaving(false); }
                                }}
                                disabled={saving}
                                style={{ padding: '9px 18px', borderRadius: '8px', background: '#166534', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: '13px' }}
                            >{saving ? '...' : 'Mark Material Addition Completed'}</button>
                        )}
                        {wo.status === 'Draft' && (
                            <button
                                onClick={handleRelease} disabled={saving}
                                style={{ padding: '9px 18px', borderRadius: '8px', background: '#1d4ed8', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '13px' }}
                            >{saving ? '...' : '▶ Release WO'}</button>
                        )}
                        {isSectionWo && isIdleDraftSection && (
                            <button
                                onClick={handleDeleteDraftSection} disabled={saving}
                                style={{ padding: '9px 18px', borderRadius: '8px', background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', cursor: 'pointer', fontWeight: 600, fontSize: '13px' }}
                            >Delete Draft Section WO</button>
                        )}
                        {isSectionWo && !isIdleDraftSection && wo.status !== 'Cancelled' && wo.status !== 'Closed' && (
                            <button
                                onClick={handleCancelSection} disabled={saving}
                                style={{ padding: '9px 18px', borderRadius: '8px', background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', cursor: 'pointer', fontWeight: 600, fontSize: '13px' }}
                            >Cancel Section WO</button>
                        )}
                        {isSectionWo && wo.status === 'Cancelled' && (
                            <button
                                onClick={handleRestoreSection} disabled={saving}
                                style={{ padding: '9px 18px', borderRadius: '8px', background: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0', cursor: 'pointer', fontWeight: 600, fontSize: '13px' }}
                            >Restore / Reopen</button>
                        )}
                    </div>
                </div>
                {/* Progress bar — hidden on missing-material Supplementary WO */}
                {!isSupplementaryWo && (
                <div style={{ marginTop: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                        <span style={{ fontSize: '11px', color: '#64748b' }}>Overall Progress</span>
                        <span style={{ fontSize: '11px', color: '#94a3b8' }}>{pct}%</span>
                    </div>
                    <div style={{ height: '8px', background: '#e2e8f0', borderRadius: '4px', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: 'linear-gradient(90deg,#3b82f6,#10b981)', transition: 'width 0.4s' }} />
                    </div>
                </div>
                )}
            </div>

            {isSupplementaryWo && (
                <div style={{ background: '#eef2ff', borderBottom: '1px solid #c7d2fe', padding: '12px 28px', fontSize: 13, color: '#3730a3' }}>
                    The following missing components have been received and issued from stock. Add these components to the existing <strong>{wo.bomSectionName || 'section'}</strong> production. Completing this Supplementary WO does <strong>not</strong> deduct stock or create finished goods.
                </div>
            )}
            {isSectionWo && (
                <div style={{ background: '#fffbeb', borderBottom: '1px solid #fcd34d', padding: '12px 28px', fontSize: 13, color: '#92400e' }}>
                    Process / progress tracking only. Completing this section does <strong>not</strong> create finished product {woProductDisplay(wo).productName} in stock. Stock and FG posting stay on the parent Work Order.
                </div>
            )}

            {/* Parent: hard-block only for currently-ticked Mandatory shortages */}
            {!isSectionWo && currentMandatoryShortages.length > 0 && (
                <div style={{ background: '#450a0a', borderBottom: '1px solid #dc2626', padding: '12px 28px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '16px' }}>⚠️</span>
                    <div>
                        <strong style={{ color: '#fca5a5', fontSize: '13px' }}>Mandatory Material Shortage</strong>
                        <div style={{ color: '#f87171', fontSize: '12px' }}>
                            {currentMandatoryShortages.map(m => m.itemName).join(', ')} — FG cannot be completed until resolved.
                        </div>
                    </div>
                    <button onClick={() => setTab(1)} style={{ marginLeft: 'auto', padding: '6px 14px', borderRadius: '6px', background: '#7f1d1d', color: '#fca5a5', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}>
                        View BOM →
                    </button>
                </div>
            )}

            {/* Deferred / pending: warning only — process may continue */}
            {pendingBannerCount > 0 && !isSupplementaryWo && (
                <div style={{ background: '#fffbeb', borderBottom: '1px solid #fcd34d', padding: '12px 28px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '16px' }}>⏳</span>
                    <div>
                        <strong style={{ color: '#92400e', fontSize: '13px' }}>Pending Material</strong>
                        <div style={{ color: '#b45309', fontSize: '12px' }}>
                            {pendingProceedWarning(pendingBannerCount)}
                            {!isSectionWo && deferredPending.length > 0 ? ` ${deferredPending.map(m => m.itemName).join(', ')}.` : ''}
                        </div>
                    </div>
                    {isSectionWo ? (
                        <PendingMaterialBannerActions
                            count={pendingBannerCount}
                            onManage={() => setPendingDrawerOpen(true)}
                            onViewBom={() => setTab(1)}
                        />
                    ) : (
                        <button onClick={() => setTab(1)} style={{ marginLeft: 'auto', padding: '6px 14px', borderRadius: '6px', background: '#fef3c7', color: '#92400e', border: '1px solid #fcd34d', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}>
                            View BOM →
                        </button>
                    )}
                </div>
            )}
            {sectionDeferredResolved && (
                <div style={{ background: '#f0fdf4', borderBottom: '1px solid #86efac', padding: '12px 28px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '16px' }}>✓</span>
                    <strong style={{ color: '#166534', fontSize: '13px' }}>All deferred BOM material resolved.</strong>
                </div>
            )}

            {/* Tabs */}
            <div style={{ display: 'flex', gap: '0', borderBottom: '1px solid #e5e7eb', background: '#ffffff', paddingLeft: '28px' }}>
                {TABS.map((t, i) => (
                    <button key={t} onClick={() => setTab(i)}
                        style={{
                            padding: '14px 18px', border: 'none', background: 'none', cursor: 'pointer',
                            fontSize: '13px', fontWeight: tab === i ? 700 : 500,
                            color: tab === i ? '#2563eb' : '#64748b',
                            borderBottom: tab === i ? '2px solid #2563eb' : '2px solid transparent',
                            transition: 'all 0.15s',
                        }}
                    >{t}</button>
                ))}
            </div>

            {/* Tab Content */}
            <div style={{ padding: '28px' }}>
                {isSupplementaryWo ? (
                    <>
                        {tab === 0 && <OverviewTab wo={wo} load={load} isTextile={isTextile} labels={labels} />}
                        {tab === 1 && <MaterialHistoryTab wo={wo} />}
                    </>
                ) : (
                    <>
                {tab === 0 && <OverviewTab wo={wo} load={load} isTextile={isTextile} labels={labels} />}
                {tab === 1 && <BomMaterialTab wo={wo} load={load} />}
                {tab === 2 && (
                    <ProcessExecutionTab
                        wo={wo}
                        load={load}
                        setTab={setTab}
                        setWo={setWo}
                        isSectionWo={isSectionWo}
                        pendingCount={pendingManageItems.length}
                        deferredResolved={sectionDeferredResolved}
                        onOpenPending={() => setPendingDrawerOpen(true)}
                        onViewBom={() => setTab(1)}
                    />
                )}
                {tab === 3 && <QcTestingTab wo={wo} load={load} />}
                {tab === 4 && <WipTab wo={wo} />}
                {tab === 5 && <MaterialHistoryTab wo={wo} />}
                    </>
                )}
            </div>

            <PendingComponentsDrawer
                wo={wo}
                items={pendingManageItems}
                open={pendingDrawerOpen}
                onClose={() => setPendingDrawerOpen(false)}
                load={load}
                setTab={setTab}
            />

            <NavigationGuides />
        </div>
    );
}

// ─── Navigation Guides ───────────────────────────────────────────────────────
function NavigationGuides() {
    const scroll = (dir) => {
        const main = document.querySelector('main');
        if (!main) return;
        const step = 400;
        if (dir === 'up') main.scrollBy({ top: -step, behavior: 'smooth' });
        if (dir === 'down') main.scrollBy({ top: step, behavior: 'smooth' });
        if (dir === 'left') main.scrollBy({ left: -step, behavior: 'smooth' });
        if (dir === 'right') main.scrollBy({ left: step, behavior: 'smooth' });
    };

    const guideStyle = {
        position: 'fixed', zIndex: 999999, padding: '10px',
        background: 'rgba(255, 255, 255, 0.4)', borderRadius: '50%',
        border: '1px solid rgba(0,0,0,0.1)', cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 4px 12px rgba(0,0,0,0.1)', backdropFilter: 'blur(4px)',
        transition: 'all 0.2s', width: '40px', height: '40px', color: '#1d4ed8',
        fontSize: '24px', fontWeight: 'bold'
    };

    return (
        <>
            {/* Edge Guides */}
            <button onClick={() => scroll('up')} style={{ ...guideStyle, top: '80px', left: '50%', transform: 'translateX(-50%)' }} title="Scroll Up">↑</button>
            <button onClick={() => scroll('down')} style={{ ...guideStyle, bottom: '20px', left: '50%', transform: 'translateX(-50%)' }} title="Scroll Down">↓</button>
            <button onClick={() => scroll('left')} style={{ ...guideStyle, top: '50%', left: '260px', transform: 'translateY(-50%)' }} title="Scroll Left">←</button>
            <button onClick={() => scroll('right')} style={{ ...guideStyle, top: '50%', right: '20px', transform: 'translateY(-50%)' }} title="Scroll Right">→</button>
        </>
    );
}

// ─── Overview Tab ─────────────────────────────────────────────────────────────
function OverviewTab({ wo, load, isTextile, labels }) {
    const fmt = (d) => d ? new Date(d).toLocaleDateString() : '—';
    const [editing, setEditing] = useState(false);
    const [saving, setSaving] = useState(false);

    // Check if production has started (if any stage has prod logs)
    const hasStarted = wo.stages && wo.stages.some(s => s.productionLogs && s.productionLogs.length > 0);

    const [form, setForm] = useState({
        targetQty: wo.targetQty,
        priority: wo.priority,
        plannedStart: wo.plannedStart ? wo.plannedStart.split('T')[0] : '',
        plannedEnd: wo.plannedEnd ? wo.plannedEnd.split('T')[0] : '',
        supervisor: wo.supervisor || '',
        remarks: wo.remarks || '',
    });

    const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

    const handleSave = async () => {
        setSaving(true);
        try {
            // we use the same updateMaterialStatus or create a new api method? 
            // Wait, there's no updateWorkOrder api method imported yet? Let's check imports.
            // I'll need to import updateWorkOrder from services/workOrderApi
            // Let's assume it's imported or I will add it to the imports.
            // Oh, I can just use a generic fetch or we need to add the import. I will add the import at the top.
            const { updateWorkOrder } = await import('@/services/workOrderApi');
            await updateWorkOrder(wo._id, form);
            toast.success('Work Order updated');
            setEditing(false);
            load();
        } catch (e) {
            toast.error(e.response?.data?.message || e.message);
        } finally {
            setSaving(false);
        }
    };

    const inputStyle = {
        width: '100%', padding: '6px 10px', background: '#ffffff', border: '1px solid #d1d5db',
        borderRadius: '6px', color: '#1e293b', fontSize: '13px', outline: 'none'
    };

    const textileRows = isTextile ? [
        ['Design No', wo.textile?.designNo || '—'],
        ['Colour', wo.textile?.colour || '—'],
        ['Size', wo.textile?.size || '—'],
        ['Required Fabric (Meter)', wo.textile?.requiredFabricMeter || '—'],
        ['Fabric Item', wo.textile?.fabricItemName || '—'],
        ['Lot No', wo.textile?.lotNo || '—'],
        ['Than No', wo.textile?.thanNo || '—'],
        ['Roll No', wo.textile?.rollNo || '—'],
        ['Process Route', wo.textile?.processRoute || '—'],
        ['Assigned Vendor / Worker', wo.textile?.assignedVendorWorker || wo.supervisor || '—'],
    ] : [];

    const rows = [
        ['WO Number', wo.woNumber],
        ['Status', wo.woKind === 'supplementary' ? supplementaryDisplayStatus(wo) : wo.status],
        ...(wo.woKind === 'section' ? [
            ['Type', 'SECTION WORK ORDER'],
            ['Parent WO', wo.parentWorkOrderId?.woNumber || '—'],
            ['Section', wo.bomSectionName || '—'],
            ['Completed Qty', wo.completedQty ?? 0],
            ['Current Stage', wo.currentStageName || '—'],
        ] : []),
        ...(wo.woKind === 'supplementary' ? [
            ['Type', 'SUPPLEMENTARY WORK ORDER'],
            ['Linked Parent WO', wo.parentWorkOrderId?.woNumber || '—'],
            ['Linked Section WO', wo.sourceSectionWorkOrderId?.woNumber || '—'],
            ['Section', wo.bomSectionName || '—'],
            ['Reason', wo.supplementaryReason || 'Missing material received later and added to production'],
            ['Material Issue No.', wo.materialIssueNo || '—'],
            ['Qty to add', wo.targetQty],
        ] : []),
        ['BOM Version', wo.bomVersion || '—'],
        ['Finished Product', woProductDisplay(wo).productName],
        ['Model No.', woProductDisplay(wo).modelNo],
        ['Item Code', woProductDisplay(wo).itemCode],
        ...textileRows,
        [isTextile ? 'Order Qty (PCS)' : 'Target Qty', editing ? (
            <div>
                <input type="number" min="1" value={form.targetQty} onChange={e => set('targetQty', Number(e.target.value))} style={{ ...inputStyle, borderColor: hasStarted ? '#ef4444' : '#3b82f6' }} disabled={hasStarted} />
                {hasStarted && <div style={{ fontSize: '10px', color: '#ef4444', marginTop: '4px' }}>Cannot edit: Production started</div>}
            </div>
        ) : wo.targetQty],
        ['Priority', editing ? (
            <select value={form.priority} onChange={e => set('priority', e.target.value)} style={inputStyle}>
                {['Low', 'Medium', 'High', 'Urgent'].map(p => <option key={p}>{p}</option>)}
            </select>
        ) : wo.priority],
        ['Planned Start', editing ? <input type="date" value={form.plannedStart} onChange={e => set('plannedStart', e.target.value)} style={inputStyle} /> : fmt(wo.plannedStart)],
        ['Planned End', editing ? <input type="date" value={form.plannedEnd} onChange={e => set('plannedEnd', e.target.value)} style={inputStyle} /> : fmt(wo.plannedEnd)],
        ['Actual Start', fmt(wo.actualStart)],
        ['Actual End', fmt(wo.actualEnd)],
        ...(!isTextile ? [['Supervisor', editing ? <input type="text" value={form.supervisor} onChange={e => set('supervisor', e.target.value)} style={inputStyle} /> : (wo.supervisor || '—')]] : []),
        ['Remarks', editing ? <textarea value={form.remarks} onChange={e => set('remarks', e.target.value)} style={{ ...inputStyle, resize: 'vertical' }} /> : (wo.remarks || '—')],
        ['Created', fmt(wo.createdAt)],
    ];

    return (
        <div style={{ maxWidth: '800px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 700 }}>{isTextile ? 'Textile Job Order Details' : 'Work Order Details'}</h2>
                {wo.status !== 'Closed' && (
                    editing ? (
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <button onClick={() => setEditing(false)} disabled={saving} style={{ padding: '6px 12px', background: 'transparent', color: '#94a3b8', border: '1px solid #475569', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>Cancel</button>
                            <button onClick={handleSave} disabled={saving} style={{ padding: '6px 12px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}>{saving ? 'Saving...' : 'Save Changes'}</button>
                        </div>
                    ) : (
                        <button onClick={() => setEditing(true)} style={{ padding: '6px 12px', background: '#334155', color: '#f1f5f9', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}>Edit Details</button>
                    )
                )}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                {rows.map(([k, v]) => (
                    <div key={k} style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '14px 18px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                        <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, marginBottom: '4px' }}>{k}</div>
                        <div style={{ fontSize: '14px', color: '#1e293b', fontWeight: 500 }}>{v}</div>
                    </div>
                ))}
            </div>
            {wo.woKind === 'supplementary' && (
                <div style={{ marginTop: 20, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden' }}>
                    <div style={{ padding: '12px 16px', fontWeight: 800, color: '#1e293b', borderBottom: '1px solid #e5e7eb' }}>Issued missing components to add</div>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead>
                            <tr style={{ background: '#f8fafc', color: '#475569' }}>
                                {['Sr.', 'Item Code', 'Component Name', 'Original Missing Qty', 'Qty Issued / Added', 'Remaining Pending Qty', 'Remarks'].map((h) => (
                                    <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 700 }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {(wo.supplementaryMaterials || wo.materialStatus || []).map((m, i) => {
                                const src = (wo.sourceSectionWorkOrderId?.materialStatus || []).find((s) =>
                                    (m.materialId && String(s._id) === String(m.materialId))
                                    || (m.itemId && String(s.itemId) === String(m.itemId))
                                    || (m.itemCode && s.itemCode === m.itemCode)
                                );
                                const issued = m.qty ?? m.requiredQty ?? '—';
                                return (
                                <tr key={m._id || m.itemCode || i} style={{ borderTop: '1px solid #e5e7eb' }}>
                                    <td style={{ padding: '8px 12px' }}>{i + 1}</td>
                                    <td style={{ padding: '8px 12px', fontWeight: 700 }}>{m.itemCode || '—'}</td>
                                    <td style={{ padding: '8px 12px' }}>{m.itemName || '—'}</td>
                                    <td style={{ padding: '8px 12px' }}>{src?.requiredQty ?? issued}</td>
                                    <td style={{ padding: '8px 12px' }}>{issued}</td>
                                    <td style={{ padding: '8px 12px' }}>{src ? remainingToResolveOf(src) : '—'}</td>
                                    <td style={{ padding: '8px 12px' }}>{m.remarks || '—'}</td>
                                </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
            {!isTextile && wo.woKind !== 'section' && wo.woKind !== 'supplementary' && <WorkOrderSectionPanel wo={wo} load={load} />}
            {!isTextile && wo.woKind === 'section' && <SupplementaryWorkOrdersPanel wo={wo} />}
        </div>
    );
}

// ─── BOM & Material Tab ───────────────────────────────────────────────────────
function BomMaterialTab({ wo, load }) {
    const [updates, setUpdates] = useState({});
    const [saving, setSaving] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [sectionFilter, setSectionFilter] = useState('all');
    const [processFilter, setProcessFilter] = useState('all');
    const [pendingOpen, setPendingOpen] = useState(false);
    const isTextile = isTextileWorkOrder(wo);
    const showProcessSelect = !isTextile && wo.woKind !== 'supplementary';
    const isSection = wo.woKind === 'section' || wo.woKind === 'supplementary';
    const materialLocked = ['Closed', 'Cancelled', 'Completed'].includes(wo.status);
    const stockInputsDisabled = isSection || materialLocked;
    const mandatoryDisabled = materialLocked;
    const remarksDisabled = materialLocked;
    const canSaveMandatory = !materialLocked;
    const bomSections = wo.bomSections || wo.bomId?.sections || [];
    const showSectionFilter = !isSection && bomSections.length > 1;
    const sectionMaterials = (wo.materialStatus || []).filter((m) => {
        if (isSection) return true;
        if (sectionFilter === 'all') return true;
        return Number(m.sectionNo) === Number(sectionFilter);
    });
    const activeMaterials = isSection
        ? sectionMaterials.filter((m) => !isDeferredLine(m))
        : sectionMaterials;
    const pendingMaterials = isSection
        ? sectionMaterials.filter((m) => isDeferredLine(m))
        : [];
    const bomComponents = bomComponentsForProcessType(wo);
    const processTypeOf = (m) => resolveComponentProcessType(m, bomComponents);
    const matchProcessFilter = (m) => processFilter === 'all' || processTypeOf(m) === processFilter;
    const visibleActiveMaterials = activeMaterials.filter(matchProcessFilter);
    const visiblePendingMaterials = pendingMaterials.filter(matchProcessFilter);
    const unsavedDeferredCount = Object.values(updates).filter((v) => v && v.isMandatory === false).length;

    const setUpd = (id, k, v) => setUpdates(u => ({ ...u, [id]: { ...(u[id] || {}), [k]: v } }));

    const applyProcessSelection = (type, mode) => {
        const targets = sectionMaterials.filter((m) => processTypeOf(m) === type);
        if (!targets.length) {
            toast(`${type} components: none classified on this Work Order`);
            return;
        }
        setUpdates((prev) => {
            const next = { ...prev };
            for (const m of targets) {
                const checked = mode === 'available' ? isMaterialAvailableForSelect(m) : true;
                next[m._id] = { ...(next[m._id] || {}), isMandatory: checked };
            }
            return next;
        });
        const availableCount = targets.filter(isMaterialAvailableForSelect).length;
        toast.success(mode === 'available'
            ? `Selected available ${type} (${availableCount} of ${targets.length}). Save to apply.`
            : `Selected all ${type} (${targets.length}). Save to apply.`);
    };

    const save = async () => {
        const materialUpdates = Object.entries(updates).map(([materialId, vals]) => {
            if (!isSection) return { materialId, ...vals };
            const patch = { materialId };
            if (vals.isMandatory !== undefined) patch.isMandatory = vals.isMandatory;
            if (vals.remarks !== undefined) patch.remarks = vals.remarks;
            return patch;
        });
        if (!materialUpdates.length) return toast('No changes to save');
        setSaving(true);
        try {
            await updateMaterialStatus(wo._id, { materialUpdates });
            const deferredThisSave = materialUpdates.some((u) => u.isMandatory === false);
            toast.success(deferredThisSave && isSection
                ? 'Saved. Deferred components moved to Pending Material.'
                : 'Material status updated');
            setUpdates({});
            load();
        } catch (e) { toast.error(e.response?.data?.message || e.message); }
        finally { setSaving(false); }
    };

    const handleRestore = async (m) => {
        if (materialLocked) return;
        setSaving(true);
        try {
            await updateMaterialStatus(wo._id, { materialUpdates: [{ materialId: m._id, isMandatory: true }] });
            toast.success(`${m.itemName} restored to active list`);
            load();
        } catch (e) { toast.error(e.response?.data?.message || e.message); }
        finally { setSaving(false); }
    };

    const handleRefreshStock = async () => {
        setRefreshing(true);
        try {
            await refreshMaterialStock(wo._id);
            toast.success('Stock levels refreshed from Master');
            load();
        } catch (e) { toast.error(e.response?.data?.message || e.message); }
        finally { setRefreshing(false); }
    };

    const handleExportExcel = () => {
        const headers = ['Item', 'UOM', 'Required Qty', 'Available Qty', 'Short Qty', 'Mandatory', 'Material Status', 'Procurement Status', 'Remarks'];
        const rows = (isSection ? [...activeMaterials, ...pendingMaterials] : sectionMaterials).map(m => [
            `"${m.itemName}"`,
            `"${m.uom || ''}"`,
            m.requiredQty,
            m.availableStock,
            m.shortQty,
            m.isMandatory ? 'Yes' : (isDeferredLine(m) ? 'Deferred' : 'No'),
            `"${materialStatusLabel(m)}"`,
            `"${m.procurementStatus}"`,
            `"${displayMaterialRemark(m.remarks)}"`
        ]);
        const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `WO_${wo.woNumber}_BOM_Components.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleExportPdf = () => {
        const printWindow = window.open('', '', 'width=800,height=600');
        let tableHtml = `<table border="1" style="width:100%; border-collapse:collapse; font-family:sans-serif; font-size:12px;" cellpadding="5">
          <thead>
            <tr style="background:#f1f5f9; text-align:left;">
              <th>Item</th><th>UOM</th><th>Required</th><th>Available</th><th>Short</th><th>Mandatory</th><th>Material Status</th><th>Procurement</th><th>Remarks</th>
            </tr>
          </thead>
          <tbody>`;
        (isSection ? [...activeMaterials, ...pendingMaterials] : sectionMaterials).forEach(m => {
            tableHtml += `<tr>
              <td>${m.itemName}</td>
              <td>${m.uom || '-'}</td>
              <td>${m.requiredQty}</td>
              <td>${m.availableStock}</td>
              <td style="color:${m.shortQty > 0 ? 'red' : 'inherit'}"><strong>${m.shortQty}</strong></td>
              <td>${m.isMandatory ? 'Yes' : (isDeferredLine(m) ? 'Deferred' : 'No')}</td>
              <td>${materialStatusLabel(m)}</td>
              <td>${m.procurementStatus}</td>
              <td>${displayMaterialRemark(m.remarks)}</td>
            </tr>`;
        });
        tableHtml += `</tbody></table>`;

        printWindow.document.write(`
            <html>
                <head>
                    <title>WO BOM - ${wo.woNumber}</title>
                    <style>@media print { @page { margin: 1cm; } }</style>
                </head>
                <body style="padding:20px; font-family:sans-serif;">
                    <h2>BOM Components - ${wo.woNumber}</h2>
                    <div style="margin-bottom: 20px; font-size: 14px;">
                        <strong>Product:</strong> ${wo.finishedProductName || wo.finishedProductId?.name || wo.finishedProductId?.itemCode || '-'} <br/>
                        <strong>Target Qty:</strong> ${wo.targetQty || '-'} pcs<br/>
                    </div>
                    ${tableHtml}
                </body>
            </html>
        `);
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => {
            printWindow.print();
            printWindow.close();
        }, 250);
    };

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
                <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 700 }}>
                    {isSection && wo.bomSectionName ? `BOM Components — ${wo.bomSectionName}` : 'BOM Components & Availability'}
                </h2>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button onClick={handleExportExcel}
                        style={{ padding: '8px 16px', borderRadius: '8px', background: '#e2e8f0', color: '#475569', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        📥 Excel
                    </button>
                    <button onClick={handleExportPdf}
                        style={{ padding: '8px 16px', borderRadius: '8px', background: '#e2e8f0', color: '#475569', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        📥 PDF
                    </button>
                    {!materialLocked && (
                        <>
                    <button onClick={handleRefreshStock} disabled={refreshing}
                        style={{ padding: '8px 16px', borderRadius: '8px', background: '#334155', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {refreshing ? '↻ Refreshing...' : '↻ Refresh Stock'}
                    </button>
                    {canSaveMandatory && (
                    <button onClick={save} disabled={saving}
                        style={{ padding: '8px 16px', borderRadius: '8px', background: '#1d4ed8', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '13px' }}>
                        {saving ? 'Saving...' : 'Save Changes'}
                    </button>
                    )}
                        </>
                    )}
                </div>
            </div>
            {isSection && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
                    <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 8,
                        background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8,
                        padding: '8px 14px', fontSize: 13, fontWeight: 700, color: '#1e293b',
                    }}>
                        Section: {wo.bomSectionName || '—'} <span title="Locked to this Section Work Order">🔒</span>
                    </span>
                    <span style={{ fontSize: 11, color: '#94a3b8' }}>
                        Locked to this Section Work Order. Phase 1 does not reserve or consume stock here.
                    </span>
                </div>
            )}
            {showSectionFilter && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
                    <label style={{ fontSize: 12, fontWeight: 700, color: '#475569' }}>Section filter</label>
                    <select
                        value={sectionFilter}
                        onChange={(e) => setSectionFilter(e.target.value)}
                        style={{ ...inp, width: 220, cursor: 'pointer' }}
                    >
                        <option value="all">All Components</option>
                        {bomSections.map((sec) => (
                            <option key={sec.sectionNo} value={String(sec.sectionNo)}>
                                {sec.sectionName || `Section ${sec.sectionNo}`}
                            </option>
                        ))}
                    </select>
                    <span style={{ fontSize: 11, color: '#94a3b8' }}>Display only — does not change BOM Master.</span>
                </div>
            )}
            {showProcessSelect && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
                    <label style={{ fontSize: 12, fontWeight: 700, color: '#475569' }}>Process type</label>
                    <select
                        value={processFilter}
                        onChange={(e) => setProcessFilter(e.target.value)}
                        style={{ ...inp, width: 180, cursor: 'pointer' }}
                    >
                        <option value="all">All</option>
                        <option value="SMD">SMD</option>
                        <option value="TH">TH</option>
                        <option value="PCB">PCB</option>
                        <option value="OTHER">OTHER</option>
                        <option value="UNCLASSIFIED">UNCLASSIFIED</option>
                    </select>
                    <button
                        type="button"
                        disabled={mandatoryDisabled}
                        onClick={() => applyProcessSelection('SMD', 'all')}
                        style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #1d4ed8', background: '#eff6ff', color: '#1d4ed8', fontWeight: 700, fontSize: 12, cursor: mandatoryDisabled ? 'not-allowed' : 'pointer' }}
                    >Select All SMD</button>
                    <button
                        type="button"
                        disabled={mandatoryDisabled}
                        onClick={() => applyProcessSelection('TH', 'all')}
                        style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #1d4ed8', background: '#eff6ff', color: '#1d4ed8', fontWeight: 700, fontSize: 12, cursor: mandatoryDisabled ? 'not-allowed' : 'pointer' }}
                    >Select All TH</button>
                    <button
                        type="button"
                        disabled={mandatoryDisabled}
                        onClick={() => applyProcessSelection('SMD', 'available')}
                        style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #64748b', background: '#fff', color: '#334155', fontWeight: 700, fontSize: 12, cursor: mandatoryDisabled ? 'not-allowed' : 'pointer' }}
                    >Select Available SMD</button>
                    <button
                        type="button"
                        disabled={mandatoryDisabled}
                        onClick={() => applyProcessSelection('TH', 'available')}
                        style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #64748b', background: '#fff', color: '#334155', fontWeight: 700, fontSize: 12, cursor: mandatoryDisabled ? 'not-allowed' : 'pointer' }}
                    >Select Available TH</button>
                    <span style={{ fontSize: 11, color: '#94a3b8' }}>
                        Tick/untick is for this Work Order only. Unticked BOM-required items go to Pending Material on Save. Does not change BOM Master.
                    </span>
                </div>
            )}
            {isSection && (pendingMaterials.length > 0 || unsavedDeferredCount > 0) && (
                <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: 12, color: '#92400e' }}>
                    {pendingProceedWarning(pendingMaterials.length || unsavedDeferredCount)}
                    {unsavedDeferredCount > 0 && pendingMaterials.length === 0 ? ' Save Changes to move them out of the active list.' : ''}
                </div>
            )}
            <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead>
                        <tr style={{ background: '#f9fafb' }}>
                            {['Item', 'Type', 'UOM', 'Required Qty', 'Available Qty', 'Short Qty', 'Mandatory', 'Material Status', 'Procurement Status', 'Remarks'].map(h => (
                                <th key={h} style={{ padding: '10px 12px', textAlign: 'left', color: '#6b7280', fontWeight: 600, borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>{h}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {visibleActiveMaterials.map((m, i) => {
                            const upd = updates[m._id] || {};
                            const currentMandatory = upd.isMandatory !== undefined ? upd.isMandatory : m.isMandatory;
                            const isShort = m.shortQty > 0;
                            const deferredPreview = isBomRequiredLine(m) && currentMandatory === false;
                            const isMandShort = isShort && currentMandatory;
                            const statusText = materialStatusLabel(m, currentMandatory);
                            const statusColor = statusText === 'Available' ? '#15803d'
                                : statusText === 'Short' ? '#dc2626'
                                    : '#b45309';
                            return (
                                <tr key={m._id}
                                    style={{ background: isMandShort ? '#fff1f2' : deferredPreview ? '#fffbeb' : i % 2 === 0 ? '#ffffff' : '#f9fafb' }}>
                                    <td style={{ padding: '10px 12px', color: isMandShort ? '#dc2626' : '#374151', fontWeight: isMandShort || deferredPreview ? 600 : 400, borderBottom: '1px solid #e5e7eb' }}>
                                        {m.itemName}
                                        {isMandShort && <span style={{ marginLeft: '6px', fontSize: '10px', background: '#dc2626', color: '#fff', padding: '1px 5px', borderRadius: '3px' }}>SHORT</span>}
                                        {deferredPreview && <span style={{ marginLeft: '6px', fontSize: '10px', background: '#f59e0b', color: '#fff', padding: '1px 5px', borderRadius: '3px' }}>Will move to Pending</span>}
                                    </td>
                                    <td style={{ padding: '10px 12px', color: '#475569', fontWeight: 700, borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>{processTypeOf(m)}</td>
                                    <td style={{ padding: '10px 12px', color: '#6b7280', borderBottom: '1px solid #e5e7eb' }}>{m.uom || '—'}</td>
                                    <td style={{ padding: '10px 12px', color: '#1e293b', borderBottom: '1px solid #e5e7eb' }}>{m.requiredQty}</td>
                                    <td style={{ padding: '10px 12px', borderBottom: '1px solid #e5e7eb' }}>
                                        <input type="number" defaultValue={m.availableStock} disabled={stockInputsDisabled}
                                            onChange={e => setUpd(m._id, 'availableStock', Number(e.target.value))}
                                            style={{ ...inp, width: '80px' }} />
                                    </td>
                                    <td style={{ padding: '10px 12px', borderBottom: '1px solid #e5e7eb' }}>
                                        <input type="number" defaultValue={m.shortQty} disabled={stockInputsDisabled}
                                            onChange={e => setUpd(m._id, 'shortQty', Number(e.target.value))}
                                            style={{ ...inp, width: '70px', color: isShort ? '#dc2626' : '#1e293b' }} />
                                    </td>
                                    <td style={{ padding: '10px 12px', borderBottom: '1px solid #e5e7eb' }}>
                                        <input type="checkbox" checked={!!currentMandatory} disabled={mandatoryDisabled}
                                            onChange={e => setUpd(m._id, 'isMandatory', e.target.checked)} />
                                        {deferredPreview && (
                                            <div style={{ fontSize: 10, color: '#b45309', marginTop: 4, maxWidth: 160, lineHeight: 1.3 }}>
                                                Save to defer from active work
                                            </div>
                                        )}
                                    </td>
                                    <td style={{ padding: '10px 12px', borderBottom: '1px solid #e5e7eb', color: statusColor, fontWeight: 700, fontSize: 12, whiteSpace: 'nowrap' }}>
                                        {statusText}
                                    </td>
                                    <td style={{ padding: '10px 12px', borderBottom: '1px solid #e5e7eb' }}>
                                        <select defaultValue={m.procurementStatus} disabled={stockInputsDisabled}
                                            onChange={e => setUpd(m._id, 'procurementStatus', e.target.value)}
                                            style={{ ...inp, width: '140px', cursor: 'pointer' }}>
                                            {['Not Ordered', 'Ordered', 'In Transit', 'Received'].map(s => <option key={s}>{s}</option>)}
                                        </select>
                                    </td>
                                    <td style={{ padding: '10px 12px', borderBottom: '1px solid #e5e7eb' }}>
                                        <input type="text" value={upd.remarks !== undefined ? upd.remarks : displayMaterialRemark(m.remarks)}
                                            disabled={remarksDisabled}
                                            onChange={e => setUpd(m._id, 'remarks', e.target.value)}
                                            placeholder="Notes..." style={{ ...inp, width: '120px' }} />
                                    </td>
                                </tr>
                            );
                        })}
                        {!visibleActiveMaterials.length && (
                            <tr><td colSpan={10} style={{ padding: '32px', textAlign: 'center', color: '#64748b' }}>
                                {processFilter !== 'all' && activeMaterials.length
                                    ? `No ${processFilter} components in this view.`
                                    : (pendingMaterials.length ? 'No active components — restore pending material to continue this stage.' : 'No components in BOM')}
                            </td></tr>
                        )}
                    </tbody>
                </table>
            </div>
            {isSection && pendingMaterials.length > 0 && (
                <div style={{ marginTop: 16, border: '1px solid #fcd34d', borderRadius: 10, background: '#fffbeb', overflow: 'hidden' }}>
                    <button
                        type="button"
                        onClick={() => setPendingOpen((o) => !o)}
                        style={{
                            width: '100%', textAlign: 'left', padding: '12px 16px', background: 'none',
                            border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
                            fontSize: 13, fontWeight: 800, color: '#92400e',
                        }}
                    >
                        <span>{pendingOpen ? '▾' : '▸'}</span>
                        Pending Material ({pendingMaterials.length})
                        <span style={{ fontWeight: 500, color: '#b45309' }}>— hidden from active work, still required for final completion</span>
                    </button>
                    {pendingOpen && (
                        <div style={{ overflowX: 'auto', background: '#fff', borderTop: '1px solid #fde68a' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                                <thead>
                                    <tr style={{ background: '#fffbeb' }}>
                                        {['Item', 'Required Qty', 'Available Qty', 'Short Qty', 'Deferred Date', 'Remarks', 'Restore / Add Back'].map((h) => (
                                            <th key={h} style={{ padding: '10px 12px', textAlign: 'left', color: '#92400e', fontWeight: 700, borderBottom: '1px solid #fde68a', whiteSpace: 'nowrap' }}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {visiblePendingMaterials.map((m) => {
                                        const dt = deferredDateForMaterial(wo, m._id);
                                        return (
                                            <tr key={m._id}>
                                                <td style={{ padding: '10px 12px', borderBottom: '1px solid #f1f5f9', fontWeight: 600, color: '#1e293b' }}>{m.itemName}</td>
                                                <td style={{ padding: '10px 12px', borderBottom: '1px solid #f1f5f9' }}>{m.requiredQty}</td>
                                                <td style={{ padding: '10px 12px', borderBottom: '1px solid #f1f5f9' }}>{m.availableStock}</td>
                                                <td style={{ padding: '10px 12px', borderBottom: '1px solid #f1f5f9', color: m.shortQty > 0 ? '#dc2626' : '#1e293b', fontWeight: 700 }}>{m.shortQty}</td>
                                                <td style={{ padding: '10px 12px', borderBottom: '1px solid #f1f5f9', color: '#64748b' }}>{dt ? new Date(dt).toLocaleString() : '—'}</td>
                                                <td style={{ padding: '10px 12px', borderBottom: '1px solid #f1f5f9', color: '#475569' }}>{displayMaterialRemark(m.remarks) || '—'}</td>
                                                <td style={{ padding: '10px 12px', borderBottom: '1px solid #f1f5f9' }}>
                                                    <button
                                                        type="button"
                                                        disabled={materialLocked || saving}
                                                        onClick={() => handleRestore(m)}
                                                        style={{
                                                            padding: '6px 12px', borderRadius: 6, border: '1px solid #2563eb',
                                                            background: '#eff6ff', color: '#1d4ed8', fontWeight: 700, fontSize: 12,
                                                            cursor: materialLocked ? 'not-allowed' : 'pointer',
                                                        }}
                                                    >
                                                        Restore / Add Back
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

function SupplementaryWorkOrdersPanel({ wo }) {
    const navigate = useNavigate();
    const { selectedCompany } = useCompany();
    const [printingId, setPrintingId] = useState('');
    const rows = wo.supplementaryWorkOrders || [];

    const handlePrintRow = async (row) => {
        setPrintingId(row._id);
        try {
            const full = await getWorkOrderById(row._id);
            const html = buildSupplementaryWorkOrderPrintHtml({
                wo: full,
                companyName: selectedCompany?.companyName,
                company: selectedCompany,
                sourceSectionWo: wo,
            });
            openProductionSheetPrintWindow(html);
        } catch (e) {
            toast.error(e.response?.data?.message || e.message || 'Print failed');
        } finally {
            setPrintingId('');
        }
    };

    return (
        <div style={{ marginTop: 28, maxWidth: 900 }}>
            <h2 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 700 }}>Supplementary Work Orders</h2>
            <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 12px' }}>Late-material jobs linked to this Section WO. Not mixed with normal Section WO rows.</p>
            {rows.length === 0 ? (
                <div style={{ background: '#fff', border: '1px dashed #cbd5e1', borderRadius: 10, padding: 18, fontSize: 13, color: '#94a3b8' }}>No Supplementary Work Orders yet.</div>
            ) : (
                <div style={{ overflowX: 'auto', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10 }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                        <thead>
                            <tr style={{ background: '#eef2ff', color: '#3730a3' }}>
                                {['Supplementary WO No.', 'Component(s)', 'Qty Issued', 'Material Issue No.', 'Status', 'Created Date', 'Open', 'Print'].map((h) => (
                                    <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 700, whiteSpace: 'nowrap' }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((s) => (
                                <tr key={s._id} style={{ borderTop: '1px solid #e5e7eb' }}>
                                    <td style={{ padding: '8px 10px', fontWeight: 700 }}>{s.woNumber}</td>
                                    <td style={{ padding: '8px 10px' }}>{(s.supplementaryMaterials || []).map((m) => m.itemName || m.itemCode).join(', ') || '—'}</td>
                                    <td style={{ padding: '8px 10px' }}>{s.targetQty}</td>
                                    <td style={{ padding: '8px 10px' }}>{s.materialIssueNo || '—'}</td>
                                    <td style={{ padding: '8px 10px' }}>{s.displayStatus || supplementaryDisplayStatus(s)}</td>
                                    <td style={{ padding: '8px 10px' }}>{s.createdAt ? new Date(s.createdAt).toLocaleString() : '—'}</td>
                                    <td style={{ padding: '8px 10px' }}>
                                        <button type="button" onClick={() => navigate(PATHS.PRODUCTION.WO_DETAIL(s._id))} style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #4338ca', background: '#eef2ff', color: '#3730a3', fontWeight: 700, cursor: 'pointer' }}>Open</button>
                                    </td>
                                    <td style={{ padding: '8px 10px' }}>
                                        <button type="button" disabled={printingId === s._id} onClick={() => handlePrintRow(s)} style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #64748b', background: '#f8fafc', color: '#334155', fontWeight: 700, cursor: 'pointer' }}>{printingId === s._id ? '…' : 'Print'}</button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

function printMaterialIssueNote(batch, wo, company, issuedByFallback) {
    if (!batch?.issueNo) {
        toast.error('Material Issue was not saved. Print is not available.');
        return;
    }
    const createdBy = (batch?.createdBy && typeof batch.createdBy === 'object' && batch.createdBy.name)
        ? batch.createdBy
        : { name: issuedByFallback || '—' };
    const opened = openProductionSheetPrintPreview(buildLateMaterialIssueNoteHtml({
        batch: { ...batch, createdBy },
        wo,
        companyName: company?.companyName || '—',
        company,
    }));
    if (!opened) toast.error('Print preview was blocked. Allow pop-ups, then click Print Material Issue Note again.');
}

async function printSupplementaryWorkOrder(supWo, sectionWo, company) {
    if (!supWo?._id && !supWo?.woNumber) {
        toast.error('Supplementary Work Order was not saved. Print is not available.');
        return;
    }
    try {
        const full = supWo.stages ? supWo : await getWorkOrderById(supWo._id);
        const opened = openProductionSheetPrintPreview(buildSupplementaryWorkOrderPrintHtml({
            wo: full,
            companyName: company?.companyName || '—',
            company,
            sourceSectionWo: sectionWo,
        }));
        if (!opened) toast.error('Print preview was blocked. Allow pop-ups, then click Print Supplementary Work Order again.');
    } catch (e) {
        toast.error(e.response?.data?.message || e.message || 'Could not open Supplementary WO print.');
    }
}

function issuedByName(batch, fallback) {
    const by = batch?.createdBy;
    if (by && typeof by === 'object' && by.name) return by.name;
    return fallback || '—';
}

function MaterialIssueSuccessModal({ batch, wo, supplementaryWo, supplementaryDestinations, onClose, onPrint, onPrintSup, onOpenSup, startViewing = false, title }) {
    const { user } = useAuth();
    const [viewing, setViewing] = useState(startViewing);
    const autoPrintedRef = useRef(false);
    const lines = batch?.lines || [];
    const uniqueComponents = new Set(lines.map((l) => String(l.itemCode || l.itemName || ''))).size;
    const parentNo = batch?.parentWoNumber || (wo?.parentWorkOrderId && typeof wo.parentWorkOrderId === 'object' ? wo.parentWorkOrderId.woNumber : '') || '—';
    const sectionNo = batch?.sectionWoNumber || (wo?.woKind === 'section' ? wo.woNumber : wo?.woNumber) || '—';
    const issueDate = batch?.issueDate || batch?.createdAt;
    const dests = (supplementaryDestinations || []).filter((d) => d?.woNumber);
    const destLabel = dests.length
        ? dests.map((d) => `${d.woNumber}${d.materialCount ? ` — ${d.materialCount} material${d.materialCount === 1 ? '' : 's'}` : ''}${d.created ? ' (new)' : ''}`).join('\n')
        : (supplementaryWo?.woNumber || batch?.supplementaryWoNumber || '—');
    useEffect(() => {
        if (autoPrintedRef.current || !onPrintSup) return;
        const dest = dests[0] || supplementaryWo || (batch?.supplementaryWoNumber
            ? { _id: batch.supplementaryWorkOrderId, woNumber: batch.supplementaryWoNumber }
            : null);
        if (!dest) return;
        autoPrintedRef.current = true;
        onPrintSup(dest);
    }, [batch, dests, onPrintSup, supplementaryWo]);
    return modalShell(title || 'Material Issued Successfully', onClose, (
        <div>
            {!startViewing && (
            <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, padding: '12px 14px', marginBottom: 14, color: '#166534', fontWeight: 700 }}>
                Stock posting completed. Print uses the saved Material Issue only and will not deduct stock again.
            </div>
            )}
            {!viewing && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {[
                        ['Material Issue No.', batch?.issueNo || '—'],
                        ['Supplementary WO', destLabel],
                        ['Issue Date', issueDate ? new Date(issueDate).toLocaleString() : '—'],
                        ['Parent WO', parentNo],
                        ['Section WO', sectionNo],
                        ['Section', batch?.sectionName || wo?.bomSectionName || '—'],
                        ['Materials Added', String(uniqueComponents || lines.length)],
                        ['Total issue lines', String(lines.length)],
                        ['Issued By', issuedByName(batch, user?.name)],
                    ].map(([k, v]) => (
                        <div key={k} style={{ display: 'flex', gap: 12, padding: '6px 0', borderBottom: '1px solid #f1f5f9' }}>
                            <div style={{ width: 170, fontSize: 12, fontWeight: 700, color: '#64748b' }}>{k}</div>
                            <div style={{ fontSize: 14, fontWeight: 800, color: '#0f172a', whiteSpace: 'pre-line' }}>{v}</div>
                        </div>
                    ))}
                </div>
            )}
            {viewing && (
                <div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: '#1e293b', marginBottom: 8 }}>{batch?.issueNo} · read-only</div>
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                            <thead>
                                <tr style={{ background: '#f8fafc', color: '#475569' }}>
                                    {['Sr.', 'Item Code', 'Item Name', 'Required Qty', 'Qty Issued', 'Remaining Pending'].map((h) => (
                                        <th key={h} style={{ padding: '8px 6px', textAlign: 'left', fontWeight: 700 }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {lines.map((l, i) => (
                                    <tr key={`${l.itemCode}-${i}`} style={{ borderTop: '1px solid #e5e7eb' }}>
                                        <td style={{ padding: '8px 6px' }}>{i + 1}</td>
                                        <td style={{ padding: '8px 6px', fontWeight: 700 }}>{l.itemCode || '—'}</td>
                                        <td style={{ padding: '8px 6px' }}>{l.itemName || '—'}</td>
                                        <td style={{ padding: '8px 6px' }}>{l.requiredQty ?? '—'}</td>
                                        <td style={{ padding: '8px 6px' }}>{l.qtyIssued ?? '—'}</td>
                                        <td style={{ padding: '8px 6px' }}>{l.remainingAfter ?? '—'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    ), (
        <>
            {viewing && (
                <button type="button" onClick={() => setViewing(false)} style={{ padding: '8px 12px', borderRadius: 7, border: '1px solid #cbd5e1', background: '#fff', fontWeight: 700, cursor: 'pointer' }}>Back</button>
            )}
            <button type="button" onClick={onClose} style={{ padding: '8px 12px', borderRadius: 7, border: '1px solid #cbd5e1', background: '#fff', fontWeight: 700, cursor: 'pointer' }}>Close</button>
            {!viewing && (
                <button type="button" onClick={() => setViewing(true)} style={{ padding: '8px 12px', borderRadius: 7, border: '1px solid #4338ca', background: '#eef2ff', color: '#3730a3', fontWeight: 700, cursor: 'pointer' }}>View Material Issue</button>
            )}
            {onOpenSup && (supplementaryWo?._id || batch?.supplementaryWorkOrderId) && (
                <button type="button" onClick={onOpenSup} style={{ padding: '8px 12px', borderRadius: 7, border: '1px solid #4338ca', background: '#eef2ff', color: '#3730a3', fontWeight: 700, cursor: 'pointer' }}>Open Supplementary WO</button>
            )}
            <button
                type="button"
                onClick={onPrint}
                style={{ padding: '8px 12px', borderRadius: 7, border: '1px solid #1d4ed8', background: '#fff', color: '#1d4ed8', fontWeight: 700, cursor: 'pointer' }}
            >
                Print Material Issue Note
            </button>
            {dests.length > 1
                ? dests.map((d) => (
                    <button
                        key={String(d._id || d.woNumber)}
                        type="button"
                        onClick={() => onPrintSup(d)}
                        style={{ padding: '10px 16px', borderRadius: 7, border: 'none', background: '#1d4ed8', color: '#fff', fontWeight: 800, fontSize: 14, cursor: 'pointer' }}
                    >
                        Print Supplementary Work Order {d.woNumber?.replace(/^.*-(SUP\d+)$/i, '$1') || ''}
                    </button>
                ))
                : onPrintSup && (supplementaryWo?.woNumber || batch?.supplementaryWoNumber || dests[0]?.woNumber) && (
                <button
                    type="button"
                    onClick={() => onPrintSup(dests[0] || supplementaryWo)}
                    style={{ padding: '10px 16px', borderRadius: 7, border: 'none', background: '#1d4ed8', color: '#fff', fontWeight: 800, fontSize: 14, cursor: 'pointer' }}
                >
                    Print Supplementary Work Order
                </button>
            )}
        </>
    ), 'min(640px, 96vw)');
}

function PendingComponentsDrawer({ wo, items, open, onClose, load, setTab }) {
    const { selectedCompany } = useCompany();
    const { user } = useAuth();
    const [selectedId, setSelectedId] = useState(null);
    const [checkedIds, setCheckedIds] = useState([]);
    const [busy, setBusy] = useState('');
    const [addOpen, setAddOpen] = useState(false);
    const [supOpen, setSupOpen] = useState(false);
    const [histOpen, setHistOpen] = useState(false);
    const [bulkAddOpen, setBulkAddOpen] = useState(false);
    const [bulkSupOpen, setBulkSupOpen] = useState(false);
    const [issuedBatch, setIssuedBatch] = useState(null);
    const [supplementaryWo, setSupplementaryWo] = useState(null);
    const [supplementaryDestinations, setSupplementaryDestinations] = useState([]);
    const [supAfterIssueOpen, setSupAfterIssueOpen] = useState(false);
    const [confirmError, setConfirmError] = useState('');
    const issueIdempotencyKeyRef = useRef('');
    const navigate = useNavigate();
    const materialLocked = ['Closed', 'Cancelled', 'Completed'].includes(wo.status);
    const selected = selectedId ? items.find((m) => String(m._id) === String(selectedId)) : null;
    const selectableItems = items.filter((m) => remainingToResolveOf(m) > 0);
    const availableItems = selectableItems.filter((m) => (Number(m.availableStock) || 0) > 0);
    const checkedItems = selectableItems.filter((m) => checkedIds.includes(String(m._id)));
    const selectedCount = checkedItems.length;

    useEffect(() => {
        if (!open) {
            setSelectedId(null);
            setCheckedIds([]);
            setAddOpen(false);
            setSupOpen(false);
            setHistOpen(false);
            setBulkAddOpen(false);
            setBulkSupOpen(false);
            setIssuedBatch(null);
            setSupplementaryWo(null);
            setSupplementaryDestinations([]);
            setSupAfterIssueOpen(false);
            setConfirmError('');
            issueIdempotencyKeyRef.current = '';
        }
    }, [open]);

    useEffect(() => {
        if (selectedId && !items.some((m) => String(m._id) === String(selectedId))) {
            setSelectedId(null);
        }
        const live = new Set(items.filter((m) => remainingToResolveOf(m) > 0).map((m) => String(m._id)));
        setCheckedIds((prev) => prev.filter((id) => live.has(id)));
    }, [items, selectedId]);

    const toggleChecked = (m, on) => {
        if (remainingToResolveOf(m) <= 0) return;
        const id = String(m._id);
        setCheckedIds((prev) => {
            const has = prev.includes(id);
            if (on && !has) return [...prev, id];
            if (!on && has) return prev.filter((x) => x !== id);
            return prev;
        });
    };

    const handleRestore = async (m) => {
        if (materialLocked) return;
        setBusy('restore');
        try {
            await updateMaterialStatus(wo._id, { materialUpdates: [{ materialId: m._id, isMandatory: true }] });
            toast.success(`${m.itemName} restored to active list`);
            setSelectedId(null);
            load();
        } catch (e) { toast.error(e.response?.data?.message || e.message); }
        finally { setBusy(''); }
    };

    const handleRefreshStock = async () => {
        setBusy('stock');
        try {
            await refreshMaterialStock(wo._id);
            toast.success('Stock levels refreshed from Master');
            load();
        } catch (e) { toast.error(e.response?.data?.message || e.message); }
        finally { setBusy(''); }
    };

    if (!open) return null;

    const rowMeta = (m) => ({
        deferredAt: formatWhen(deferredDateForMaterial(wo, m._id)),
        deferredBy: deferredByForMaterial(wo, m._id),
        statusText: materialStatusLabel(m),
        remark: displayMaterialRemark(m.remarks) || '—',
        section: sectionLabelForMaterial(wo, m),
    });

    const btn = (label, onClick, extra = {}) => (
        <button
            type="button"
            onClick={onClick}
            disabled={!!busy || extra.disabled}
            style={{
                padding: '8px 12px', borderRadius: 7, border: extra.primary ? 'none' : '1px solid #cbd5e1',
                background: extra.primary ? '#1d4ed8' : '#fff', color: extra.primary ? '#fff' : '#334155',
                fontWeight: 700, fontSize: 12, cursor: extra.disabled || busy ? 'not-allowed' : 'pointer',
            }}
        >
            {label}
        </button>
    );

    return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000000, display: 'flex', justifyContent: 'flex-end' }}>
            <div onClick={onClose} style={{ flex: 1, background: 'rgba(15,23,42,0.35)' }} />
            <aside style={{ width: 'min(780px, 100vw)', height: '100%', background: '#fff', boxShadow: '-8px 0 24px rgba(0,0,0,0.12)', display: 'flex', flexDirection: 'column' }}>
                <div style={{ padding: '16px 18px', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', gap: 10 }}>
                    {selected && (
                        <button type="button" onClick={() => setSelectedId(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#2563eb', fontWeight: 700, fontSize: 13 }}>← Back</button>
                    )}
                    <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 15, fontWeight: 800, color: '#1e293b' }}>{selected ? (selected.itemCode || selected.itemName) : 'Pending Components'}</div>
                        <div style={{ fontSize: 12, color: '#64748b' }}>{selected ? 'Deferred / pending material detail' : `${items.length} deferred for this Work Order`}</div>
                    </div>
                    <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: '#64748b' }}>✕</button>
                </div>
                <div style={{ flex: 1, overflow: 'auto' }}>
                    {!selected && (
                        <div>
                            <div style={{ padding: '10px 12px', display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', borderBottom: '1px solid #fde68a', background: '#fffbeb' }}>
                                <button type="button" onClick={() => setCheckedIds(selectableItems.map((m) => String(m._id)))} style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #f59e0b', background: '#fff', color: '#92400e', fontWeight: 700, fontSize: 11, cursor: 'pointer' }}>Select All</button>
                                <button type="button" onClick={() => setCheckedIds(availableItems.map((m) => String(m._id)))} style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #f59e0b', background: '#fff', color: '#92400e', fontWeight: 700, fontSize: 11, cursor: 'pointer' }}>Select Available</button>
                                <button type="button" onClick={() => setCheckedIds([])} style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#fff', color: '#475569', fontWeight: 700, fontSize: 11, cursor: 'pointer' }}>Clear Selection</button>
                                <span style={{ fontSize: 12, fontWeight: 800, color: '#92400e' }}>{selectedCount} Selected</span>
                            </div>
                            <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                                <thead>
                                    <tr style={{ background: '#fffbeb', color: '#92400e' }}>
                                        {['', 'Item Code', 'Item Name', 'Section', 'Required Qty', 'Available Qty', 'Remaining To Resolve', 'Status'].map((h) => (
                                            <th key={h || 'chk'} style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 700, borderBottom: '1px solid #fde68a', whiteSpace: 'nowrap' }}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {items.map((m) => {
                                        const meta = rowMeta(m);
                                        const canSelect = remainingToResolveOf(m) > 0;
                                        const checked = canSelect && checkedIds.includes(String(m._id));
                                        return (
                                            <tr key={m._id} onClick={() => setSelectedId(m._id)} style={{ cursor: 'pointer', borderBottom: '1px solid #f1f5f9' }}>
                                                <td style={{ padding: '10px', width: 36 }} onClick={(e) => e.stopPropagation()}>
                                                    <input
                                                        type="checkbox"
                                                        disabled={!canSelect}
                                                        checked={checked}
                                                        onChange={(e) => toggleChecked(m, e.target.checked)}
                                                    />
                                                </td>
                                                <td style={{ padding: '10px', fontWeight: 700, color: '#1d4ed8' }}>{m.itemCode || '—'}</td>
                                                <td style={{ padding: '10px', color: '#1e293b' }}>{m.itemName || '—'}</td>
                                                <td style={{ padding: '10px', color: '#475569' }}>{meta.section}</td>
                                                <td style={{ padding: '10px' }}>{m.requiredQty ?? 0}</td>
                                                <td style={{ padding: '10px' }}>{m.availableStock ?? 0}</td>
                                                <td style={{ padding: '10px', fontWeight: 700 }}>{remainingToResolveOf(m)}</td>
                                                <td style={{ padding: '10px', color: '#b45309', fontWeight: 700, whiteSpace: 'nowrap' }}>{meta.statusText}</td>
                                            </tr>
                                        );
                                    })}
                                    {!items.length && (
                                        <tr><td colSpan={8} style={{ padding: 24, textAlign: 'center', color: '#64748b' }}>No pending components</td></tr>
                                    )}
                                </tbody>
                            </table>
                            </div>
                        </div>
                    )}
                    {selected && (() => {
                        const meta = rowMeta(selected);
                        const remainingAllocate = remainingToAllocateOf(selected);
                        const remainingResolve = remainingToResolveOf(selected);
                        const added = addedLaterQtyOf(selected);
                        const lateStatus = lateMaterialStatusOf(selected);
                        const sups = supplementaryRowsForMaterial(wo, selected);
                        const rows = [
                            ['Item Code', selected.itemCode || '—'],
                            ['Item Name', selected.itemName || '—'],
                            ['Section', meta.section],
                            ['Required Qty', selected.requiredQty ?? 0],
                            ['Added Later Qty', added],
                            ['Supplementary Allocated Qty', selected.supplementaryAllocatedQty ?? 0],
                            ['Supplementary Completed Qty', selected.supplementaryCompletedQty ?? 0],
                            ['Remaining To Allocate', remainingAllocate],
                            ['Remaining To Resolve', remainingResolve],
                            ['Available Stock', selected.availableStock ?? 0],
                            ['Short Qty', selected.shortQty ?? 0],
                            ['Procurement Status', selected.procurementStatus || '—'],
                            ['Remarks', meta.remark],
                            ['Status', lateStatus],
                        ];
                        if (meta.deferredAt) rows.push(['Deferred date/time', meta.deferredAt]);
                        if (meta.deferredBy) rows.push(['Deferred by', meta.deferredBy]);
                        return (
                            <div style={{ padding: 18 }}>
                                {rows.map(([k, v]) => (
                                    <div key={k} style={{ display: 'flex', gap: 12, padding: '8px 0', borderBottom: '1px solid #f1f5f9' }}>
                                        <div style={{ width: 170, fontSize: 12, fontWeight: 700, color: '#64748b' }}>{k}</div>
                                        <div style={{ flex: 1, fontSize: 13, color: '#1e293b', fontWeight: 600 }}>{v}</div>
                                    </div>
                                ))}
                                {sups.length > 0 && (
                                    <div style={{ marginTop: 14, padding: 12, background: '#eef2ff', borderRadius: 8 }}>
                                        <div style={{ fontSize: 12, fontWeight: 800, color: '#3730a3', marginBottom: 8 }}>Supplementary</div>
                                        {sups.map((s) => (
                                            <div key={s._id} style={{ fontSize: 12, color: '#312e81', marginBottom: 4 }}>
                                                {s.woNumber} · Qty: {(s.supplementaryMaterials || []).find((sm) => String(sm.materialId) === String(selected._id))?.qty ?? s.targetQty} · {s.status}
                                            </div>
                                        ))}
                                    </div>
                                )}
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 18 }}>
                                    {btn(busy === 'stock' ? 'Refreshing…' : 'Refresh Stock', handleRefreshStock)}
                                    {btn(busy === 'restore' ? 'Restoring…' : 'Restore / Add Back', () => handleRestore(selected), { disabled: materialLocked })}
                                    {btn('Material History', () => setHistOpen(true))}
                                </div>
                            </div>
                        );
                    })()}
                </div>
                {!selected && selectedCount > 0 && (
                    <div style={{ padding: '10px 12px', borderTop: '1px solid #e5e7eb', display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', background: '#f8fafc' }}>
                        <span style={{ fontSize: 13, fontWeight: 800, color: '#1e293b' }}>{selectedCount} Selected</span>
                        <button
                            type="button"
                            disabled={materialLocked || !!busy || wo.woKind !== 'section'}
                            onClick={() => {
                                setConfirmError('');
                                if (!issueIdempotencyKeyRef.current) {
                                    issueIdempotencyKeyRef.current = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-bulk`;
                                }
                                setBulkAddOpen(true);
                            }}
                            style={{ padding: '8px 12px', borderRadius: 7, border: 'none', background: '#1d4ed8', color: '#fff', fontWeight: 700, fontSize: 12, cursor: materialLocked || busy ? 'not-allowed' : 'pointer' }}
                        >
                            Add Missing Material to Product ({selectedCount})
                        </button>
                        <button type="button" onClick={() => setCheckedIds([])} style={{ padding: '8px 12px', borderRadius: 7, border: '1px solid #cbd5e1', background: '#fff', color: '#334155', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
                            Clear Selection
                        </button>
                    </div>
                )}
            </aside>
            {addOpen && selected && (
                <AddMaterialModal
                    wo={wo}
                    material={selected}
                    busy={busy === 'add'}
                    onClose={() => setAddOpen(false)}
                    onConfirm={async ({ qty, remarks }) => {
                        setBusy('add');
                        try {
                            const result = await addMaterialLater(wo._id, selected._id, {
                                qty,
                                remarks,
                                idempotencyKey: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${selected._id}`,
                            });
                            const batch = result?.batch;
                            if (!batch?.issueNo) {
                                toast.error(result?.message || 'Issue completed but Material Issue number was not returned. Print is not available.');
                                return;
                            }
                            setAddOpen(false);
                            setIssuedBatch(batch);
                        } catch (e) { toast.error(e.response?.data?.message || e.message); }
                        finally { setBusy(''); }
                    }}
                />
            )}
            {supOpen && selected && (
                <SupplementaryWoModal
                    wo={wo}
                    material={selected}
                    busy={busy === 'sup'}
                    onClose={() => setSupOpen(false)}
                    onConfirm={async (payload) => {
                        setBusy('sup');
                        try {
                            const created = await createSupplementaryWorkOrder(wo._id, payload);
                            toast.success(`Supplementary WO ${created.woNumber} created`);
                            setSupOpen(false);
                            load();
                        } catch (e) { toast.error(e.response?.data?.message || e.message); }
                        finally { setBusy(''); }
                    }}
                />
            )}
            {histOpen && selected && (
                <MaterialHistoryModal
                    wo={wo}
                    material={selected}
                    onClose={() => setHistOpen(false)}
                    onOpenTab={() => { setHistOpen(false); onClose(); setTab(5); }}
                />
            )}
            {bulkAddOpen && selectedCount > 0 && (
                <BulkAddMaterialModal
                    wo={wo}
                    materials={checkedItems}
                    busy={busy === 'bulk-add'}
                    confirmError={confirmError}
                    onClose={() => setBulkAddOpen(false)}
                    onConfirm={async (payload) => {
                        setBusy('bulk-add');
                        setConfirmError('');
                        try {
                            const items = payload.items || payload;
                            const refreshed = await refreshMaterialStock(wo._id);
                            const mats = refreshed?.materialStatus || [];
                            for (const item of items) {
                                const m = mats.find((x) => String(x._id) === String(item.materialId));
                                if (!m) {
                                    const msg = 'A selected component is no longer on this Work Order. No material was issued.';
                                    setConfirmError(msg);
                                    toast.error(msg);
                                    return;
                                }
                                const stock = Math.max(0, Number(m.availableStock) || 0);
                                const remaining = remainingToIssueOf(checkedItems.find((x) => String(x._id) === String(item.materialId)) || m);
                                const cap = Math.min(remaining, stock);
                                const qty = Number(item.qty);
                                if (!Number.isFinite(qty) || !(qty > 0)) {
                                    const msg = `${m.itemCode || m.itemName}: Qty To Add must be greater than 0. No material was issued.`;
                                    setConfirmError(msg);
                                    toast.error(msg);
                                    return;
                                }
                                if (qty > cap) {
                                    const msg = `${m.itemCode || m.itemName}: Qty To Add ${qty} exceeds ${cap} (remaining ${remaining}, stock ${stock}). No material was issued.`;
                                    setConfirmError(msg);
                                    toast.error(msg);
                                    return;
                                }
                            }
                            if (!issueIdempotencyKeyRef.current) {
                                issueIdempotencyKeyRef.current = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-bulk`;
                            }
                            const result = await addMissingMaterialToProduct(wo._id, {
                                items,
                                startFromSeq: payload.startFromSeq,
                                supervisor: payload.supervisor,
                                reason: payload.reason,
                                remarks: payload.remarks,
                                idempotencyKey: issueIdempotencyKeyRef.current,
                            });
                            const batch = result?.batch;
                            if (!batch?.issueNo) {
                                const msg = result?.message || 'Add completed but Material Issue number was not returned.';
                                setConfirmError(msg);
                                toast.error(msg);
                                return;
                            }
                            setBulkAddOpen(false);
                            setIssuedBatch(batch);
                            setSupplementaryDestinations(result.supplementaryDestinations || batch.destinations || []);
                            setSupplementaryWo(result.supplementaryWo || result.supplementaryDestinations?.[0] || (batch.supplementaryWoNumber
                                ? { _id: batch.supplementaryWorkOrderId, woNumber: batch.supplementaryWoNumber }
                                : null));
                            setSupAfterIssueOpen(false);
                        } catch (e) {
                            const msg = e.response?.data?.message || e.message;
                            setConfirmError(msg);
                            toast.error(msg);
                        }
                        finally { setBusy(''); }
                    }}
                />
            )}
            {issuedBatch?.issueNo && (
                <MaterialIssueSuccessModal
                    batch={issuedBatch}
                    wo={wo}
                    supplementaryWo={supplementaryWo}
                    supplementaryDestinations={supplementaryDestinations}
                    title="Missing Material Added Successfully"
                    onClose={() => {
                        setIssuedBatch(null);
                        setSupplementaryWo(null);
                        setSupplementaryDestinations([]);
                        setCheckedIds([]);
                        issueIdempotencyKeyRef.current = '';
                        load();
                    }}
                    onPrint={() => printMaterialIssueNote(issuedBatch, wo, selectedCompany, user?.name)}
                    onPrintSup={(dest) => printSupplementaryWorkOrder(dest || supplementaryWo || { _id: issuedBatch.supplementaryWorkOrderId, woNumber: issuedBatch.supplementaryWoNumber }, wo, selectedCompany)}
                    onOpenSup={() => {
                        const id = supplementaryWo?._id || supplementaryDestinations[0]?._id || issuedBatch.supplementaryWorkOrderId;
                        if (id) {
                            setIssuedBatch(null);
                            setSupplementaryWo(null);
                            setSupplementaryDestinations([]);
                            onClose();
                            navigate(PATHS.PRODUCTION.WO_DETAIL(id));
                        }
                    }}
                />
            )}
            {bulkSupOpen && selectedCount > 0 && (
                <BulkSupplementaryWoModal
                    wo={wo}
                    materials={checkedItems}
                    busy={busy === 'bulk-sup'}
                    onClose={() => setBulkSupOpen(false)}
                    onConfirm={async (payload) => {
                        setBusy('bulk-sup');
                        try {
                            const created = await createSupplementaryWorkOrderBulk(wo._id, payload);
                            toast.success(`Supplementary WO ${created.woNumber} created for ${payload.items.length} component(s)`);
                            setBulkSupOpen(false);
                            setCheckedIds([]);
                            load();
                        } catch (e) { toast.error(e.response?.data?.message || e.message); }
                        finally { setBusy(''); }
                    }}
                />
            )}
        </div>
    );
}

function modalShell(title, onClose, children, footer, width = 'min(520px, 96vw)') {
    return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000001, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(15,23,42,0.45)' }}>
            <div style={{ width, background: '#fff', borderRadius: 12, boxShadow: '0 16px 40px rgba(0,0,0,0.18)', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
                <div style={{ padding: '14px 18px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontWeight: 800, color: '#1e293b' }}>{title}</div>
                    <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#64748b' }}>✕</button>
                </div>
                <div style={{ padding: 18, overflow: 'auto' }}>{children}</div>
                {footer && <div style={{ padding: '12px 18px', borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>{footer}</div>}
            </div>
        </div>
    );
}

function AddMaterialModal({ wo, material, busy, onClose, onConfirm }) {
    const remainingAllocate = remainingToAllocateOf(material);
    const remainingResolve = remainingToResolveOf(material);
    const stock = Number(material.availableStock) || 0;
    const maxQty = Math.max(0, Math.min(remainingAllocate, stock));
    const [qty, setQty] = useState(maxQty || '');
    const [remarks, setRemarks] = useState('');
    const rows = [
        ['Work Order', wo.woNumber],
        ['Section', sectionLabelForMaterial(wo, material)],
        ['Component', material.itemCode ? `${material.itemCode} — ${material.itemName}` : material.itemName],
        ['Required Qty', material.requiredQty ?? 0],
        ['Already Added Qty', addedLaterQtyOf(material)],
        ['Remaining To Allocate', remainingAllocate],
        ['Remaining To Resolve', remainingResolve],
        ['Current Stock Available (display only)', stock],
    ];
    return modalShell('Issue Late Material', onClose, (
        <>
            <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 8, padding: '10px 12px', marginBottom: 12, fontSize: 12, color: '#92400e', fontWeight: 600, lineHeight: 1.45 }}>
                {LATE_MATERIAL_PROCESS_WARNING}
            </div>
            {rows.map(([k, v]) => (
                <div key={k} style={{ display: 'flex', gap: 12, padding: '6px 0', borderBottom: '1px solid #f1f5f9' }}>
                    <div style={{ width: 180, fontSize: 12, color: '#64748b', fontWeight: 700 }}>{k}</div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{v}</div>
                </div>
            ))}
            <label style={{ display: 'block', marginTop: 14, fontSize: 12, fontWeight: 700, color: '#334155' }}>Qty To Issue</label>
            <input type="number" min="0" step="any" value={qty} onChange={(e) => setQty(e.target.value)} style={inp} />
            <label style={{ display: 'block', marginTop: 10, fontSize: 12, fontWeight: 700, color: '#334155' }}>Remarks</label>
            <textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} style={{ ...inp, minHeight: 64 }} />
        </>
    ), (
        <>
            <button type="button" onClick={onClose} style={{ padding: '8px 12px', borderRadius: 7, border: '1px solid #cbd5e1', background: '#fff', fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
            <button
                type="button"
                disabled={busy}
                onClick={() => onConfirm({ qty: Number(qty), remarks })}
                style={{ padding: '8px 12px', borderRadius: 7, border: 'none', background: '#1d4ed8', color: '#fff', fontWeight: 700, cursor: 'pointer' }}
            >
                {busy ? 'Issuing…' : 'Confirm Issue Late Material'}
            </button>
        </>
    ));
}

function defaultLateMaterialQty(material) {
    const remaining = remainingToIssueOf(material);
    const stock = Math.max(0, Number(material.availableStock) || 0);
    return Math.max(0, Math.min(remaining, stock));
}

function issueDestinationGroups(materials = []) {
    const existing = [...new Set(materials.map((m) => m.existingSupplementaryWoNumber).filter(Boolean))];
    const assignedCount = materials.filter((m) => m.existingSupplementaryWoNumber).length;
    const unassignedCount = materials.filter((m) => !m.existingSupplementaryWoNumber).length;
    return { existing, needsNew: unassignedCount > 0, assignedCount, unassignedCount };
}

function canJoinExistingSupPreview(wo, existingWoNumber) {
    const sup = (wo.supplementaryWorkOrders || []).find((s) => s.woNumber === existingWoNumber);
    if (!sup) return false;
    if (sup.canAcceptLateMaterialAppend === false) return false;
    if (sup.canAcceptLateMaterialAppend !== true) {
        if (!['Draft', 'Released', 'Pending'].includes(String(sup.status || ''))) return false;
    }
    return true;
}

function BulkAddMaterialModal({ wo, materials, busy, onClose, onConfirm, confirmError }) {
    const [rows, setRows] = useState(() => materials.map((m) => ({
        materialId: m._id,
        qty: defaultLateMaterialQty(m) || '',
        remarks: '',
    })));
    const [supervisor, setSupervisor] = useState(wo.supervisor || '');
    const [reason, setReason] = useState('Missing material received later and added to production');
    const [headerRemarks, setHeaderRemarks] = useState('');
    const setRow = (id, patch) => setRows((prev) => prev.map((r) => (String(r.materialId) === String(id) ? { ...r, ...patch } : r)));
    const dest = issueDestinationGroups(materials);
    const reuseExisting = dest.existing.length === 1 && !dest.needsNew;
    const joinExisting = dest.existing.length === 1 && dest.needsNew && canJoinExistingSupPreview(wo, dest.existing[0]);
    const splitNew = dest.needsNew && !joinExisting && dest.assignedCount > 0;
    return modalShell(`Add Missing Material to Product (${materials.length})`, onClose, (
        <>
            <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 8, padding: '10px 12px', marginBottom: 12, fontSize: 12, color: '#92400e', fontWeight: 600, lineHeight: 1.45 }}>
                This adds the selected missing BOM components to this Work Order and deducts stock once. Existing Supplementary WOs are reused when safe. A new Supplementary WO is created only for materials that cannot join an existing one. It does not change BOM Master.
            </div>
            {reuseExisting ? (
                <div style={{ background: '#eef2ff', border: '1px solid #c7d2fe', borderRadius: 8, padding: '10px 12px', marginBottom: 12, fontSize: 12, color: '#3730a3', fontWeight: 700, lineHeight: 1.45 }}>
                    These materials already belong to {dest.existing[0]}. Stock will be deducted once and linked to that Supplementary WO. A new SUP will not be created.
                </div>
            ) : joinExisting ? (
                <div style={{ background: '#eef2ff', border: '1px solid #c7d2fe', borderRadius: 8, padding: '10px 12px', marginBottom: 12, fontSize: 12, color: '#3730a3', fontWeight: 700, lineHeight: 1.45 }}>
                    All selected materials will be linked to {dest.existing[0]}.
                </div>
            ) : splitNew ? (
                <div style={{ background: '#eef2ff', border: '1px solid #c7d2fe', borderRadius: 8, padding: '10px 12px', marginBottom: 12, fontSize: 12, color: '#3730a3', fontWeight: 700, lineHeight: 1.45 }}>
                    {materials.length} selected materials will be processed:
                    <div style={{ marginTop: 6, fontWeight: 600 }}>
                        • {dest.assignedCount} material{dest.assignedCount === 1 ? '' : 's'} will be linked to existing {dest.existing.join(', ')}
                    </div>
                    <div style={{ fontWeight: 600 }}>
                        • {dest.unassignedCount} material{dest.unassignedCount === 1 ? '' : 's'} will create a new Supplementary WO
                    </div>
                </div>
            ) : (
                <div style={{ background: '#eef2ff', border: '1px solid #c7d2fe', borderRadius: 8, padding: '10px 12px', marginBottom: 12, fontSize: 12, color: '#3730a3', fontWeight: 700, lineHeight: 1.45 }}>
                    A Supplementary WO will be created as a production instruction to add these issued missing components. No process-stage selection is required.
                </div>
            )}
            {confirmError ? (
                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 12px', marginBottom: 12, fontSize: 13, color: '#991b1b', fontWeight: 700, lineHeight: 1.45 }}>
                    {confirmError}
                </div>
            ) : null}
            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 10 }}>{wo.woNumber} · {wo.bomSectionName || 'Section'}</div>
            <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                        <tr style={{ background: '#f8fafc', color: '#475569' }}>
                            {['Item Code', 'Item Name', 'Section', 'Required Qty', 'Already Added/Issued Qty', 'Missing / Remaining Qty', 'Available Stock', 'Qty To Add', 'Remarks'].map((h) => (
                                <th key={h} style={{ padding: '8px 6px', textAlign: 'left', fontWeight: 700, whiteSpace: 'nowrap' }}>{h}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {materials.map((m) => {
                            const row = rows.find((r) => String(r.materialId) === String(m._id)) || {};
                            return (
                                <tr key={m._id} style={{ borderTop: '1px solid #e5e7eb' }}>
                                    <td style={{ padding: '8px 6px', fontWeight: 700 }}>{m.itemCode || '—'}</td>
                                    <td style={{ padding: '8px 6px' }}>{m.itemName || '—'}</td>
                                    <td style={{ padding: '8px 6px' }}>{sectionLabelForMaterial(wo, m)}</td>
                                    <td style={{ padding: '8px 6px' }}>{m.requiredQty ?? 0}</td>
                                    <td style={{ padding: '8px 6px' }}>{m.postedIssueQty ?? addedLaterQtyOf(m)}</td>
                                    <td style={{ padding: '8px 6px', fontWeight: 800 }}>{remainingToIssueOf(m)}</td>
                                    <td style={{ padding: '8px 6px' }}>{m.availableStock ?? 0}</td>
                                    <td style={{ padding: '8px 6px' }}>
                                        <input type="number" min="0" step="any" value={row.qty} onChange={(e) => setRow(m._id, { qty: e.target.value })} style={{ ...inp, width: 90, padding: 6 }} />
                                    </td>
                                    <td style={{ padding: '8px 6px' }}>
                                        <input value={row.remarks || ''} onChange={(e) => setRow(m._id, { remarks: e.target.value })} style={{ ...inp, width: 140, padding: 6 }} />
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
            <label style={{ display: 'block', marginTop: 14, fontSize: 12, fontWeight: 700, color: '#334155' }}>Supervisor</label>
            <input value={supervisor} onChange={(e) => setSupervisor(e.target.value)} style={inp} />
            <label style={{ display: 'block', marginTop: 10, fontSize: 12, fontWeight: 700, color: '#334155' }}>Reason</label>
            <input value={reason} onChange={(e) => setReason(e.target.value)} style={inp} />
            <label style={{ display: 'block', marginTop: 10, fontSize: 12, fontWeight: 700, color: '#334155' }}>Remarks</label>
            <textarea value={headerRemarks} onChange={(e) => setHeaderRemarks(e.target.value)} style={{ ...inp, minHeight: 64 }} />
        </>
    ), (
        <>
            <button type="button" onClick={onClose} style={{ padding: '8px 12px', borderRadius: 7, border: '1px solid #cbd5e1', background: '#fff', fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
            <button
                type="button"
                disabled={busy}
                onClick={() => onConfirm({
                    items: rows.map((r) => ({ materialId: r.materialId, qty: Number(r.qty), remarks: r.remarks || '' })),
                    supervisor,
                    reason,
                    remarks: headerRemarks,
                })}
                style={{ padding: '10px 16px', borderRadius: 7, border: 'none', background: '#1d4ed8', color: '#fff', fontWeight: 800, cursor: busy ? 'not-allowed' : 'pointer' }}
            >
                {busy ? 'Processing...' : reuseExisting ? `Add Material & Link ${dest.existing[0]}` : 'Add Material & Process Supplementary WO'}
            </button>
        </>
    ), 'min(1100px, 96vw)');
}

function AfterIssueSupModal({ wo, batch, busy, onClose, onConfirm }) {
    const stages = (wo.stages || []).filter((s) => !isNaStage(s));
    const defaultSeq = stages[0]?.seq || 1;
    const [startFromSeq, setStartFromSeq] = useState(defaultSeq);
    const [supervisor, setSupervisor] = useState(wo.supervisor || batch?.supervisor || '');
    const [remarks, setRemarks] = useState('');
    const [reason, setReason] = useState('Late material received and issued after original production started');
    const lines = batch?.lines || [];
    return modalShell('Create Supplementary Work Order', onClose, (
        <>
            <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, padding: '10px 12px', marginBottom: 12, fontSize: 12, color: '#166534', fontWeight: 700, lineHeight: 1.45 }}>
                Material Issue {batch?.issueNo} is posted and stock is already deducted. This Supplementary WO is process tracking only and will not deduct stock again.
            </div>
            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 10 }}>{wo.woNumber} · {wo.bomSectionName || 'Section'} · {lines.length} issued component(s)</div>
            <div style={{ overflowX: 'auto', marginBottom: 12 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                        <tr style={{ background: '#f8fafc', color: '#475569' }}>
                            {['Item Code', 'Item Name', 'Qty Issued'].map((h) => (
                                <th key={h} style={{ padding: '8px 6px', textAlign: 'left', fontWeight: 700 }}>{h}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {lines.map((l, i) => (
                            <tr key={`${l.itemCode}-${i}`} style={{ borderTop: '1px solid #e5e7eb' }}>
                                <td style={{ padding: '8px 6px', fontWeight: 700 }}>{l.itemCode || '—'}</td>
                                <td style={{ padding: '8px 6px' }}>{l.itemName || '—'}</td>
                                <td style={{ padding: '8px 6px' }}>{l.qtyIssued}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <label style={{ display: 'block', marginTop: 8, fontSize: 12, fontWeight: 700, color: '#334155' }}>Start From Stage *</label>
            <select value={startFromSeq} onChange={(e) => setStartFromSeq(Number(e.target.value))} style={inp}>
                {stages.map((s) => <option key={s.seq} value={s.seq}>#{s.seq} {s.stageName}</option>)}
            </select>
            <label style={{ display: 'block', marginTop: 10, fontSize: 12, fontWeight: 700, color: '#334155' }}>Reason</label>
            <input value={reason} onChange={(e) => setReason(e.target.value)} style={inp} />
            <label style={{ display: 'block', marginTop: 10, fontSize: 12, fontWeight: 700, color: '#334155' }}>Supervisor</label>
            <input value={supervisor} onChange={(e) => setSupervisor(e.target.value)} style={inp} />
            <label style={{ display: 'block', marginTop: 10, fontSize: 12, fontWeight: 700, color: '#334155' }}>Remarks</label>
            <textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} style={{ ...inp, minHeight: 64 }} />
        </>
    ), (
        <>
            <button type="button" onClick={onClose} style={{ padding: '8px 12px', borderRadius: 7, border: '1px solid #cbd5e1', background: '#fff', fontWeight: 700, cursor: 'pointer' }}>Skip for now</button>
            <button
                type="button"
                disabled={busy || !startFromSeq}
                onClick={() => onConfirm({ startFromSeq: Number(startFromSeq), supervisor, remarks, reason })}
                style={{ padding: '8px 12px', borderRadius: 7, border: 'none', background: '#1d4ed8', color: '#fff', fontWeight: 700, cursor: busy ? 'not-allowed' : 'pointer' }}
            >
                {busy ? 'Creating…' : 'Create Supplementary WO'}
            </button>
        </>
    ), 'min(720px, 96vw)');
}

function BulkSupplementaryWoModal({ wo, materials, busy, onClose, onConfirm }) {
    const stages = (wo.stages || []).filter((s) => !isNaStage(s));
    const defaultSeq = stages[0]?.seq || 1;
    const [startFromSeq, setStartFromSeq] = useState(defaultSeq);
    const [supervisor, setSupervisor] = useState(wo.supervisor || '');
    const [remarks, setRemarks] = useState('');
    const [reason, setReason] = useState('Pending material received later');
    const [rows, setRows] = useState(() => materials.map((m) => ({
        materialId: m._id,
        qty: remainingToAllocateOf(m) || '',
    })));
    const setRowQty = (id, qty) => setRows((prev) => prev.map((r) => (String(r.materialId) === String(id) ? { ...r, qty } : r)));
    return modalShell(`Create Supplementary WO (${materials.length})`, onClose, (
        <>
            <div style={{ background: '#eef2ff', border: '1px solid #c7d2fe', borderRadius: 8, padding: '10px 12px', marginBottom: 12, fontSize: 12, color: '#3730a3', fontWeight: 600, lineHeight: 1.45 }}>
                One Supplementary Work Order will include all selected components. Choose a common Start From Stage. Each line keeps its own Supplementary Qty. Phase 1 does not post stock or FG.
            </div>
            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 10 }}>{wo.woNumber} · {wo.bomSectionName || 'Section'} · {materials.length} selected</div>
            <div style={{ overflowX: 'auto', marginBottom: 12 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                        <tr style={{ background: '#f8fafc', color: '#475569' }}>
                            {['Item Code', 'Item Name', 'Required Qty', 'Remaining To Allocate', 'Remaining To Resolve', 'Supplementary Qty'].map((h) => (
                                <th key={h} style={{ padding: '8px 6px', textAlign: 'left', fontWeight: 700, whiteSpace: 'nowrap' }}>{h}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {materials.map((m) => {
                            const row = rows.find((r) => String(r.materialId) === String(m._id)) || {};
                            return (
                                <tr key={m._id} style={{ borderTop: '1px solid #e5e7eb' }}>
                                    <td style={{ padding: '8px 6px', fontWeight: 700 }}>{m.itemCode || '—'}</td>
                                    <td style={{ padding: '8px 6px' }}>{m.itemName || '—'}</td>
                                    <td style={{ padding: '8px 6px' }}>{m.requiredQty ?? 0}</td>
                                    <td style={{ padding: '8px 6px' }}>{remainingToAllocateOf(m)}</td>
                                    <td style={{ padding: '8px 6px' }}>{remainingToResolveOf(m)}</td>
                                    <td style={{ padding: '8px 6px' }}>
                                        <input type="number" min="0" step="any" value={row.qty} onChange={(e) => setRowQty(m._id, e.target.value)} style={{ ...inp, width: 90, padding: 6 }} />
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
            <label style={{ display: 'block', marginTop: 8, fontSize: 12, fontWeight: 700, color: '#334155' }}>Start From Stage</label>
            <select value={startFromSeq} onChange={(e) => setStartFromSeq(Number(e.target.value))} style={inp}>
                {stages.map((s) => <option key={s.seq} value={s.seq}>#{s.seq} {s.stageName}</option>)}
            </select>
            <label style={{ display: 'block', marginTop: 10, fontSize: 12, fontWeight: 700, color: '#334155' }}>Reason</label>
            <input value={reason} onChange={(e) => setReason(e.target.value)} style={inp} />
            <label style={{ display: 'block', marginTop: 10, fontSize: 12, fontWeight: 700, color: '#334155' }}>Supervisor</label>
            <input value={supervisor} onChange={(e) => setSupervisor(e.target.value)} style={inp} />
            <label style={{ display: 'block', marginTop: 10, fontSize: 12, fontWeight: 700, color: '#334155' }}>Remarks</label>
            <textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} style={{ ...inp, minHeight: 64 }} />
        </>
    ), (
        <>
            <button type="button" onClick={onClose} style={{ padding: '8px 12px', borderRadius: 7, border: '1px solid #cbd5e1', background: '#fff', fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
            <button
                type="button"
                disabled={busy}
                onClick={() => onConfirm({
                    startFromSeq: Number(startFromSeq),
                    supervisor,
                    remarks,
                    reason,
                    items: rows.map((r) => ({ materialId: r.materialId, qty: Number(r.qty) })),
                })}
                style={{ padding: '8px 12px', borderRadius: 7, border: 'none', background: '#4338ca', color: '#fff', fontWeight: 700, cursor: 'pointer' }}
            >
                {busy ? 'Creating…' : `Create Supplementary WO (${materials.length})`}
            </button>
        </>
    ), 'min(860px, 96vw)');
}

function SupplementaryWoModal({ wo, material, busy, onClose, onConfirm }) {
    const remaining = remainingToAllocateOf(material);
    const remainingResolve = remainingToResolveOf(material);
    const stages = (wo.stages || []).filter((s) => !isNaStage(s));
    const defaultSeq = stages[0]?.seq || 1;
    const [qty, setQty] = useState(remaining || '');
    const [startFromSeq, setStartFromSeq] = useState(defaultSeq);
    const [supervisor, setSupervisor] = useState(wo.supervisor || '');
    const [remarks, setRemarks] = useState('');
    const [reason, setReason] = useState('Pending material received later');
    const rows = [
        ['Linked Parent WO', wo.parentWorkOrderId?.woNumber || '—'],
        ['Linked Section WO', wo.woNumber],
        ['Section', wo.bomSectionName || '—'],
        ['Selected Component', material.itemCode ? `${material.itemCode} — ${material.itemName}` : material.itemName],
        ['Original Required Qty', material.requiredQty ?? 0],
        ['Already Resolved Qty', addedLaterQtyOf(material) + Math.max(0, Number(material.supplementaryCompletedQty) || 0)],
        ['Remaining To Allocate', remaining],
        ['Remaining To Resolve', remainingResolve],
        ['Status', 'Released'],
    ];
    return modalShell('Create Supplementary Work Order', onClose, (
        <>
            {rows.map(([k, v]) => (
                <div key={k} style={{ display: 'flex', gap: 12, padding: '6px 0', borderBottom: '1px solid #f1f5f9' }}>
                    <div style={{ width: 190, fontSize: 12, color: '#64748b', fontWeight: 700 }}>{k}</div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{v}</div>
                </div>
            ))}
            <label style={{ display: 'block', marginTop: 14, fontSize: 12, fontWeight: 700, color: '#334155' }}>Supplementary Qty</label>
            <input type="number" min="0" step="any" value={qty} onChange={(e) => setQty(e.target.value)} style={inp} />
            <label style={{ display: 'block', marginTop: 10, fontSize: 12, fontWeight: 700, color: '#334155' }}>Start From Stage</label>
            <select value={startFromSeq} onChange={(e) => setStartFromSeq(Number(e.target.value))} style={inp}>
                {stages.map((s) => <option key={s.seq} value={s.seq}>#{s.seq} {s.stageName}</option>)}
            </select>
            <label style={{ display: 'block', marginTop: 10, fontSize: 12, fontWeight: 700, color: '#334155' }}>Reason</label>
            <input value={reason} onChange={(e) => setReason(e.target.value)} style={inp} />
            <label style={{ display: 'block', marginTop: 10, fontSize: 12, fontWeight: 700, color: '#334155' }}>Supervisor</label>
            <input value={supervisor} onChange={(e) => setSupervisor(e.target.value)} style={inp} />
            <label style={{ display: 'block', marginTop: 10, fontSize: 12, fontWeight: 700, color: '#334155' }}>Remarks</label>
            <textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} style={{ ...inp, minHeight: 64 }} />
        </>
    ), (
        <>
            <button type="button" onClick={onClose} style={{ padding: '8px 12px', borderRadius: 7, border: '1px solid #cbd5e1', background: '#fff', fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
            <button
                type="button"
                disabled={busy}
                onClick={() => onConfirm({ materialId: material._id, qty: Number(qty), startFromSeq: Number(startFromSeq), supervisor, remarks, reason })}
                style={{ padding: '8px 12px', borderRadius: 7, border: 'none', background: '#4338ca', color: '#fff', fontWeight: 700, cursor: 'pointer' }}
            >
                {busy ? 'Creating…' : 'Create Supplementary WO'}
            </button>
        </>
    ));
}

function MaterialHistoryModal({ wo, material, onClose, onOpenTab }) {
    const events = [...(wo.materialEventHistory || [])]
        .filter((e) => String(e.materialId) === String(material._id) || (material.itemId && String(e.itemId) === String(material.itemId)))
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return modalShell('Material History', onClose, (
        <>
            {events.length === 0 ? (
                <div style={{ fontSize: 13, color: '#94a3b8' }}>No late-material events recorded for this component yet.</div>
            ) : events.map((e, i) => (
                <div key={e._id || i} style={{ padding: '10px 0', borderBottom: '1px solid #f1f5f9' }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>{e.eventType} · qty {e.qty} · allocate left {e.remainingToAllocateQty ?? e.remainingPendingQty} · resolve left {e.remainingToResolveQty ?? '—'}</div>
                    <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                        {e.createdAt ? new Date(e.createdAt).toLocaleString() : '—'}
                        {' · '}{e.createdBy?.name || '—'}
                        {e.supplementaryWoNumber ? ` · ${e.supplementaryWoNumber}` : ''}
                    </div>
                    {e.remarks ? <div style={{ fontSize: 12, color: '#475569', marginTop: 4 }}>{e.remarks}</div> : null}
                </div>
            ))}
        </>
    ), (
        <button type="button" onClick={onOpenTab} style={{ padding: '8px 12px', borderRadius: 7, border: '1px solid #cbd5e1', background: '#fff', fontWeight: 700, cursor: 'pointer' }}>Open full Material History tab</button>
    ));
}

// ─── Process Execution Tab ────────────────────────────────────────────────────
function ProcessExecutionTab({
    wo, load, setTab = () => {}, setWo,
    isSectionWo = false, pendingCount = 0, deferredResolved = false,
    onOpenPending = () => {}, onViewBom = () => {},
}) {
    const canEdit = ['Released', 'In Process', 'WIP – Waiting Material'].includes(wo.status);
    const sequenceIssues = getSequenceInconsistencies(wo.stages);

    return (
        <div>
            {sequenceIssues.length > 0 && (
                <div style={{ background: '#fff1f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#9f1239' }}>
                    <div style={{ fontWeight: 800, marginBottom: 4 }}>Process sequence inconsistency detected</div>
                    {sequenceIssues.map((iss) => (
                        <div key={iss.stage.seq}>
                            #{iss.stage.seq} {iss.stage.stageName} is {displayStageStatus(iss.stage)} while #{iss.previous.seq} {iss.previous.stageName} is {displayStageStatus(iss.previous)}. Admin review — records were not reset.
                        </div>
                    ))}
                    <div style={{ marginTop: 4, fontSize: 12 }}>New forward stages stay locked until transferable quantity is available from the earlier stage.</div>
                </div>
            )}
            {pendingCount > 0 && (
                <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#92400e', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                    <span style={{ flex: 1, cursor: 'pointer' }} onClick={onOpenPending}>{pendingProceedWarning(pendingCount)}</span>
                    {isSectionWo ? (
                        <PendingMaterialBannerActions
                            count={pendingCount}
                            onManage={onOpenPending}
                            onViewBom={onViewBom}
                        />
                    ) : (
                        <button
                            type="button"
                            onClick={onOpenPending}
                            style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid #f59e0b', background: '#fff', color: '#92400e', fontWeight: 800, fontSize: 12, cursor: 'pointer' }}
                        >
                            View Pending Components ({pendingCount})
                        </button>
                    )}
                </div>
            )}
            {deferredResolved && (
                <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#166534', fontWeight: 700 }}>
                    All deferred BOM material resolved.
                </div>
            )}
            {/* Stage Summary Grid — same wo.stages as Stage Execution */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px', marginBottom: '24px' }}>
                {(wo.stages || []).map(s => {
                    const display = displayStageStatus(s);
                    const sc = STAGE_STATUS_COLORS[display] || STAGE_STATUS_COLORS[s.status] || STAGE_STATUS_COLORS['Not Started'];
                    const blocker = getSequenceBlocker(wo.stages, s.seq);
                    const waiting = blocker?.reason === 'waiting';
                    const prev = getApplicablePreviousStage(wo.stages, s.seq);
                    const available = getAvailableFromPrevious(wo.stages, s.seq);
                    const ready = getReadyForNext(wo.stages, s.seq);
                    const next = getApplicableNextStage(wo.stages, s.seq);
                    return (
                        <div key={s.seq} style={{ background: '#ffffff', border: `1px solid ${waiting ? '#fde68a' : '#e5e7eb'}`, borderRadius: '10px', padding: '12px', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                <span style={{ fontSize: '11px', fontWeight: 700, color: '#64748b' }}>#{s.seq} {s.stageName}</span>
                                <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: sc.bg, color: sc.color }}>{display}</span>
                            </div>
                            {isNaStage(s) && (
                                <div style={{ fontSize: 10, fontWeight: 800, color: '#4338ca', marginBottom: 6 }}>
                                    Not Applicable — completed in original WO
                                </div>
                            )}
                            {waiting && (
                                <div style={{ fontSize: 10, fontWeight: 800, color: '#92400e', marginBottom: 6 }}>
                                    Waiting for output from {blocker.stageName}.
                                </div>
                            )}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                                    <span style={{ color: '#94a3b8' }}>Target Qty:</span>
                                    <span style={{ fontWeight: 700, color: '#1e293b' }}>{wo.targetQty || 0}</span>
                                </div>
                                {prev && (
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                                        <span style={{ color: '#94a3b8' }}>Available from {prev.stageName}:</span>
                                        <span style={{ fontWeight: 700, color: '#7c3aed' }}>{available}</span>
                                    </div>
                                )}
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                                    <span style={{ color: '#94a3b8' }}>Qty Started:</span>
                                    <span style={{ fontWeight: 700, color: '#2563eb' }}>{stageQtyStarted(s)}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                                    <span style={{ color: '#94a3b8' }}>Qty Completed:</span>
                                    <span style={{ fontWeight: 700, color: '#10b981' }}>{stageQtyCompleted(s)}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                                    <span style={{ color: '#94a3b8' }}>WIP Qty:</span>
                                    <span style={{ fontWeight: 700, color: '#f59e0b' }}>{stageWipQty(s)}</span>
                                </div>
                                {next && (
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                                        <span style={{ color: '#94a3b8' }}>Ready for {next.stageName}:</span>
                                        <span style={{ fontWeight: 700, color: '#0f766e' }}>{ready}</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            <h2 style={{ margin: '0 0 20px', fontSize: '16px', fontWeight: 700 }}>Stage Execution</h2>
            {!canEdit && (
                <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: '8px', padding: '12px 16px', marginBottom: '16px', color: '#92400e', fontSize: '13px' }}>
                    ⚠️ WO must be Released or In Process to update stages. Current status: <strong>{wo.status}</strong>
                </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {(wo.stages || []).map(stage => (
                    <StageCard key={stage.seq} stage={stage} wo={wo} woId={wo._id} targetQty={wo.targetQty} canEdit={canEdit} load={load} setWo={setWo} />
                ))}
            </div>
        </div>
    );
}

function StageCard({ stage, wo, woId, targetQty, canEdit, load, setWo }) {
    const display = displayStageStatus(stage);
    const sc = STAGE_STATUS_COLORS[display] || STAGE_STATUS_COLORS[stage.status] || STAGE_STATUS_COLORS['Not Started'];
    const blocker = getSequenceBlocker(wo.stages, stage.seq);
    const waiting = blocker?.reason === 'waiting';
    const sequenceLocked = isNaStage(stage) || waiting;
    const editable = canEdit && !sequenceLocked;
    const prevStage = getApplicablePreviousStage(wo.stages, stage.seq);
    const nextStage = getApplicableNextStage(wo.stages, stage.seq);
    const availableFromPrev = getAvailableFromPrevious(wo.stages, stage.seq);
    const readyForNext = getReadyForNext(wo.stages, stage.seq);
    const [open, setOpen] = useState(false);
    const [consumeOpen, setConsumeOpen] = useState(false);
    const [consumeRows, setConsumeRows] = useState([]);
    const [consumeBusy, setConsumeBusy] = useState(false);
    const consumeType = processTypeForStage(stage);
    const showStageConsume = !!consumeType && wo.woKind !== 'supplementary' && !isTextileWorkOrder(wo);
    const consumePending = showStageConsume
        ? (wo.materialStatus || []).filter((m) => resolveComponentProcessType(m, bomComponentsForProcessType(wo)) === consumeType && isDeferredLine(m)).length
        : 0;

    // Stage-level fields — inputQty / outputQty are Qty Started / Qty Completed
    const [form, setForm] = useState({
        status: stage.status,
        remarks: stage.remarks || '',
        inputQty: stageQtyStarted(stage),
        outputQty: stageQtyCompleted(stage),
    });

    useEffect(() => {
        setForm({
            status: stage.status,
            remarks: stage.remarks || '',
            inputQty: stageQtyStarted(stage),
            outputQty: stageQtyCompleted(stage),
        });
    }, [stage.status, stage.remarks, stage.inputQty, stage.outputQty, stage.seq]);

    // Backward compatibility & Logs init
    const productionLogs = stage.productionLogs || [];

    // New run log state
    const [newLog, setNewLog] = useState({
        date: new Date().toISOString().split('T')[0],
        shift: '',
        operator: '',
        inputQty: 0,
        outputQty: 0,
        reworkQty: 0,
        rejectionQty: 0,
        rejectionReason: '',
        qcPassedQty: 0,
        qcRejectedQty: 0,
        qcReworkQty: 0,
        missingComponents: [],
        remarks: ''
    });
    const [showNewLog, setShowNewLog] = useState(false);

    const [saving, setSaving] = useState(false);
    const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
    const setLog = (k, v) => setNewLog(l => ({ ...l, [k]: v }));

    // Derived totals using stage fields which are auto-calculated by backend anyway, but we show what is there
    const totalInput = stage.inputQty || 0;
    const totalOutput = stage.outputQty || 0;
    const totalRework = stage.reworkQty || 0;
    const totalRejection = stage.rejectionQty || 0;

    // New Production Math
    const pendingToStart = Math.max(0, targetQty - totalInput);

    const maxAllowedOutput = prevStage ? stageQtyCompleted(prevStage) : targetQty;
    const pendingOutput = Math.max(0, maxAllowedOutput - totalOutput);
    const additionalAvailable = availableFromPrev == null ? Math.max(0, targetQty - totalInput) : availableFromPrev;

    const balanceInProcess = Math.max(0, totalInput - totalOutput - totalRework - totalRejection);

    const save = async () => {
        if (!editable) {
            if (blocker) toast.error(cannotStartMessage(stage, blocker));
            return;
        }
        const started = Number(form.inputQty);
        const completed = Number(form.outputQty);
        if (!Number.isFinite(started) || !Number.isFinite(completed) || started < 0 || completed < 0) {
            toast.error('Enter a valid non-negative quantity');
            return;
        }
        if (completed > started) {
            toast.error(`Qty Completed (${completed}) cannot exceed Qty Started (${started}).`);
            return;
        }
        if (started > maxAllowedOutput) {
            toast.error(prevStage
                ? `Cannot start ${started} pcs in ${stage.stageName}. Only ${maxAllowedOutput} pcs have been completed in ${prevStage.stageName}.`
                : `Cannot start ${started} pcs in ${stage.stageName}. Target Qty is ${targetQty}.`);
            return;
        }
        if (completed > maxAllowedOutput) {
            toast.error(stage.seq === 1
                ? `Cannot exceed Target Qty (${targetQty}). Total is ${completed}.`
                : `Cannot exceed Previous Stage Output (${maxAllowedOutput}). Total is ${completed}.`);
            return;
        }
        if (nextStage && completed < stageQtyStarted(nextStage)) {
            toast.error(`Cannot reduce ${stage.stageName} completed quantity to ${completed} because ${stageQtyStarted(nextStage)} pcs have already started ${nextStage.stageName}.`);
            return;
        }
        if (form.status === 'Completed' && completed < (Number(targetQty) || 0)) {
            toast.error(`Cannot mark ${stage.stageName} Completed until ${targetQty} pcs are completed (currently ${completed}).`);
            return;
        }
        setSaving(true);
        try {
            const updated = await updateStage(woId, stage.seq, {
                status: form.status,
                remarks: form.remarks,
                inputQty: started,
                outputQty: completed,
            });
            toast.success(`${stage.stageName} updated`);
            setOpen(false);
            if (updated && typeof setWo === 'function') setWo(updated);
            else load();
        } catch (e) { toast.error(e.response?.data?.message || e.message); }
        finally { setSaving(false); }
    };

    const handleAddLog = async () => {
        if (!editable) {
            if (blocker) toast.error(cannotStartMessage(stage, blocker));
            return;
        }
        const nextStartedTotal = totalInput + (Number(newLog.inputQty) || 0);
        if (nextStartedTotal > maxAllowedOutput) {
            toast.error(prevStage
                ? `Cannot start ${nextStartedTotal} pcs in ${stage.stageName}. Only ${maxAllowedOutput} pcs have been completed in ${prevStage.stageName}.`
                : `Cannot start ${nextStartedTotal} pcs in ${stage.stageName}. Target Qty is ${targetQty}.`);
            return;
        }
        if (newLog.outputQty > pendingOutput) {
            toast.error(`Output Qty cannot exceed Pending Output (${pendingOutput})`);
            return;
        }

        setSaving(true);
        try {
            const res = await addProductionLog(woId, stage.seq, newLog);
            toast.success(res.message || 'Production logged!');
            setShowNewLog(false);
            setNewLog({
                date: new Date().toISOString().split('T')[0], shift: '', operator: '',
                inputQty: 0, outputQty: 0, reworkQty: 0, rejectionQty: 0, rejectionReason: '',
                qcPassedQty: 0, qcRejectedQty: 0, qcReworkQty: 0, missingComponents: [], remarks: ''
            });
            load();
        } catch (e) { toast.error(e.response?.data?.message || e.message); }
        finally { setSaving(false); }
    };

    const handleDeleteLog = async (logId) => {
        if (!window.confirm('Delete this production log?')) return;
        try {
            await deleteProductionLog(woId, stage.seq, logId);
            toast.success('Log deleted');
            load();
        } catch (e) { toast.error(e.response?.data?.message || e.message); }
    };

    return (
        <div style={{ background: '#ffffff', border: `1px solid #e5e7eb`, borderRadius: '12px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            {/* Stage header */}
            <div
                onClick={() => setOpen(o => !o)}
                style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '16px 20px', cursor: 'pointer' }}
            >
                <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: sc.bg, border: `2px solid ${sc.color}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: sc.color, fontWeight: 700, fontSize: '14px' }}>
                    {sc.icon}
                </div>
                <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '12px', color: '#475569' }}>#{stage.seq}</span>
                        <span style={{ fontWeight: 600, fontSize: '15px', color: '#1e293b' }}>{stage.stageName}</span>
                        {(stage.isQcGate || stage.isTestGate) && (
                            <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', background: '#f3e8ff', color: '#7e22ce', fontWeight: 700 }}>
                                {stage.isQcGate ? 'QC GATE' : 'TEST GATE'}
                            </span>
                        )}
                    </div>
                    <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px', display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
                        <span>Target: <strong style={{ color: '#1e293b' }}>{targetQty || 0}</strong></span>
                        {prevStage && (
                            <span>Available from {prevStage.stageName}: <strong style={{ color: '#7c3aed' }}>{availableFromPrev}</strong></span>
                        )}
                        <span>Started: <strong style={{ color: '#2563eb' }}>{totalInput}</strong></span>
                        <span>Completed: <strong style={{ color: '#10b981' }}>{totalOutput}</strong></span>
                        <span>WIP: <strong style={{ color: '#f59e0b' }}>{stageWipQty(stage)}</strong></span>
                        {nextStage && (
                            <span>Ready for {nextStage.stageName}: <strong style={{ color: '#0f766e' }}>{readyForNext}</strong></span>
                        )}
                        {additionalAvailable > 0 && (
                            <span>Additional available: <strong style={{ color: '#7c3aed' }}>{additionalAvailable}</strong></span>
                        )}
                    </div>
                    {showStageConsume && (
                        <div style={{ fontSize: '12px', color: '#334155', marginTop: 6 }}>
                            <strong>Material Consumption</strong>
                            {' · '}Stage Completed: {totalOutput}
                            {' · '}Material consumed for: {stage.materialConsumedForQty ?? 0} pcs
                            {' · '}Pending materials: {consumePending}
                            {stage.lastMaterialConsumptionAt ? ` · Last material posting: ${new Date(stage.lastMaterialConsumptionAt).toLocaleDateString()}` : ''}
                            <button
                                type="button"
                                onClick={async (e) => {
                                    e.stopPropagation();
                                    setConsumeBusy(true);
                                    try {
                                        const rows = await getStageMaterialConsumption(woId);
                                        setConsumeRows(Array.isArray(rows) ? rows.filter((r) => String(r.remarks || '').includes(` / ${consumeType} /`) || String(r.voucherType || '') === 'Stage Consumption') : []);
                                        setConsumeOpen(true);
                                    } catch (err) { toast.error(err.response?.data?.message || err.message); }
                                    finally { setConsumeBusy(false); }
                                }}
                                style={{ marginLeft: 8, padding: '2px 8px', borderRadius: 4, border: '1px solid #cbd5e1', background: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                            >{consumeBusy ? '…' : 'View Consumption'}</button>
                        </div>
                    )}
                    {isNaStage(stage) && (
                        <div style={{ fontSize: 12, fontWeight: 700, color: '#4338ca', marginTop: 4 }}>
                            Not Applicable — completed in original WO
                        </div>
                    )}
                    {waiting && blocker && (
                        <div style={{ fontSize: 12, fontWeight: 700, color: '#92400e', marginTop: 4 }}>
                            {completeBeforeHint(stage, blocker)}
                        </div>
                    )}
                </div>
                <span style={{ padding: '5px 12px', borderRadius: '20px', fontSize: '11px', fontWeight: 700, background: sc.bg, color: sc.color }}>{display}</span>
                <span style={{ color: '#334155', fontSize: '18px' }}>{open ? '▲' : '▼'}</span>
            </div>

            {/* Expanded edit form */}
            {open && (
                <div style={{ borderTop: '1px solid #f3f4f6', padding: '20px', background: '#ffffff' }}>

                    {/* Stage Level Info */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
                        <div>
                            <label style={{ fontSize: '11px', color: '#6b7280', display: 'block', marginBottom: '4px' }}>Status</label>
                            <select value={form.status} onChange={e => set('status', e.target.value)} disabled={!editable} style={{ ...inp, cursor: editable ? 'pointer' : 'not-allowed' }}>
                                <option value="Not Started">Not Started</option>
                                <option value="Running">In Progress</option>
                                <option value="Completed">Completed</option>
                                <option value="QC Hold">QC Hold</option>
                                <option value="Failed">Failed</option>
                                <option value="Rework">Rework</option>
                            </select>
                        </div>
                        <div>
                            <label style={{ fontSize: '11px', color: '#6b7280', display: 'block', marginBottom: '4px' }}>Qty Started</label>
                            <input type="number" min="0" value={form.inputQty} onChange={e => set('inputQty', e.target.value)} disabled={!editable} style={inp} />
                        </div>
                        <div>
                            <label style={{ fontSize: '11px', color: '#6b7280', display: 'block', marginBottom: '4px' }}>Qty Completed</label>
                            <input type="number" min="0" value={form.outputQty} onChange={e => set('outputQty', e.target.value)} disabled={!editable} style={inp} />
                        </div>
                    </div>

                    <div style={{ marginBottom: '16px' }}>
                        <label style={{ fontSize: '11px', color: '#6b7280', display: 'block', marginBottom: '4px' }}>Remarks</label>
                        <textarea rows={2} value={form.remarks} onChange={e => set('remarks', e.target.value)} style={{ ...inp, resize: 'vertical' }} disabled={!editable} />
                    </div>

                    {/* Aggregate Totals (Read Only) */}
                    <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', background: '#f9fafb', padding: '12px', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
                        <div style={{ flex: 1, textAlign: 'center' }}><div style={{ fontSize: '11px', color: '#94a3b8' }}>Available From Prev</div><div style={{ fontSize: '16px', fontWeight: 600, color: '#7c3aed' }}>{availableFromPrev == null ? (targetQty || 0) : availableFromPrev}</div></div>
                        <div style={{ width: '1px', background: '#e5e7eb' }}></div>
                        <div style={{ flex: 1, textAlign: 'center' }}><div style={{ fontSize: '11px', color: '#94a3b8' }}>Ready For Next</div><div style={{ fontSize: '16px', fontWeight: 600, color: '#0f766e' }}>{readyForNext}</div></div>
                        <div style={{ width: '1px', background: '#e5e7eb' }}></div>
                        <div style={{ flex: 1, textAlign: 'center' }}><div style={{ fontSize: '11px', color: '#94a3b8' }}>WIP</div><div style={{ fontSize: '16px', fontWeight: 600, color: '#f59e0b' }}>{stageWipQty(stage)}</div></div>
                        <div style={{ width: '1px', background: '#e5e7eb' }}></div>
                        <div style={{ flex: 1, textAlign: 'center' }}><div style={{ fontSize: '11px', color: '#94a3b8' }}>Total Started</div><div style={{ fontSize: '16px', fontWeight: 600, color: '#3b82f6' }}>{totalInput}</div></div>
                        <div style={{ width: '1px', background: '#e5e7eb' }}></div>
                        <div style={{ flex: 1, textAlign: 'center' }}><div style={{ fontSize: '11px', color: '#94a3b8' }}>Total Completed</div><div style={{ fontSize: '16px', fontWeight: 700, color: '#10b981' }}>{totalOutput}</div></div>
                        <div style={{ width: '1px', background: '#e5e7eb' }}></div>
                        <div style={{ flex: 1, textAlign: 'center' }}><div style={{ fontSize: '11px', color: '#f59e0b' }}>Balance / Pending</div><div style={{ fontSize: '16px', fontWeight: 600, color: '#f59e0b' }}>{balanceInProcess}</div></div>
                    </div>

                    {/* Execution Logs Table */}
                    <div style={{ marginBottom: '20px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                            <div style={{ fontSize: '13px', fontWeight: 600, color: '#374151' }}>Execution Runs ({productionLogs.length})</div>
                            {canEdit && !showNewLog && (
                                <button
                                    onClick={() => { if (editable) setShowNewLog(true); else if (blocker) toast.error(cannotStartMessage(stage, blocker)); }}
                                    disabled={!editable}
                                    style={{ padding: '4px 10px', background: editable ? '#334155' : '#e2e8f0', color: editable ? '#f1f5f9' : '#94a3b8', border: 'none', borderRadius: '4px', cursor: editable ? 'pointer' : 'not-allowed', fontSize: '11px', fontWeight: 600 }}
                                >+ Add Run Log</button>
                            )}
                        </div>

                        {productionLogs.length > 0 && (
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', marginBottom: '12px' }}>
                                <thead>
                                    <tr style={{ background: '#f8f9fa', color: '#6b7280', textAlign: 'left' }}>
                                        <th style={{ padding: '8px', borderBottom: '1px solid #e5e7eb' }}>Date</th>
                                        <th style={{ padding: '8px', borderBottom: '1px solid #e5e7eb' }}>Shift</th>
                                        <th style={{ padding: '8px', borderBottom: '1px solid #e5e7eb' }}>Operator</th>
                                        <th style={{ padding: '8px', borderBottom: '1px solid #e5e7eb' }}>Started</th>
                                        <th style={{ padding: '8px', borderBottom: '1px solid #e5e7eb' }}>Completed</th>
                                        <th style={{ padding: '8px', borderBottom: '1px solid #e5e7eb' }}>Pending</th>
                                        <th style={{ padding: '8px', borderBottom: '1px solid #e5e7eb' }}></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {productionLogs.map((l, i) => (
                                        <tr key={l._id || i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                            <td style={{ padding: '8px', color: '#1e293b', whiteSpace: 'nowrap' }}>{l.date ? new Date(l.date).toLocaleDateString() : '—'}</td>
                                            <td style={{ padding: '8px', color: '#6b7280' }}>{l.shift || '—'}</td>
                                            <td style={{ padding: '8px', color: '#6b7280' }}>{l.operator || '—'}</td>
                                            <td style={{ padding: '8px', color: '#2563eb', fontWeight: 500 }}>{l.inputQty}</td>
                                            <td style={{ padding: '8px', color: '#16a34a', fontWeight: 700 }}>{l.outputQty}</td>
                                            <td style={{ padding: '8px', color: '#f59e0b', fontWeight: 600 }}>{Math.max(0, l.inputQty - l.outputQty)}</td>
                                            <td style={{ padding: '8px' }}>
                                                {l.missingComponents?.length > 0 && (
                                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                                        {l.missingComponents.map((mc, idx) => (
                                                            <span key={idx} style={{ fontSize: '9px', background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', padding: '1px 6px', borderRadius: '4px' }}>
                                                                Short: {mc.itemName}
                                                            </span>
                                                        ))}
                                                    </div>
                                                )}
                                            </td>
                                            <td style={{ padding: '8px', textAlign: 'right' }}>
                                                {editable && l._id && (
                                                    <button onClick={() => handleDeleteLog(l._id)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '12px' }}>✕</button>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}

                        {/* Add Run Log Form */}
                        {showNewLog && (
                            <div style={{ background: '#f9fafb', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '16px' }}>
                                <div style={{ fontSize: '12px', fontWeight: 600, color: '#3b82f6', marginBottom: '12px', display: 'flex', justifyContent: 'space-between' }}>
                                    <span>New Production Run - {stage.stageName}</span>
                                    {stage.isQcGate && <span style={{ color: '#7e22ce' }}>[QC GATE MODE]</span>}
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '10px', marginBottom: '12px' }}>
                                    <div><label style={{ fontSize: '10px', color: '#94a3b8' }}>Date</label><input type="date" value={newLog.date} onChange={e => setLog('date', e.target.value)} style={{ ...inp, padding: '6px' }} /></div>
                                    <div><label style={{ fontSize: '10px', color: '#94a3b8' }}>Shift</label><input value={newLog.shift} onChange={e => setLog('shift', e.target.value)} placeholder="e.g. Morning" style={{ ...inp, padding: '6px' }} /></div>
                                    <div style={{ gridColumn: 'span 3' }}><label style={{ fontSize: '10px', color: '#94a3b8' }}>Operator Name</label><input value={newLog.operator} onChange={e => setLog('operator', e.target.value)} placeholder="Enter operator name..." style={{ ...inp, padding: '6px' }} /></div>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '15px', marginBottom: '12px', background: '#ffffff', padding: '15px', borderRadius: '8px', border: '1px solid #e5e7eb', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                                    <div><label style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>Qty Started</label><input type="number" min="0" value={newLog.inputQty} onChange={e => setLog('inputQty', Number(e.target.value))} style={{ ...inp, padding: '8px', fontSize: '14px', border: '1px solid #3b82f6' }} /></div>
                                    <div><label style={{ fontSize: '11px', color: '#16a34a', fontWeight: 700 }}>Qty Completed</label><input type="number" min="0" value={newLog.outputQty} onChange={e => setLog('outputQty', Number(e.target.value))} style={{ ...inp, padding: '8px', fontSize: '14px', border: '1px solid #16a34a' }} /></div>
                                    <div style={{ textAlign: 'center' }}>
                                        <label style={{ fontSize: '11px', color: '#f59e0b', fontWeight: 600 }}>Pending Qty</label>
                                        <div style={{ padding: '8px', fontSize: '18px', fontWeight: 700, color: '#f59e0b', background: '#fffbeb', borderRadius: '7px' }}>
                                            {Math.max(0, (newLog.inputQty || 0) - (newLog.outputQty || 0))}
                                        </div>
                                    </div>
                                </div>

                                <div style={{ display: 'none' }}>
                                    <input value={newLog.remarks} onChange={e => setLog('remarks', e.target.value)} />
                                    <input value={newLog.rejectionReason} onChange={e => setLog('rejectionReason', e.target.value)} />
                                </div>

                                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                    <button onClick={() => setShowNewLog(false)} disabled={saving} style={{ padding: '6px 12px', background: 'transparent', color: '#64748b', border: '1px solid #d1d5db', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>Cancel</button>
                                    <button onClick={handleAddLog} disabled={saving || !editable} style={{ padding: '6px 12px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '4px', cursor: editable ? 'pointer' : 'not-allowed', fontSize: '11px', fontWeight: 600 }}>{saving ? 'Saving...' : 'Save Run Log'}</button>
                                </div>
                            </div>
                        )}
                    </div>

                    {canEdit && (
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', borderTop: '1px solid #334155', paddingTop: '16px' }}>
                            <button onClick={() => setOpen(false)}
                                style={{ padding: '8px 16px', borderRadius: '7px', background: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0', cursor: 'pointer', fontWeight: 600, fontSize: '13px' }}>
                                Cancel
                            </button>
                            <button onClick={save} disabled={saving || !editable}
                                style={{ padding: '8px 18px', borderRadius: '7px', background: editable ? '#1d4ed8' : '#94a3b8', color: '#fff', border: 'none', cursor: editable ? 'pointer' : 'not-allowed', fontWeight: 600, fontSize: '13px' }}>
                                {saving ? 'Saving...' : 'Save Stage'}
                            </button>
                        </div>
                    )}
                </div>
            )}
            {consumeOpen && (
                <div
                    onClick={() => setConsumeOpen(false)}
                    style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
                >
                    <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 12, maxWidth: 720, width: '100%', maxHeight: '80vh', overflow: 'auto', padding: 18 }}>
                        <div style={{ fontWeight: 800, marginBottom: 10 }}>{stage.stageName} — Material Consumption</div>
                        <div style={{ fontSize: 12, color: '#64748b', marginBottom: 10 }}>Read-only StockLedger. Printing or viewing does not change stock.</div>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                            <thead>
                                <tr style={{ background: '#f8fafc' }}>
                                    {['Date', 'Item', 'Qty', 'Remarks'].map((h) => (
                                        <th key={h} style={{ textAlign: 'left', padding: '8px 6px' }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {consumeRows.map((r) => (
                                    <tr key={r._id} style={{ borderTop: '1px solid #e5e7eb' }}>
                                        <td style={{ padding: '8px 6px' }}>{r.date ? new Date(r.date).toLocaleString() : '—'}</td>
                                        <td style={{ padding: '8px 6px' }}>{r.itemCode} {r.itemName}</td>
                                        <td style={{ padding: '8px 6px' }}>{r.outQty}</td>
                                        <td style={{ padding: '8px 6px' }}>{r.remarks}</td>
                                    </tr>
                                ))}
                                {!consumeRows.length && (
                                    <tr><td colSpan={4} style={{ padding: 16, color: '#94a3b8' }}>No stage consumption posted yet.</td></tr>
                                )}
                            </tbody>
                        </table>
                        <button type="button" onClick={() => setConsumeOpen(false)} style={{ marginTop: 12, padding: '8px 12px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#fff', fontWeight: 700, cursor: 'pointer' }}>Close</button>
                    </div>
                </div>
            )}
        </div>
    );
}

// ─── QC & Testing Tab ─────────────────────────────────────────────────────────
function QcTestingTab({ wo, load, isTextile }) {
    const qcStages = (wo.stages || []).filter(s => s.isQcGate || (!isTextile && s.isTestGate));
    const canEdit = ['Released', 'In Process', 'WIP – Waiting Material'].includes(wo.status);

    return (
        <div>
            <h2 style={{ margin: '0 0 20px', fontSize: '16px', fontWeight: 700 }}>QC & Testing Gates</h2>
            {qcStages.length === 0 && (
                <div style={{ color: '#64748b', textAlign: 'center', padding: '40px' }}>No QC/Testing stages found</div>
            )}
            {qcStages.map(stage => (
                <QcStagePanel key={stage.seq} stage={stage} wo={wo} woId={wo._id} canEdit={canEdit} load={load} />
            ))}
        </div>
    );
}

function QcStagePanel({ stage, wo, woId, canEdit, load }) {
    const display = displayStageStatus(stage);
    const sc = STAGE_STATUS_COLORS[display] || STAGE_STATUS_COLORS[stage.status] || STAGE_STATUS_COLORS['Not Started'];
    const blocker = getSequenceBlocker(wo?.stages, stage.seq);
    const waiting = blocker?.reason === 'waiting';
    const editable = canEdit && !waiting && !isNaStage(stage);
    const [checklist, setChecklist] = useState(stage.checklist || []);
    const [testData, setTestData] = useState(stage.testData || {});
    const [saving, setSaving] = useState(false);
    const setCheck = (i, k, v) => setChecklist(cl => cl.map((c, idx) => idx === i ? { ...c, [k]: v } : c));
    const setTest = (k, v) => setTestData(t => ({ ...t, [k]: v }));

    const save = async () => {
        if (!editable) {
            if (blocker) toast.error(cannotStartMessage(stage, blocker));
            return;
        }
        setSaving(true);
        try {
            const allPassed = checklist.every(c => c.result === 'Pass');
            await updateStage(woId, stage.seq, {
                status: allPassed ? 'Completed' : 'QC Hold',
                checklist,
                ...(stage.isTestGate ? { testData } : {}),
            });
            toast.success(`${stage.stageName} saved`);
            load();
        } catch (e) { toast.error(e.response?.data?.message || e.message); }
        finally { setSaving(false); }
    };

    return (
        <div style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '20px', marginBottom: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: sc.bg, border: `2px solid ${sc.color}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: sc.color, fontWeight: 700 }}>
                    {sc.icon}
                </div>
                <div>
                    <span style={{ fontWeight: 700, fontSize: '15px', color: '#1e293b' }}>#{stage.seq} {stage.stageName}</span>
                    <span style={{ marginLeft: '8px', padding: '3px 8px', borderRadius: '10px', fontSize: '10px', fontWeight: 600, background: sc.bg, color: sc.color }}>{display}</span>
                    {blocker && (
                        <div style={{ fontSize: 12, fontWeight: 700, color: '#92400e', marginTop: 4 }}>
                            🔒 Locked — Waiting for #{blocker.seq} {blocker.stageName}
                        </div>
                    )}
                </div>
            </div>

            {/* Checklist */}
            {checklist.length > 0 && (
                <div style={{ marginBottom: '16px' }}>
                    <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 600, marginBottom: '10px' }}>CHECKLIST</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {checklist.map((c, i) => (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', background: '#f9fafb', padding: '10px 14px', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
                                <span style={{ flex: 1, fontSize: '13px', color: '#1e293b' }}>{c.item}</span>
                                <select value={c.result} onChange={e => setCheck(i, 'result', e.target.value)}
                                    disabled={!editable}
                                    style={{ padding: '5px 10px', background: '#1e293b', border: `1px solid ${c.result === 'Pass' ? '#10b981' : c.result === 'Fail' ? '#ef4444' : '#334155'}`, borderRadius: '6px', color: c.result === 'Pass' ? '#10b981' : c.result === 'Fail' ? '#ef4444' : '#94a3b8', cursor: 'pointer', fontWeight: 600, fontSize: '12px' }}>
                                    <option>Pending</option>
                                    <option>Pass</option>
                                    <option>Fail</option>
                                </select>
                                <input value={c.remarks} onChange={e => setCheck(i, 'remarks', e.target.value)}
                                    placeholder="Remarks" disabled={!editable}
                                    style={{ padding: '5px 10px', background: '#1e293b', border: '1px solid #334155', borderRadius: '6px', color: '#94a3b8', fontSize: '12px', width: '140px' }} />
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Test Data (for Dummy Load Testing) */}
            {stage.isTestGate && (
                <div style={{ marginBottom: '16px' }}>
                    <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 600, marginBottom: '10px' }}>TEST DATA</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                        {[
                            ['inputVoltageMin', 'Input Voltage Min (V)'],
                            ['inputVoltageMax', 'Input Voltage Max (V)'],
                            ['outputVoltage', 'Output Voltage (V)'],
                            ['outputCurrent', 'Output Current (A)'],
                            ['loadPercent', 'Load %'],
                            ['temperature', 'Temperature (°C)'],
                            ['burninMinutes', 'Burn-in (min)'],
                        ].map(([k, label]) => (
                            <div key={k}>
                                <label style={{ fontSize: '11px', color: '#64748b', display: 'block', marginBottom: '4px' }}>{label}</label>
                                <input type="number" value={testData[k] || ''} onChange={e => setTest(k, e.target.value)} disabled={!editable}
                                    style={inp} />
                            </div>
                        ))}
                        <div>
                            <label style={{ fontSize: '11px', color: '#64748b', display: 'block', marginBottom: '4px' }}>Result</label>
                            <select value={testData.result || 'Pending'} onChange={e => setTest('result', e.target.value)} disabled={!editable}
                                style={{ ...inp, cursor: 'pointer' }}>
                                <option>Pending</option><option>Pass</option><option>Fail</option>
                            </select>
                        </div>
                        <div>
                            <label style={{ fontSize: '11px', color: '#64748b', display: 'block', marginBottom: '4px' }}>Tester Name</label>
                            <input value={testData.testerName || ''} onChange={e => setTest('testerName', e.target.value)} disabled={!editable}
                                style={inp} />
                        </div>
                    </div>
                    <div style={{ marginTop: '10px' }}>
                        <label style={{ fontSize: '11px', color: '#64748b', display: 'block', marginBottom: '4px' }}>Result Summary</label>
                        <textarea rows={2} value={testData.resultSummary || ''} onChange={e => setTest('resultSummary', e.target.value)}
                            disabled={!editable} style={{ ...inp, resize: 'vertical' }} />
                    </div>
                </div>
            )}

            {canEdit && (
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button onClick={save} disabled={saving || !editable}
                        style={{ padding: '8px 18px', borderRadius: '8px', background: editable ? '#1d4ed8' : '#94a3b8', color: '#fff', border: 'none', cursor: editable ? 'pointer' : 'not-allowed', fontWeight: 600, fontSize: '13px' }}>
                        {saving ? 'Saving...' : 'Save & Auto-Evaluate'}
                    </button>
                </div>
            )}
        </div>
    );
}

// ─── WIP & Exceptions Tab ─────────────────────────────────────────────────────
function WipTab({ wo }) {
    const shortages = (wo.materialStatus || []).filter(m => m.shortQty > 0);
    const mandShortages = shortages.filter(m => m.isMandatory);
    const deferredShortages = shortages.filter(m => isDeferredLine(m));
    const fmt = (d) => d ? new Date(d).toLocaleDateString() : '—';

    return (
        <div>
            <h2 style={{ margin: '0 0 20px', fontSize: '16px', fontWeight: 700 }}>WIP & Exception Tracking</h2>

            {/* WIP Status Card */}
            <div style={{ background: wo.wip?.isOnHold ? '#1a0608' : '#1e293b', border: `1px solid ${wo.wip?.isOnHold ? '#dc2626' : '#334155'}`, borderRadius: '12px', padding: '20px', marginBottom: '20px' }}>
                <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                    <div style={{ fontSize: '32px' }}>{wo.wip?.isOnHold ? '⏸️' : '✅'}</div>
                    <div>
                        <div style={{ fontWeight: 700, fontSize: '15px', color: wo.wip?.isOnHold ? '#fca5a5' : '#6ee7b7' }}>
                            {wo.wip?.isOnHold ? 'WIP On Hold' : 'WIP Running Normally'}
                        </div>
                        {wo.wip?.holdReason && <div style={{ color: '#94a3b8', fontSize: '13px', marginTop: '4px' }}>{wo.wip.holdReason}</div>}
                        {wo.wip?.eta && <div style={{ color: '#64748b', fontSize: '12px', marginTop: '4px' }}>Expected ETA: {fmt(wo.wip.eta)}</div>}
                    </div>
                </div>
                {wo.wip?.missingMandatoryItems?.length > 0 && (
                    <div style={{ marginTop: '12px' }}>
                        <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '6px', fontWeight: 600 }}>MISSING MANDATORY ITEMS</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                            {wo.wip.missingMandatoryItems.map((it, i) => (
                                <span key={i} style={{ padding: '4px 10px', borderRadius: '20px', background: '#450a0a', color: '#fca5a5', fontSize: '12px', border: '1px solid #dc2626' }}>{it}</span>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Shortage Table */}
            {shortages.length > 0 ? (
                <div>
                    <div style={{ fontSize: '14px', fontWeight: 600, color: '#e2e8f0', marginBottom: '12px' }}>
                        All Shortages ({shortages.length} items)
                        {mandShortages.length > 0 && <span style={{ marginLeft: '8px', color: '#ef4444', fontSize: '12px' }}>⚠️ {mandShortages.length} mandatory</span>}
                        {deferredShortages.length > 0 && <span style={{ marginLeft: '8px', color: '#f59e0b', fontSize: '12px' }}>⏳ {deferredShortages.length} deferred</span>}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {shortages.map(m => (
                            <div key={m._id} style={{ display: 'flex', alignItems: 'center', gap: '12px', background: m.isMandatory ? '#1a0608' : '#1e293b', border: `1px solid ${m.isMandatory ? '#7f1d1d' : '#334155'}`, borderRadius: '8px', padding: '12px 16px' }}>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontWeight: 600, color: m.isMandatory ? '#fca5a5' : '#f1f5f9', fontSize: '14px' }}>{m.itemName}</div>
                                    <div style={{ color: '#64748b', fontSize: '12px' }}>Required: {m.requiredQty} | Available: {m.availableStock} | Short: {m.shortQty} | {m.procurementStatus}</div>
                                </div>
                                {m.isMandatory && <span style={{ padding: '3px 8px', borderRadius: '10px', background: '#450a0a', color: '#fca5a5', fontSize: '11px', fontWeight: 700, border: '1px solid #dc2626' }}>MANDATORY</span>}
                                {isDeferredLine(m) && <span style={{ padding: '3px 8px', borderRadius: '10px', background: '#78350f', color: '#fde68a', fontSize: '11px', fontWeight: 700, border: '1px solid #f59e0b' }}>DEFERRED — MATERIAL PENDING</span>}
                            </div>
                        ))}
                    </div>
                </div>
            ) : (
                <div style={{ background: '#052e16', border: '1px solid #16a34a', borderRadius: '10px', padding: '20px', textAlign: 'center', color: '#6ee7b7', fontSize: '14px' }}>
                    ✅ No material shortages — production can proceed normally!
                </div>
            )}

            {/* Stage Summary */}
            <div style={{ marginTop: '24px' }}>
                <div style={{ fontSize: '14px', fontWeight: 600, color: '#e2e8f0', marginBottom: '12px' }}>Rejection / Rework Summary</div>
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                        <thead>
                            <tr style={{ background: '#1e293b' }}>
                                {['Stage', 'Input', 'Output', 'Rework', 'Rejection', 'Reason'].map(h => (
                                    <th key={h} style={{ padding: '10px 12px', textAlign: 'left', color: '#64748b', fontWeight: 600, borderBottom: '1px solid #334155' }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {(wo.stages || []).filter(s => s.reworkQty > 0 || s.rejectionQty > 0).map(s => (
                                <tr key={s.seq} style={{ background: '#0f172a', borderBottom: '1px solid #1e293b' }}>
                                    <td style={{ padding: '10px 12px', color: '#f1f5f9' }}>{s.stageName}</td>
                                    <td style={{ padding: '10px 12px', color: '#94a3b8' }}>{s.inputQty}</td>
                                    <td style={{ padding: '10px 12px', color: '#94a3b8' }}>{s.outputQty}</td>
                                    <td style={{ padding: '10px 12px', color: '#a78bfa' }}>{s.reworkQty}</td>
                                    <td style={{ padding: '10px 12px', color: '#ef4444' }}>{s.rejectionQty}</td>
                                    <td style={{ padding: '10px 12px', color: '#64748b' }}>{s.rejectionReason || '—'}</td>
                                </tr>
                            ))}
                            {(wo.stages || []).filter(s => s.reworkQty > 0 || s.rejectionQty > 0).length === 0 && (
                                <tr><td colSpan={6} style={{ padding: '24px', textAlign: 'center', color: '#64748b' }}>No rejections or rework recorded</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

// ─── Material History Tab ───────────────────────────────────────────────────
function MaterialHistoryTab({ wo }) {
    const { selectedCompany } = useCompany();
    const { user } = useAuth();
    const navigate = useNavigate();
    const [historyIssue, setHistoryIssue] = useState(null);
    const lateEvents = [...(wo.materialEventHistory || [])].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    // Flatten all production logs from all stages that have missingComponents
    const history = (wo.stages || []).flatMap(s =>
        (s.productionLogs || []).filter(l => l.missingComponents?.length > 0).map(l => ({
            stageName: s.stageName,
            date: l.date,
            operator: l.operator,
            missing: l.missingComponents,
            remarks: l.remarks
        }))
    ).sort((a, b) => new Date(b.date) - new Date(a.date));
    const mandatoryHistory = [...(wo.mandatoryChangeHistory || [])].sort((a, b) => new Date(b.changedAt) - new Date(a.changedAt));

    return (
        <div style={{ maxWidth: '900px' }}>
            <h2 style={{ margin: '0 0 12px', fontSize: '16px', fontWeight: 700, color: '#1e293b' }}>Material Issue batches</h2>
            <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '16px', lineHeight: '1.5' }}>
                Posted late-material issues. Print is read-only and does not deduct stock.
            </p>
            {(wo.lateMaterialIssueBatches || []).length === 0 ? (
                <div style={{ background: '#ffffff', border: '1px dashed #cbd5e1', borderRadius: '12px', padding: '24px', textAlign: 'center', marginBottom: 28 }}>
                    <div style={{ fontSize: '13px', color: '#94a3b8' }}>No material issue batches posted on this Work Order.</div>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: 28 }}>
                    {(wo.lateMaterialIssueBatches || []).map((b) => (
                        <div key={b._id || b.issueNo} style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                            <div>
                                <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>{b.issueNo} · {(b.lines || []).length} Items · {b.status || 'Issued'}{b.supplementaryWoNumber ? ` · ${b.supplementaryWoNumber}` : ''}</div>
                                <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>{b.issueDate ? new Date(b.issueDate).toLocaleString() : '—'}</div>
                            </div>
                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                <button type="button" onClick={() => setHistoryIssue(b)} style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>View Issue</button>
                                <button type="button" onClick={() => printMaterialIssueNote(b, wo, selectedCompany, user?.name)} style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #1d4ed8', background: '#fff', color: '#1d4ed8', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>Print Issue Note</button>
                                {b.supplementaryWorkOrderId && (
                                    <button type="button" onClick={() => navigate(PATHS.PRODUCTION.WO_DETAIL(b.supplementaryWorkOrderId._id || b.supplementaryWorkOrderId))} style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #4338ca', background: '#eef2ff', color: '#3730a3', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>Open Supplementary WO</button>
                                )}
                                {(b.supplementaryWorkOrderId || b.supplementaryWoNumber) && (
                                    <button type="button" onClick={() => printSupplementaryWorkOrder({ _id: b.supplementaryWorkOrderId?._id || b.supplementaryWorkOrderId, woNumber: b.supplementaryWoNumber }, wo, selectedCompany)} style={{ padding: '6px 10px', borderRadius: 6, border: 'none', background: '#1d4ed8', color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>Print Supplementary WO</button>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
            <h2 style={{ margin: '0 0 12px', fontSize: '16px', fontWeight: 700, color: '#1e293b' }}>Late material history</h2>
            <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '16px', lineHeight: '1.5' }}>
                Append-only log of deferred, added-later, restored, and supplementary events. Prior rows are never overwritten.
            </p>
            {lateEvents.length === 0 ? (
                <div style={{ background: '#ffffff', border: '1px dashed #cbd5e1', borderRadius: '12px', padding: '24px', textAlign: 'center', marginBottom: 28 }}>
                    <div style={{ fontSize: '13px', color: '#94a3b8' }}>No late-material events recorded on this Work Order.</div>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: 28 }}>
                    {lateEvents.map((h, i) => (
                        <div key={h._id || i} style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '12px 16px' }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>{h.itemName || '—'} · {h.eventType}</div>
                            <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                                Qty {h.qty} · Remaining to allocate {h.remainingToAllocateQty ?? h.remainingPendingQty} · Remaining to resolve {h.remainingToResolveQty ?? '—'}
                                {h.supplementaryWoNumber ? ` · ${h.supplementaryWoNumber}` : ''}
                                {' · '}{h.createdAt ? new Date(h.createdAt).toLocaleString() : '—'}
                                {' · '}{h.createdBy?.name || '—'}
                            </div>
                            {h.remarks ? <div style={{ fontSize: 12, color: '#475569', marginTop: 6 }}>{h.remarks}</div> : null}
                        </div>
                    ))}
                </div>
            )}
            <h2 style={{ margin: '0 0 12px', fontSize: '16px', fontWeight: 700, color: '#1e293b' }}>Mandatory change history</h2>
            <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '16px', lineHeight: '1.5' }}>
                Work Order Mandatory tick/untick only. Original BOM requirement is not overwritten.
            </p>
            {mandatoryHistory.length === 0 ? (
                <div style={{ background: '#ffffff', border: '1px dashed #cbd5e1', borderRadius: '12px', padding: '24px', textAlign: 'center', marginBottom: 28 }}>
                    <div style={{ fontSize: '13px', color: '#94a3b8' }}>No Mandatory checkbox changes recorded on this Work Order.</div>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: 28 }}>
                    {mandatoryHistory.map((h, i) => (
                        <div key={h._id || i} style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '12px 16px' }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>{h.itemName || '—'}</div>
                            <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                                {h.previousMandatory ? 'Mandatory' : 'Deferred'} → {h.newMandatory ? 'Mandatory' : 'Deferred'}
                                {' · '}{h.changedAt ? new Date(h.changedAt).toLocaleString() : '—'}
                                {' · '}{h.changedBy?.name || '—'}
                            </div>
                            {h.remarks ? <div style={{ fontSize: 12, color: '#475569', marginTop: 6 }}>{h.remarks}</div> : null}
                        </div>
                    ))}
                </div>
            )}
            <h2 style={{ margin: '0 0 20px', fontSize: '16px', fontWeight: 700, color: '#1e293b' }}>Missing Component History</h2>
            <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '24px', lineHeight: '1.5' }}>
                This is a permanent traceability log of components that were reported as missing during specific production stages.
                Even if materials are later received, this record preserves the state of the assembly at each run.
            </p>

            {history.length === 0 ? (
                <div style={{ background: '#ffffff', border: '1px dashed #cbd5e1', borderRadius: '12px', padding: '60px', textAlign: 'center' }}>
                    <div style={{ fontSize: '24px', marginBottom: '12px' }}>📋</div>
                    <div style={{ fontSize: '14px', color: '#94a3b8', fontWeight: 500 }}>No missing components recorded in any production runs.</div>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    {history.map((h, i) => (
                        <div key={i} style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '20px', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', paddingBottom: '12px', borderBottom: '1px solid #f1f5f9' }}>
                                <div>
                                    <div style={{ fontSize: '14px', fontWeight: 800, color: '#1e293b' }}>{h.stageName}</div>
                                    <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                                        Registered on {new Date(h.date).toLocaleDateString()} by <strong>{h.operator || 'Unknown Operator'}</strong>
                                    </div>
                                </div>
                                <span style={{ fontSize: '10px', background: '#fffbeb', color: '#92400e', padding: '4px 10px', borderRadius: '20px', fontWeight: 700, border: '1px solid #fde68a', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                    Run Shortage
                                </span>
                            </div>

                            <div style={{ display: 'grid', gap: '10px' }}>
                                {h.missing.map((it, idx) => (
                                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', padding: '12px 16px', borderRadius: '8px', border: '1px solid #f1f5f9' }}>
                                        <div>
                                            <div style={{ fontSize: '13px', fontWeight: 600, color: '#334155' }}>{it.itemName}</div>
                                            <div style={{ fontSize: '11px', color: '#94a3b8', fontFamily: 'monospace' }}>{it.itemCode}</div>
                                        </div>
                                        <div style={{ textAlign: 'right' }}>
                                            <div style={{ fontSize: '13px', fontWeight: 700, color: '#ef4444' }}>Qty: {it.quantity}</div>
                                            <div style={{ fontSize: '10px', color: '#94a3b8' }}>Missing pcs</div>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {h.remarks && (
                                <div style={{ marginTop: '16px', background: '#f1f5f9', padding: '10px 14px', borderRadius: '6px', fontSize: '12px', color: '#475569', display: 'flex', gap: '8px' }}>
                                    <span style={{ opacity: 0.6 }}>💬</span>
                                    <span>{h.remarks}</span>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
            {historyIssue?.issueNo && (
                <MaterialIssueSuccessModal
                    batch={historyIssue}
                    wo={wo}
                    startViewing
                    title="Material Issue"
                    onClose={() => setHistoryIssue(null)}
                    onPrint={() => printMaterialIssueNote(historyIssue, wo, selectedCompany, user?.name)}
                />
            )}
        </div>
    );
}
