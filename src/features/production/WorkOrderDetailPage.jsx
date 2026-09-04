import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
    getWorkOrderById, releaseWorkOrder, updateWorkOrder, updateStage, updateMaterialStatus, refreshMaterialStock,
    addProductionLog, deleteProductionLog, cancelSectionWorkOrder
} from '@/services/workOrderApi';
import { PATHS } from '@/routes/paths';
import { useCompany } from '@/contexts/CompanyContext';
import { isTextileIndustryCompany } from '@/utils/industryInventoryLabels';
import { getWorkOrderLabels, isTextileWorkOrder } from '@/utils/textileWorkOrder';
import toast from 'react-hot-toast';
import WorkOrderSectionPanel from '@/features/production/WorkOrderSectionPanel';
import {
    buildProductionSheetPrintHtml,
    openProductionSheetPrintWindow,
    isSectionWorkOrderForPrint,
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
};

const STAGE_STATUS_COLORS = {
    'Not Started': { color: '#000000', bg: '#e2e8f0', icon: '○' },
    'Running': { color: '#000000', bg: '#fde68a', icon: '▶' },
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

function pendingProceedWarning(count) {
    const n = Number(count) || 0;
    const noun = n === 1 ? 'component is' : 'components are';
    return `${n} ${noun} pending. Production may proceed temporarily.`;
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

    const load = useCallback(() => {
        getWorkOrderById(id)
            .then(setWo)
            .catch(() => toast.error('Failed to load Work Order'))
            .finally(() => setLoading(false));
    }, [id]);

    useEffect(() => { load(); }, [load]);

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

    if (loading) return <BrandedLoader size={120} />;
    if (!wo) return <div style={{ padding: '60px', textAlign: 'center', color: '#ef4444', background: '#f8f9fa', minHeight: '100vh' }}>Work Order not found</div>;

    const isTextile = isTextileWorkOrder(wo) || isTextileIndustryCompany(selectedCompany);
    const labels = getWorkOrderLabels(isTextile);
    const TABS = isTextile ? TEXTILE_TABS : ELECTRONICS_TABS;

    const handlePrintProductionSheet = () => {
        const html = buildProductionSheetPrintHtml({
            wo,
            companyName: selectedCompany?.companyName,
            isTextile,
        });
        openProductionSheetPrintWindow(html);
    };

    const sc = WO_STATUS_COLORS[wo.status] || WO_STATUS_COLORS['Draft'];
    const pct = wo.stages?.length ? Math.round((wo.stages.filter(s => s.status === 'Completed').length / wo.stages.length) * 100) : 0;
    const unresolvedRequired = (wo.materialStatus || []).filter(m => isBomRequiredLine(m) && m.shortQty > 0);
    const deferredPending = (wo.materialStatus || []).filter(m => isDeferredLine(m));
    const currentMandatoryShortages = (wo.materialStatus || []).filter(m => m.isMandatory && m.shortQty > 0);
    const isSectionWo = isSectionWorkOrderForPrint(wo);
    const parentRef = wo.parentWorkOrderId && typeof wo.parentWorkOrderId === 'object' ? wo.parentWorkOrderId : null;
    const pendingBannerCount = isSectionWo
        ? Math.max(unresolvedRequired.length, deferredPending.length)
        : deferredPending.length;

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
                            <span style={{ padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 600, background: sc.bg, color: sc.color }}>{wo.status}</span>
                            <span style={{ fontSize: '13px', color: '#94a3b8' }}>Priority: <strong style={{ color: '#f59e0b' }}>{wo.priority}</strong></span>
                        </div>
                        <div style={{ color: '#64748b', fontSize: '13px', marginTop: '4px' }}>
                            {isSectionWo && (
                                <span>
                                    Parent:{' '}
                                    {parentRef?._id ? (
                                        <button type="button" onClick={() => navigate(PATHS.PRODUCTION.WO_DETAIL(parentRef._id))} style={{ background: 'none', border: 'none', color: '#2563eb', padding: 0, cursor: 'pointer', fontWeight: 700 }}>{parentRef.woNumber}</button>
                                    ) : '—'}
                                    {' · '}Section: <strong>{wo.bomSectionName || '—'}</strong>
                                    {' · '}
                                </span>
                            )}
                            {(() => { const p = woProductDisplay(wo); return `${p.productName} · Model No: ${p.modelNo} · Item Code: ${p.itemCode}`; })()}
                            {isTextile && wo.textile?.designNo ? ` · Design: ${wo.textile.designNo}` : ''}
                            {' · '}{isTextile ? 'Qty' : 'Target'}: {wo.targetQty}{isTextile ? ' PCS' : ' pcs'}
                            {isSectionWo ? ` · Completed: ${wo.completedQty ?? 0} · Stage: ${wo.currentStageName || '—'}` : ''}
                            {' · '}{labels.detailSupervisor}: {wo.textile?.assignedVendorWorker || wo.supervisor || '—'}
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                            onClick={handlePrintProductionSheet}
                            style={{ padding: '9px 18px', borderRadius: '8px', background: '#e2e8f0', color: '#475569', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}
                        >🖨️ Print Production Sheet</button>
                        {wo.status === 'Draft' && (
                            <button
                                onClick={handleRelease} disabled={saving}
                                style={{ padding: '9px 18px', borderRadius: '8px', background: '#1d4ed8', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '13px' }}
                            >{saving ? '...' : '▶ Release WO'}</button>
                        )}
                        {isSectionWo && wo.status !== 'Cancelled' && wo.status !== 'Closed' && (
                            <button
                                onClick={handleCancelSection} disabled={saving}
                                style={{ padding: '9px 18px', borderRadius: '8px', background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', cursor: 'pointer', fontWeight: 600, fontSize: '13px' }}
                            >Cancel Section WO</button>
                        )}
                    </div>
                </div>
                {/* Progress bar */}
                <div style={{ marginTop: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                        <span style={{ fontSize: '11px', color: '#64748b' }}>Overall Progress</span>
                        <span style={{ fontSize: '11px', color: '#94a3b8' }}>{pct}%</span>
                    </div>
                    <div style={{ height: '8px', background: '#e2e8f0', borderRadius: '4px', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: 'linear-gradient(90deg,#3b82f6,#10b981)', transition: 'width 0.4s' }} />
                    </div>
                </div>
            </div>

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
            {pendingBannerCount > 0 && (
                <div style={{ background: '#fffbeb', borderBottom: '1px solid #fcd34d', padding: '12px 28px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '16px' }}>⏳</span>
                    <div>
                        <strong style={{ color: '#92400e', fontSize: '13px' }}>Pending Material</strong>
                        <div style={{ color: '#b45309', fontSize: '12px' }}>
                            {pendingProceedWarning(pendingBannerCount)}
                            {!isSectionWo && deferredPending.length > 0 ? ` ${deferredPending.map(m => m.itemName).join(', ')}.` : ''}
                        </div>
                    </div>
                    <button onClick={() => setTab(1)} style={{ marginLeft: 'auto', padding: '6px 14px', borderRadius: '6px', background: '#fef3c7', color: '#92400e', border: '1px solid #fcd34d', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}>
                        View BOM →
                    </button>
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
                {tab === 0 && <OverviewTab wo={wo} load={load} isTextile={isTextile} labels={labels} />}
                {tab === 1 && <BomMaterialTab wo={wo} load={load} />}
                {tab === 2 && <ProcessExecutionTab wo={wo} load={load} />}
                {tab === 3 && <QcTestingTab wo={wo} load={load} />}
                {tab === 4 && <WipTab wo={wo} />}
                {tab === 5 && <MaterialHistoryTab wo={wo} />}
            </div>

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
        ['Status', wo.status],
        ...(wo.woKind === 'section' ? [
            ['Type', 'SECTION WORK ORDER'],
            ['Parent WO', wo.parentWorkOrderId?.woNumber || '—'],
            ['Section', wo.bomSectionName || '—'],
            ['Completed Qty', wo.completedQty ?? 0],
            ['Current Stage', wo.currentStageName || '—'],
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
            {!isTextile && wo.woKind !== 'section' && <WorkOrderSectionPanel wo={wo} load={load} />}
        </div>
    );
}

// ─── BOM & Material Tab ───────────────────────────────────────────────────────
function BomMaterialTab({ wo, load }) {
    const [updates, setUpdates] = useState({});
    const [saving, setSaving] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [sectionFilter, setSectionFilter] = useState('all');
    const [pendingOpen, setPendingOpen] = useState(false);
    const isSection = wo.woKind === 'section' || !!wo.parentWorkOrderId;
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
    const unsavedDeferredCount = Object.values(updates).filter((v) => v && v.isMandatory === false).length;

    const setUpd = (id, k, v) => setUpdates(u => ({ ...u, [id]: { ...(u[id] || {}), [k]: v } }));

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
                            {['Item', 'UOM', 'Required Qty', 'Available Qty', 'Short Qty', 'Mandatory', 'Material Status', 'Procurement Status', 'Remarks'].map(h => (
                                <th key={h} style={{ padding: '10px 12px', textAlign: 'left', color: '#6b7280', fontWeight: 600, borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>{h}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {activeMaterials.map((m, i) => {
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
                        {!activeMaterials.length && (
                            <tr><td colSpan={9} style={{ padding: '32px', textAlign: 'center', color: '#64748b' }}>
                                {pendingMaterials.length ? 'No active components — restore pending material to continue this stage.' : 'No components in BOM'}
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
                                    {pendingMaterials.map((m) => {
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

// ─── Process Execution Tab ────────────────────────────────────────────────────
function ProcessExecutionTab({ wo, load }) {
    const canEdit = ['Released', 'In Process', 'WIP – Waiting Material'].includes(wo.status);
    const deferredPending = (wo.materialStatus || []).filter((m) => isDeferredLine(m));

    return (
        <div>
            {deferredPending.length > 0 && (
                <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#92400e' }}>
                    {pendingProceedWarning(deferredPending.length)}
                </div>
            )}
            {/* Stage Summary Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '12px', marginBottom: '24px' }}>
                {(wo.stages || []).map(s => {
                    const sc = STAGE_STATUS_COLORS[s.status] || STAGE_STATUS_COLORS['Not Started'];
                    return (
                        <div key={s.seq} style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '12px', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                <span style={{ fontSize: '11px', fontWeight: 700, color: '#64748b' }}>#{s.seq} {s.stageName}</span>
                                <span style={{ fontSize: '10px', fontWeight: 700, color: sc.color }}>{s.status}</span>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                                    <span style={{ color: '#94a3b8' }}>Output:</span>
                                    <span style={{ fontWeight: 700, color: '#10b981' }}>{s.outputQty || 0}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                                    <span style={{ color: '#94a3b8' }}>Rej/Rw:</span>
                                    <span style={{ fontWeight: 600, color: '#ef4444' }}>{(s.rejectionQty || 0) + (s.reworkQty || 0)}</span>
                                </div>
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
                    <StageCard key={stage.seq} stage={stage} wo={wo} woId={wo._id} targetQty={wo.targetQty} canEdit={canEdit} load={load} />
                ))}
            </div>
        </div>
    );
}

function StageCard({ stage, wo, woId, targetQty, canEdit, load }) {
    const sc = STAGE_STATUS_COLORS[stage.status] || STAGE_STATUS_COLORS['Not Started'];
    const [open, setOpen] = useState(false);

    // Stage-level fields
    const [form, setForm] = useState({
        status: stage.status,
        remarks: stage.remarks || '',
    });

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

    // Calculate max allowed output depending on the stage
    const prevStage = wo.stages.find(s => s.seq === stage.seq - 1);
    const maxAllowedOutput = stage.seq === 1 ? targetQty : (prevStage ? prevStage.outputQty : targetQty);
    const pendingOutput = Math.max(0, maxAllowedOutput - totalOutput);

    const balanceInProcess = Math.max(0, totalInput - totalOutput - totalRework - totalRejection);

    const save = async () => {
        if (!canEdit) return;
        setSaving(true);
        try {
            await updateStage(woId, stage.seq, form);
            toast.success(`${stage.stageName} updated`);
            setOpen(false);
            load();
        } catch (e) { toast.error(e.response?.data?.message || e.message); }
        finally { setSaving(false); }
    };

    const handleAddLog = async () => {
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
                    <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                        {productionLogs.length > 0 ? `Total Output: ${totalOutput}` : ''}
                    </div>
                </div>
                <span style={{ padding: '5px 12px', borderRadius: '20px', fontSize: '11px', fontWeight: 700, background: sc.bg, color: sc.color }}>{stage.status}</span>
                <span style={{ color: '#334155', fontSize: '18px' }}>{open ? '▲' : '▼'}</span>
            </div>

            {/* Expanded edit form */}
            {open && (
                <div style={{ borderTop: '1px solid #f3f4f6', padding: '20px', background: '#ffffff' }}>

                    {/* Stage Level Info */}
                    <div>
                        <label style={{ fontSize: '11px', color: '#6b7280', display: 'block', marginBottom: '4px' }}>Overall Status</label>
                        <select value={form.status} onChange={e => set('status', e.target.value)} disabled={!canEdit} style={{ ...inp, cursor: canEdit ? 'pointer' : 'not-allowed' }}>
                            {['Not Started', 'Running', 'Completed', 'QC Hold', 'Failed', 'Rework'].map(s => <option key={s}>{s}</option>)}
                        </select>
                    </div>

                    <div style={{ marginBottom: '16px' }}>
                        <label style={{ fontSize: '11px', color: '#6b7280', display: 'block', marginBottom: '4px' }}>Remarks</label>
                        <textarea rows={2} value={form.remarks} onChange={e => set('remarks', e.target.value)} style={{ ...inp, resize: 'vertical' }} disabled={!canEdit} />
                    </div>

                    {/* Aggregate Totals (Read Only) */}
                    <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', background: '#f9fafb', padding: '12px', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
                        <div style={{ flex: 1, textAlign: 'center' }}><div style={{ fontSize: '11px', color: '#94a3b8' }}>Max Allowed</div><div style={{ fontSize: '16px', fontWeight: 600, color: '#1e293b' }}>{maxAllowedOutput}</div></div>
                        <div style={{ width: '1px', background: '#e5e7eb' }}></div>
                        <div style={{ flex: 1, textAlign: 'center' }}><div style={{ fontSize: '11px', color: '#fca5a5' }}>Prev. Pending</div><div style={{ fontSize: '16px', fontWeight: 600, color: '#ef4444' }}>{pendingOutput}</div></div>
                        <div style={{ width: '1px', background: '#e5e7eb' }}></div>
                        <div style={{ flex: 1, textAlign: 'center' }}><div style={{ fontSize: '11px', color: '#94a3b8' }}>Total Started</div><div style={{ fontSize: '16px', fontWeight: 600, color: '#3b82f6' }}>{totalInput}</div></div>
                        <div style={{ width: '1px', background: '#e5e7eb' }}></div>
                        <div style={{ flex: 1, textAlign: 'center' }}><div style={{ fontSize: '11px', color: '#94a3b8' }}>Total Completed</div><div style={{ fontSize: '16px', fontWeight: 700, color: '#10b981' }}>{totalOutput}</div></div>
                        <div style={{ width: '1px', background: '#e5e7eb' }}></div>
                        <div style={{ flex: 1, textAlign: 'center' }}><div style={{ fontSize: '11px', color: '#f59e0b' }}>Total Pending</div><div style={{ fontSize: '16px', fontWeight: 600, color: '#f59e0b' }}>{balanceInProcess}</div></div>
                    </div>

                    {/* Execution Logs Table */}
                    <div style={{ marginBottom: '20px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                            <div style={{ fontSize: '13px', fontWeight: 600, color: '#374151' }}>Execution Runs ({productionLogs.length})</div>
                            {canEdit && !showNewLog && (
                                <button onClick={() => setShowNewLog(true)} style={{ padding: '4px 10px', background: '#334155', color: '#f1f5f9', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', fontWeight: 600 }}>+ Add Run Log</button>
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
                                                {canEdit && l._id && (
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
                                    <button onClick={handleAddLog} disabled={saving} style={{ padding: '6px 12px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', fontWeight: 600 }}>{saving ? 'Saving...' : 'Save Run Log'}</button>
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
                            <button onClick={save} disabled={saving}
                                style={{ padding: '8px 18px', borderRadius: '7px', background: '#1d4ed8', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '13px' }}>
                                {saving ? 'Saving...' : 'Save Stage'}
                            </button>
                        </div>
                    )}
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
                <QcStagePanel key={stage.seq} stage={stage} woId={wo._id} canEdit={canEdit} load={load} />
            ))}
        </div>
    );
}

function QcStagePanel({ stage, woId, canEdit, load }) {
    const sc = STAGE_STATUS_COLORS[stage.status] || STAGE_STATUS_COLORS['Not Started'];
    const [checklist, setChecklist] = useState(stage.checklist || []);
    const [testData, setTestData] = useState(stage.testData || {});
    const [saving, setSaving] = useState(false);
    const setCheck = (i, k, v) => setChecklist(cl => cl.map((c, idx) => idx === i ? { ...c, [k]: v } : c));
    const setTest = (k, v) => setTestData(t => ({ ...t, [k]: v }));

    const save = async () => {
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
                    <span style={{ marginLeft: '8px', padding: '3px 8px', borderRadius: '10px', fontSize: '10px', fontWeight: 600, background: sc.bg, color: sc.color }}>{stage.status}</span>
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
                                    disabled={!canEdit}
                                    style={{ padding: '5px 10px', background: '#1e293b', border: `1px solid ${c.result === 'Pass' ? '#10b981' : c.result === 'Fail' ? '#ef4444' : '#334155'}`, borderRadius: '6px', color: c.result === 'Pass' ? '#10b981' : c.result === 'Fail' ? '#ef4444' : '#94a3b8', cursor: 'pointer', fontWeight: 600, fontSize: '12px' }}>
                                    <option>Pending</option>
                                    <option>Pass</option>
                                    <option>Fail</option>
                                </select>
                                <input value={c.remarks} onChange={e => setCheck(i, 'remarks', e.target.value)}
                                    placeholder="Remarks" disabled={!canEdit}
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
                                <input type="number" value={testData[k] || ''} onChange={e => setTest(k, e.target.value)} disabled={!canEdit}
                                    style={inp} />
                            </div>
                        ))}
                        <div>
                            <label style={{ fontSize: '11px', color: '#64748b', display: 'block', marginBottom: '4px' }}>Result</label>
                            <select value={testData.result || 'Pending'} onChange={e => setTest('result', e.target.value)} disabled={!canEdit}
                                style={{ ...inp, cursor: 'pointer' }}>
                                <option>Pending</option><option>Pass</option><option>Fail</option>
                            </select>
                        </div>
                        <div>
                            <label style={{ fontSize: '11px', color: '#64748b', display: 'block', marginBottom: '4px' }}>Tester Name</label>
                            <input value={testData.testerName || ''} onChange={e => setTest('testerName', e.target.value)} disabled={!canEdit}
                                style={inp} />
                        </div>
                    </div>
                    <div style={{ marginTop: '10px' }}>
                        <label style={{ fontSize: '11px', color: '#64748b', display: 'block', marginBottom: '4px' }}>Result Summary</label>
                        <textarea rows={2} value={testData.resultSummary || ''} onChange={e => setTest('resultSummary', e.target.value)}
                            disabled={!canEdit} style={{ ...inp, resize: 'vertical' }} />
                    </div>
                </div>
            )}

            {canEdit && (
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button onClick={save} disabled={saving}
                        style={{ padding: '8px 18px', borderRadius: '8px', background: '#1d4ed8', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '13px' }}>
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
        </div>
    );
}
