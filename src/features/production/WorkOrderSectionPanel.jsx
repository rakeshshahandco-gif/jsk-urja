import React, { useMemo, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { PATHS } from '@/routes/paths';
import { createSectionWorkOrder, updateSectionConfig, getWorkOrderById, restoreSectionWorkOrder } from '@/services/workOrderApi';
import { useCompany } from '@/contexts/CompanyContext';
import { buildProductionSheetPrintHtml, openProductionSheetPrintWindow } from '@/features/production/buildProductionSheetPrintHtml';

const STATUS_COLORS = {
    Draft: { bg: '#f1f5f9', text: '#64748b' },
    Released: { bg: '#eff6ff', text: '#2563eb' },
    'In Process': { bg: '#f0fdf4', text: '#16a34a' },
    'WIP – Waiting Material': { bg: '#fef2f2', text: '#dc2626' },
    'On Hold': { bg: '#faf5ff', text: '#9333ea' },
    Completed: { bg: '#f0fdf4', text: '#059669' },
    Closed: { bg: '#f8fafc', text: '#94a3b8' },
    Cancelled: { bg: '#fef2f2', text: '#b91c1c' },
    'Not created': { bg: '#f8fafc', text: '#94a3b8' },
};

/**
 * Isolated Parent WO panel for BOM Section / Subassembly Work Orders (Phase 1).
 * Hidden for textile WOs, Section WOs themselves, and legacy single-section WOs with no config.
 */
export default function WorkOrderSectionPanel({ wo, load }) {
    const navigate = useNavigate();
    const { selectedCompany } = useCompany();
    const [savingConfig, setSavingConfig] = useState(false);
    const [creating, setCreating] = useState(false);
    const [showCreate, setShowCreate] = useState(false);
    const [createSectionNo, setCreateSectionNo] = useState('');
    const [restorePrompt, setRestorePrompt] = useState(null);
    const [restoring, setRestoring] = useState(false);

    const bomSections = wo.bomSections || wo.bomId?.sections || [];
    const sectionWos = wo.sectionWorkOrders || [];
    const completeSets = wo.completeSets || { gated: false, completeSetsAvailable: wo.targetQty, parentTargetQty: wo.targetQty, sectionRows: [] };
    const configSections = wo.sectionConfig?.sections || [];

    const [mandatoryNos, setMandatoryNos] = useState(() => {
        const fromConfig = configSections.filter((s) => s.isMandatory).map((s) => Number(s.bomSectionNo));
        return fromConfig.length ? fromConfig : [];
    });

    useEffect(() => {
        const fromConfig = (wo.sectionConfig?.sections || []).filter((s) => s.isMandatory).map((s) => Number(s.bomSectionNo));
        setMandatoryNos(fromConfig);
    }, [wo._id, wo.sectionConfig?.enabled, wo.updatedAt]);

    const rows = useMemo(() => {
        if (completeSets.gated && completeSets.sectionRows?.length) return completeSets.sectionRows;
        return bomSections.map((sec) => {
            const child = sectionWos.find((s) => Number(s.bomSectionNo) === Number(sec.sectionNo) && s.status !== 'Cancelled');
            return {
                bomSectionNo: Number(sec.sectionNo),
                bomSectionName: sec.sectionName,
                targetQty: child?.targetQty ?? wo.targetQty,
                completedQty: child?.completedQty ?? 0,
                currentStage: child?.currentStageName || '—',
                status: child?.status || 'Not created',
                woNumber: child?.woNumber,
                sectionWorkOrderId: child?._id,
            };
        });
    }, [completeSets, bomSections, sectionWos, wo.targetQty]);

    const showPanel = bomSections.length > 1 || wo.sectionConfig?.enabled || sectionWos.length > 0;
    if (!showPanel) return null;

    const unusedSections = bomSections.filter((sec) => {
        const active = sectionWos.some((s) => Number(s.bomSectionNo) === Number(sec.sectionNo) && s.status !== 'Cancelled');
        return !active;
    });

    const toggleMandatory = (no) => {
        setMandatoryNos((prev) => (prev.includes(no) ? prev.filter((n) => n !== no) : [...prev, no]));
    };

    const saveConfig = async () => {
        if (!mandatoryNos.length) return toast.error('Select at least one mandatory BOM section');
        setSavingConfig(true);
        try {
            await updateSectionConfig(wo._id, {
                enabled: true,
                sections: bomSections.map((sec) => ({
                    bomSectionNo: Number(sec.sectionNo),
                    bomSectionName: sec.sectionName,
                    requiredQtyPerFinishedUnit: 1,
                    isMandatory: mandatoryNos.includes(Number(sec.sectionNo)),
                })),
            });
            toast.success('Mandatory subassembly sections saved');
            load();
        } catch (e) {
            toast.error(e.response?.data?.message || e.message);
        } finally {
            setSavingConfig(false);
        }
    };

    const handlePrintSectionSheet = async (sectionWorkOrderId) => {
        if (!sectionWorkOrderId) return;
        try {
            const sectionWo = await getWorkOrderById(sectionWorkOrderId);
            const html = buildProductionSheetPrintHtml({
                wo: sectionWo,
                companyName: selectedCompany?.companyName,
                isTextile: false,
            });
            openProductionSheetPrintWindow(html);
        } catch (e) {
            toast.error(e.response?.data?.message || e.message || 'Failed to print Section WO');
        }
    };

    const handleCreate = async () => {
        if (!createSectionNo) return toast.error('Select a BOM section');
        setCreating(true);
        try {
            const created = await createSectionWorkOrder(wo._id, {
                bomSectionNo: Number(createSectionNo),
                isMandatory: true,
            });
            toast.success(`Section WO ${created.woNumber} created`);
            setShowCreate(false);
            setCreateSectionNo('');
            load();
        } catch (e) {
            const payload = e.response?.data || {};
            if (payload.errorCode === 'SECTION_WO_EXISTS_RESTORABLE' && payload.data?.existingId) {
                setShowCreate(false);
                setRestorePrompt({
                    sectionName: payload.data.bomSectionName
                        || unusedSections.find((s) => Number(s.sectionNo) === Number(createSectionNo))?.sectionName
                        || 'this section',
                    existingId: payload.data.existingId,
                    woNumber: payload.data.woNumber,
                    bomSectionNo: payload.data.bomSectionNo || Number(createSectionNo),
                    message: payload.message,
                });
            } else {
                toast.error(payload.message || e.message);
            }
        } finally {
            setCreating(false);
        }
    };

    const handleRestore = async () => {
        if (!restorePrompt?.existingId) return;
        setRestoring(true);
        try {
            const restored = await restoreSectionWorkOrder(wo._id, {
                sectionWorkOrderId: restorePrompt.existingId,
                bomSectionNo: Number(restorePrompt.bomSectionNo),
            });
            toast.success(`Section WO ${restored.woNumber} restored`);
            setRestorePrompt(null);
            setCreateSectionNo('');
            load();
        } catch (e) {
            toast.error(e.response?.data?.message || e.message);
        } finally {
            setRestoring(false);
        }
    };

    const gated = completeSets.gated === true;
    const available = gated ? completeSets.completeSetsAvailable : null;

    return (
        <div style={{ marginTop: 28, maxWidth: 900 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 12, flexWrap: 'wrap' }}>
                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Section / Subassembly Work Orders</h2>
                {unusedSections.length > 0 && (
                    <button
                        type="button"
                        onClick={() => setShowCreate(true)}
                        style={{ padding: '7px 14px', background: '#0d9488', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                    >
                        + Create Section Work Order
                    </button>
                )}
            </div>

            {gated && (
                <div style={{
                    background: '#ecfeff', border: '1px solid #67e8f9', borderRadius: 10,
                    padding: '14px 18px', marginBottom: 14, textAlign: 'center',
                }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#0e7490', letterSpacing: 0.4, textTransform: 'uppercase' }}>Complete Sets Available</div>
                    <div style={{ fontSize: 28, fontWeight: 800, color: '#155e75', marginTop: 2 }}>
                        {available} / {wo.targetQty}
                    </div>
                    <div style={{ fontSize: 12, color: '#0e7490', marginTop: 4 }}>
                        Parent finished qty cannot exceed this (MIN of mandatory subassemblies).
                    </div>
                </div>
            )}

            {bomSections.length > 1 && (
                <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: 14, marginBottom: 12 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#334155', marginBottom: 8 }}>Mandatory for final product</div>
                    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 10 }}>
                        {bomSections.map((sec) => (
                            <label key={sec.sectionNo} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#1e293b', cursor: 'pointer' }}>
                                <input
                                    type="checkbox"
                                    checked={mandatoryNos.includes(Number(sec.sectionNo))}
                                    onChange={() => toggleMandatory(Number(sec.sectionNo))}
                                />
                                {sec.sectionName} = Mandatory
                            </label>
                        ))}
                    </div>
                    <button
                        type="button"
                        onClick={saveConfig}
                        disabled={savingConfig}
                        style={{ padding: '6px 12px', background: '#334155', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                    >
                        {savingConfig ? 'Saving…' : 'Save mandatory sections'}
                    </button>
                    <div style={{ fontSize: 11, color: '#64748b', marginTop: 8 }}>
                        Legacy products stay unchanged until you mark sections here. Phase 1 Section WOs track process only — they do not consume stock or post finished goods.
                    </div>
                </div>
            )}

            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                        <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
                            <th style={{ padding: '10px 12px', borderBottom: '1px solid #e5e7eb' }}>Section</th>
                            <th style={{ padding: '10px 12px', borderBottom: '1px solid #e5e7eb', textAlign: 'right' }}>Target</th>
                            <th style={{ padding: '10px 12px', borderBottom: '1px solid #e5e7eb', textAlign: 'right' }}>Completed</th>
                            <th style={{ padding: '10px 12px', borderBottom: '1px solid #e5e7eb' }}>Current Stage</th>
                            <th style={{ padding: '10px 12px', borderBottom: '1px solid #e5e7eb' }}>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.length === 0 ? (
                            <tr>
                                <td colSpan={5} style={{ padding: 16, color: '#94a3b8' }}>No section Work Orders yet.</td>
                            </tr>
                        ) : rows.map((r) => {
                            const sc = STATUS_COLORS[r.status] || STATUS_COLORS.Draft;
                            return (
                                <tr key={r.bomSectionNo}>
                                    <td style={{ padding: '10px 12px', borderBottom: '1px solid #f1f5f9' }}>
                                        <div style={{ fontWeight: 700 }}>{r.bomSectionName || `Section ${r.bomSectionNo}`}</div>
                                        {r.woNumber && (
                                            <button
                                                type="button"
                                                onClick={() => navigate(PATHS.PRODUCTION.WO_DETAIL(r.sectionWorkOrderId))}
                                                style={{ background: 'none', border: 'none', color: '#2563eb', padding: 0, fontSize: 11, cursor: 'pointer', fontWeight: 600 }}
                                            >
                                                {r.woNumber}
                                            </button>
                                        )}
                                    </td>
                                    <td style={{ padding: '10px 12px', borderBottom: '1px solid #f1f5f9', textAlign: 'right' }}>{r.targetQty ?? '—'}</td>
                                    <td style={{ padding: '10px 12px', borderBottom: '1px solid #f1f5f9', textAlign: 'right', fontWeight: 700 }}>{r.completedQty ?? 0}</td>
                                    <td style={{ padding: '10px 12px', borderBottom: '1px solid #f1f5f9' }}>{r.currentStage || '—'}</td>
                                    <td style={{ padding: '10px 12px', borderBottom: '1px solid #f1f5f9' }}>
                                        <span style={{ padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 700, background: sc.bg, color: sc.text }}>{r.status}</span>
                                        {r.sectionWorkOrderId && (
                                            <button
                                                type="button"
                                                onClick={() => handlePrintSectionSheet(r.sectionWorkOrderId)}
                                                style={{ marginLeft: 8, background: 'none', border: 'none', color: '#0f766e', padding: 0, fontSize: 11, cursor: 'pointer', fontWeight: 700 }}
                                            >
                                                Print sheet
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {showCreate && (
                <div style={{
                    position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 80,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
                }}>
                    <div style={{ background: '#fff', borderRadius: 12, padding: 22, width: 420, maxWidth: '100%' }}>
                        <h3 style={{ margin: '0 0 8px', fontSize: 16 }}>Create Section Work Order</h3>
                        <p style={{ margin: '0 0 14px', fontSize: 12, color: '#64748b' }}>
                            Uses the existing BOM section. Process tracking only — no stock reservation or finished-goods posting.
                        </p>
                        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 6 }}>BOM Section</label>
                        <select
                            value={createSectionNo}
                            onChange={(e) => setCreateSectionNo(e.target.value)}
                            style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 8, marginBottom: 16 }}
                        >
                            <option value="">Select section…</option>
                            {unusedSections.map((sec) => (
                                <option key={sec.sectionNo} value={sec.sectionNo}>{sec.sectionName}</option>
                            ))}
                        </select>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                            <button type="button" onClick={() => setShowCreate(false)} style={{ padding: '7px 12px', background: '#fff', border: '1px solid #d1d5db', borderRadius: 6, cursor: 'pointer' }}>Cancel</button>
                            <button type="button" onClick={handleCreate} disabled={creating} style={{ padding: '7px 14px', background: '#0d9488', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 700, cursor: 'pointer' }}>
                                {creating ? 'Creating…' : 'Create'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {restorePrompt && (
                <div style={{
                    position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 80,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
                }}>
                    <div style={{ background: '#fff', borderRadius: 12, padding: 22, width: 440, maxWidth: '100%' }}>
                        <h3 style={{ margin: '0 0 8px', fontSize: 16 }}>Restore Section Work Order</h3>
                        <p style={{ margin: '0 0 10px', fontSize: 13, color: '#334155', fontWeight: 600 }}>
                            {restorePrompt.message || `A deleted Section Work Order already exists for ${restorePrompt.sectionName}.`}
                        </p>
                        <p style={{ margin: '0 0 16px', fontSize: 12, color: '#64748b' }}>
                            {restorePrompt.woNumber} will be reopened with its original history. A duplicate will not be created.
                        </p>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                            <button type="button" onClick={() => setRestorePrompt(null)} style={{ padding: '7px 12px', background: '#fff', border: '1px solid #d1d5db', borderRadius: 6, cursor: 'pointer' }}>Cancel</button>
                            <button type="button" onClick={handleRestore} disabled={restoring} style={{ padding: '7px 14px', background: '#0d9488', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 700, cursor: 'pointer' }}>
                                {restoring ? 'Restoring…' : 'Restore / Reopen'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
