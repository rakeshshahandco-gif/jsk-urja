import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    getWorkOrderById, releaseWorkOrder, updateStage, updateMaterialStatus, refreshMaterialStock
} from '@/services/workOrderApi';
import { PATHS } from '@/routes/paths';
import toast from 'react-hot-toast';

// ─── Status Colors ───────────────────────────────────────────────────────────
const WO_STATUS_COLORS = {
    'Draft': { color: '#94a3b8', bg: '#1e293b' },
    'Released': { color: '#60a5fa', bg: '#1e3a5f' },
    'In Process': { color: '#86efac', bg: '#1c2a18' },
    'WIP – Waiting Material': { color: '#fca5a5', bg: '#450a0a' },
    'On Hold': { color: '#c4b5fd', bg: '#2e1065' },
    'Completed': { color: '#6ee7b7', bg: '#052e16' },
    'Closed': { color: '#475569', bg: '#1e293b' },
};

const STAGE_STATUS_COLORS = {
    'Not Started': { color: '#64748b', bg: '#1e293b', icon: '○' },
    'Running': { color: '#f59e0b', bg: '#1c1408', icon: '▶' },
    'Completed': { color: '#10b981', bg: '#052e16', icon: '✓' },
    'QC Hold': { color: '#f97316', bg: '#1c0e00', icon: '⏸' },
    'Failed': { color: '#ef4444', bg: '#450a0a', icon: '✕' },
    'Rework': { color: '#a78bfa', bg: '#1e1035', icon: '↺' },
};

const TABS = ['Overview', 'BOM & Material', 'Process Execution', 'QC & Testing', 'WIP & Exceptions'];

// ─── Input style ─────────────────────────────────────────────────────────────
const inp = {
    padding: '8px 12px', background: '#0f172a', border: '1px solid #334155',
    borderRadius: '6px', color: '#f1f5f9', fontSize: '13px', outline: 'none', width: '100%', boxSizing: 'border-box',
};

export default function WorkOrderDetailPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [wo, setWo] = useState(null);
    const [loading, setLoading] = useState(true);
    const [tab, setTab] = useState(0);
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

    if (loading) return <div style={{ padding: '60px', textAlign: 'center', color: '#64748b', background: '#0f172a', minHeight: '100vh' }}>Loading...</div>;
    if (!wo) return <div style={{ padding: '60px', textAlign: 'center', color: '#ef4444', background: '#0f172a', minHeight: '100vh' }}>Work Order not found</div>;

    const sc = WO_STATUS_COLORS[wo.status] || WO_STATUS_COLORS['Draft'];
    const pct = wo.stages?.length ? Math.round((wo.stages.filter(s => s.status === 'Completed').length / wo.stages.length) * 100) : 0;
    const mandatoryShortages = (wo.materialStatus || []).filter(m => m.isMandatory && m.shortQty > 0);

    return (
        <div style={{ fontFamily: "'Inter', sans-serif", background: '#0f172a', minHeight: '100vh', color: '#f1f5f9' }}>
            {/* Top bar */}
            <div style={{ background: '#1e293b', borderBottom: '1px solid #334155', padding: '16px 28px' }}>
                <button
                    onClick={() => navigate(PATHS.PRODUCTION.WORK_ORDERS)}
                    style={{ background: 'none', border: 'none', color: '#64748b', fontSize: '13px', cursor: 'pointer', padding: 0, marginBottom: '8px' }}
                >← Work Orders</button>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 700 }}>{wo.woNumber}</h1>
                            <span style={{ padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 600, background: sc.bg, color: sc.color }}>{wo.status}</span>
                            <span style={{ fontSize: '13px', color: '#94a3b8' }}>Priority: <strong style={{ color: '#f59e0b' }}>{wo.priority}</strong></span>
                        </div>
                        <div style={{ color: '#64748b', fontSize: '13px', marginTop: '4px' }}>
                            {wo.finishedProductName} · Target: {wo.targetQty} pcs · Supervisor: {wo.supervisor || '—'}
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        {wo.status === 'Draft' && (
                            <button
                                onClick={handleRelease} disabled={saving}
                                style={{ padding: '9px 18px', borderRadius: '8px', background: '#1d4ed8', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '13px' }}
                            >{saving ? '...' : '▶ Release WO'}</button>
                        )}
                    </div>
                </div>
                {/* Progress bar */}
                <div style={{ marginTop: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                        <span style={{ fontSize: '11px', color: '#64748b' }}>Overall Progress</span>
                        <span style={{ fontSize: '11px', color: '#94a3b8' }}>{pct}%</span>
                    </div>
                    <div style={{ height: '8px', background: '#334155', borderRadius: '4px', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: 'linear-gradient(90deg,#3b82f6,#10b981)', transition: 'width 0.4s' }} />
                    </div>
                </div>
            </div>

            {/* Mandatory shortage banner */}
            {mandatoryShortages.length > 0 && (
                <div style={{ background: '#450a0a', borderBottom: '1px solid #dc2626', padding: '12px 28px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '16px' }}>⚠️</span>
                    <div>
                        <strong style={{ color: '#fca5a5', fontSize: '13px' }}>Mandatory Material Shortage</strong>
                        <div style={{ color: '#f87171', fontSize: '12px' }}>
                            {mandatoryShortages.map(m => m.itemName).join(', ')} — FG cannot be completed until resolved.
                        </div>
                    </div>
                    <button onClick={() => setTab(1)} style={{ marginLeft: 'auto', padding: '6px 14px', borderRadius: '6px', background: '#7f1d1d', color: '#fca5a5', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}>
                        View BOM →
                    </button>
                </div>
            )}

            {/* Tabs */}
            <div style={{ display: 'flex', gap: '0', borderBottom: '1px solid #1e293b', background: '#0f172a', paddingLeft: '28px' }}>
                {TABS.map((t, i) => (
                    <button key={t} onClick={() => setTab(i)}
                        style={{
                            padding: '14px 18px', border: 'none', background: 'none', cursor: 'pointer',
                            fontSize: '13px', fontWeight: tab === i ? 700 : 500,
                            color: tab === i ? '#60a5fa' : '#64748b',
                            borderBottom: tab === i ? '2px solid #3b82f6' : '2px solid transparent',
                            transition: 'all 0.15s',
                        }}
                    >{t}</button>
                ))}
            </div>

            {/* Tab Content */}
            <div style={{ padding: '28px' }}>
                {tab === 0 && <OverviewTab wo={wo} />}
                {tab === 1 && <BomMaterialTab wo={wo} load={load} />}
                {tab === 2 && <ProcessExecutionTab wo={wo} load={load} />}
                {tab === 3 && <QcTestingTab wo={wo} load={load} />}
                {tab === 4 && <WipTab wo={wo} />}
            </div>
        </div>
    );
}

// ─── Overview Tab ─────────────────────────────────────────────────────────────
function OverviewTab({ wo }) {
    const fmt = (d) => d ? new Date(d).toLocaleDateString() : '—';
    const rows = [
        ['WO Number', wo.woNumber],
        ['Status', wo.status],
        ['BOM Version', wo.bomVersion || '—'],
        ['Finished Product', wo.finishedProductName || '—'],
        ['Target Qty', wo.targetQty],
        ['Priority', wo.priority],
        ['Planned Start', fmt(wo.plannedStart)],
        ['Planned End', fmt(wo.plannedEnd)],
        ['Actual Start', fmt(wo.actualStart)],
        ['Actual End', fmt(wo.actualEnd)],
        ['Supervisor', wo.supervisor || '—'],
        ['Remarks', wo.remarks || '—'],
        ['Created', fmt(wo.createdAt)],
    ];
    return (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', maxWidth: '800px' }}>
            {rows.map(([k, v]) => (
                <div key={k} style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '10px', padding: '14px 18px' }}>
                    <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>{k}</div>
                    <div style={{ fontSize: '14px', color: '#f1f5f9', marginTop: '4px', fontWeight: 500 }}>{String(v)}</div>
                </div>
            ))}
        </div>
    );
}

// ─── BOM & Material Tab ───────────────────────────────────────────────────────
function BomMaterialTab({ wo, load }) {
    const [updates, setUpdates] = useState({});
    const [saving, setSaving] = useState(false);
    const [refreshing, setRefreshing] = useState(false);

    const setUpd = (id, k, v) => setUpdates(u => ({ ...u, [id]: { ...(u[id] || {}), [k]: v } }));

    const save = async () => {
        const materialUpdates = Object.entries(updates).map(([materialId, vals]) => ({ materialId, ...vals }));
        if (!materialUpdates.length) return toast('No changes to save');
        setSaving(true);
        try {
            await updateMaterialStatus(wo._id, { materialUpdates });
            toast.success('Material status updated');
            setUpdates({});
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
        const headers = ['Item', 'UOM', 'Required Qty', 'Available', 'Short Qty', 'Mandatory', 'Procurement Status', 'Remarks'];
        const rows = (wo.materialStatus || []).map(m => [
            `"${m.itemName}"`,
            `"${m.uom || ''}"`,
            m.requiredQty,
            m.availableStock,
            m.shortQty,
            m.isMandatory ? 'Yes' : 'No',
            `"${m.procurementStatus}"`,
            `"${m.remarks || ''}"`
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
              <th>Item</th><th>UOM</th><th>Required</th><th>Available</th><th>Short</th><th>Mandatory</th><th>Status</th><th>Remarks</th>
            </tr>
          </thead>
          <tbody>`;
        (wo.materialStatus || []).forEach(m => {
            tableHtml += `<tr>
              <td>${m.itemName}</td>
              <td>${m.uom || '-'}</td>
              <td>${m.requiredQty}</td>
              <td>${m.availableStock}</td>
              <td style="color:${m.shortQty > 0 ? 'red' : 'inherit'}"><strong>${m.shortQty}</strong></td>
              <td>${m.isMandatory ? 'Yes' : 'No'}</td>
              <td>${m.procurementStatus}</td>
              <td>${m.remarks || ''}</td>
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
                        <strong>Product:</strong> ${wo.finishedProductName || '-'} <br/>
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
                <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 700 }}>BOM Components & Availability</h2>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button onClick={handleExportExcel}
                        style={{ padding: '8px 16px', borderRadius: '8px', background: '#e2e8f0', color: '#475569', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        📥 Excel
                    </button>
                    <button onClick={handleExportPdf}
                        style={{ padding: '8px 16px', borderRadius: '8px', background: '#e2e8f0', color: '#475569', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        📥 PDF
                    </button>
                    <button onClick={handleRefreshStock} disabled={refreshing}
                        style={{ padding: '8px 16px', borderRadius: '8px', background: '#334155', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {refreshing ? '↻ Refreshing...' : '↻ Refresh Stock'}
                    </button>
                    <button onClick={save} disabled={saving}
                        style={{ padding: '8px 16px', borderRadius: '8px', background: '#1d4ed8', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '13px' }}>
                        {saving ? 'Saving...' : 'Save Changes'}
                    </button>
                </div>
            </div>
            <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead>
                        <tr style={{ background: '#1e293b' }}>
                            {['Item', 'UOM', 'Required Qty', 'Available', 'Short Qty', 'Mandatory', 'Procurement Status', 'Remarks'].map(h => (
                                <th key={h} style={{ padding: '10px 12px', textAlign: 'left', color: '#64748b', fontWeight: 600, borderBottom: '1px solid #334155', whiteSpace: 'nowrap' }}>{h}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {(wo.materialStatus || []).map((m, i) => {
                            const isShort = m.shortQty > 0;
                            const isMandShort = isShort && m.isMandatory;
                            const upd = updates[m._id] || {};
                            return (
                                <tr key={m._id}
                                    style={{ background: isMandShort ? '#1a0608' : i % 2 === 0 ? '#0f172a' : '#1e293b' }}>
                                    <td style={{ padding: '10px 12px', color: isMandShort ? '#fca5a5' : '#f1f5f9', fontWeight: isMandShort ? 600 : 400, borderBottom: '1px solid #1e293b' }}>
                                        {m.itemName}
                                        {isMandShort && <span style={{ marginLeft: '6px', fontSize: '10px', background: '#dc2626', color: '#fff', padding: '1px 5px', borderRadius: '3px' }}>SHORT</span>}
                                    </td>
                                    <td style={{ padding: '10px 12px', color: '#94a3b8', borderBottom: '1px solid #1e293b' }}>{m.uom || '—'}</td>
                                    <td style={{ padding: '10px 12px', color: '#f1f5f9', borderBottom: '1px solid #1e293b' }}>{m.requiredQty}</td>
                                    <td style={{ padding: '10px 12px', borderBottom: '1px solid #1e293b' }}>
                                        <input type="number" defaultValue={m.availableStock}
                                            onChange={e => setUpd(m._id, 'availableStock', Number(e.target.value))}
                                            style={{ ...inp, width: '80px' }} />
                                    </td>
                                    <td style={{ padding: '10px 12px', borderBottom: '1px solid #1e293b' }}>
                                        <input type="number" defaultValue={m.shortQty}
                                            onChange={e => setUpd(m._id, 'shortQty', Number(e.target.value))}
                                            style={{ ...inp, width: '70px', color: isShort ? '#ef4444' : '#f1f5f9' }} />
                                    </td>
                                    <td style={{ padding: '10px 12px', borderBottom: '1px solid #1e293b' }}>
                                        <input type="checkbox" defaultChecked={m.isMandatory}
                                            onChange={e => setUpd(m._id, 'isMandatory', e.target.checked)} />
                                    </td>
                                    <td style={{ padding: '10px 12px', borderBottom: '1px solid #1e293b' }}>
                                        <select defaultValue={m.procurementStatus}
                                            onChange={e => setUpd(m._id, 'procurementStatus', e.target.value)}
                                            style={{ ...inp, width: '140px', cursor: 'pointer' }}>
                                            {['Not Ordered', 'Ordered', 'In Transit', 'Received'].map(s => <option key={s}>{s}</option>)}
                                        </select>
                                    </td>
                                    <td style={{ padding: '10px 12px', borderBottom: '1px solid #1e293b' }}>
                                        <input type="text" defaultValue={m.remarks}
                                            onChange={e => setUpd(m._id, 'remarks', e.target.value)}
                                            placeholder="Notes..." style={{ ...inp, width: '120px' }} />
                                    </td>
                                </tr>
                            );
                        })}
                        {!(wo.materialStatus?.length) && (
                            <tr><td colSpan={8} style={{ padding: '32px', textAlign: 'center', color: '#64748b' }}>No components in BOM</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

// ─── Process Execution Tab ────────────────────────────────────────────────────
function ProcessExecutionTab({ wo, load }) {
    const canEdit = ['Released', 'In Process', 'WIP – Waiting Material'].includes(wo.status);

    return (
        <div>
            <h2 style={{ margin: '0 0 20px', fontSize: '16px', fontWeight: 700 }}>Stage Execution</h2>
            {'Not editable: WO must be Released or In Process to update stages. Current: ' + wo.status
                ? null : null}
            {!canEdit && (
                <div style={{ background: '#1c1408', border: '1px solid #92400e', borderRadius: '8px', padding: '12px 16px', marginBottom: '16px', color: '#fcd34d', fontSize: '13px' }}>
                    ⚠️ WO must be Released or In Process to update stages. Current status: <strong>{wo.status}</strong>
                </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {(wo.stages || []).map(stage => (
                    <StageCard key={stage.seq} stage={stage} woId={wo._id} targetQty={wo.targetQty} canEdit={canEdit} load={load} />
                ))}
            </div>
        </div>
    );
}

function StageCard({ stage, woId, targetQty, canEdit, load }) {
    const sc = STAGE_STATUS_COLORS[stage.status] || STAGE_STATUS_COLORS['Not Started'];
    const [open, setOpen] = useState(false);

    // Stage-level fields
    const [form, setForm] = useState({
        status: stage.status,
        operator: stage.operator || '',
        line: stage.line || '',
        remarks: stage.remarks || '',
        startTime: stage.startTime ? new Date(stage.startTime).toISOString().slice(0, 16) : '',
        endTime: stage.endTime ? new Date(stage.endTime).toISOString().slice(0, 16) : '',
    });

    // Backward compatibility & Logs init
    const [productionLogs, setProductionLogs] = useState(() => {
        if (stage.productionLogs && stage.productionLogs.length > 0) return stage.productionLogs;
        if (stage.inputQty || stage.outputQty || stage.reworkQty || stage.rejectionQty) {
            return [{
                startTime: stage.startTime || '',
                endTime: stage.endTime || '',
                operator: stage.operator || '',
                inputQty: stage.inputQty || 0,
                outputQty: stage.outputQty || 0,
                reworkQty: stage.reworkQty || 0,
                rejectionQty: stage.rejectionQty || 0,
                rejectionReason: stage.rejectionReason || ''
            }];
        }
        return [];
    });

    // New run log state
    const [newLog, setNewLog] = useState({
        startTime: '',
        endTime: '',
        operator: '',
        inputQty: 0,
        outputQty: 0,
        reworkQty: 0,
        rejectionQty: 0,
        rejectionReason: '',
    });
    const [showNewLog, setShowNewLog] = useState(false);

    const [saving, setSaving] = useState(false);
    const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
    const setLog = (k, v) => setNewLog(l => ({ ...l, [k]: v }));

    // Derived totals
    const totalInput = productionLogs.reduce((acc, l) => acc + (Number(l.inputQty) || 0), 0);
    const totalOutput = productionLogs.reduce((acc, l) => acc + (Number(l.outputQty) || 0), 0);
    const totalRework = productionLogs.reduce((acc, l) => acc + (Number(l.reworkQty) || 0), 0);
    const totalRejection = productionLogs.reduce((acc, l) => acc + (Number(l.rejectionQty) || 0), 0);

    // New Production Math
    const pendingToStart = Math.max(0, targetQty - totalInput);
    const balanceInProcess = Math.max(0, totalInput - totalOutput - totalRework - totalRejection);

    const save = async () => {
        if (!canEdit) return;
        setSaving(true);
        try {
            await updateStage(woId, stage.seq, { ...form, productionLogs });
            toast.success(`${stage.stageName} updated`);
            setOpen(false);
            load();
        } catch (e) { toast.error(e.response?.data?.message || e.message); }
        finally { setSaving(false); }
    };

    const handleAddLog = () => {
        setProductionLogs([...productionLogs, {
            ...newLog,
            startTime: newLog.startTime || new Date().toISOString(),
            endTime: newLog.endTime || new Date().toISOString(),
        }]);
        setShowNewLog(false);
        setNewLog({
            startTime: '', endTime: '', operator: '',
            inputQty: 0, outputQty: 0, reworkQty: 0, rejectionQty: 0, rejectionReason: ''
        });
    };

    return (
        <div style={{ background: '#1e293b', border: `1px solid ${sc.color}44`, borderRadius: '12px', overflow: 'hidden' }}>
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
                        <span style={{ fontWeight: 600, fontSize: '15px', color: '#f1f5f9' }}>{stage.stageName}</span>
                        {(stage.isQcGate || stage.isTestGate) && (
                            <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', background: '#4c1d95', color: '#c4b5fd', fontWeight: 600 }}>
                                {stage.isQcGate ? 'QC GATE' : 'TEST GATE'}
                            </span>
                        )}
                    </div>
                    <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                        {stage.operator ? `Operator: ${stage.operator}` : ''}
                        {productionLogs.length > 0 ? ` · Total Output: ${totalOutput}` : ''}
                    </div>
                </div>
                <span style={{ padding: '5px 12px', borderRadius: '20px', fontSize: '11px', fontWeight: 700, background: sc.bg, color: sc.color }}>{stage.status}</span>
                <span style={{ color: '#334155', fontSize: '18px' }}>{open ? '▲' : '▼'}</span>
            </div>

            {/* Expanded edit form */}
            {open && (
                <div style={{ borderTop: '1px solid #334155', padding: '20px', background: '#0f172a' }}>

                    {/* Stage Level Info */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '12px', marginBottom: '16px' }}>
                        <div>
                            <label style={{ fontSize: '11px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>Overall Status</label>
                            <select value={form.status} onChange={e => set('status', e.target.value)} disabled={!canEdit} style={{ ...inp, cursor: canEdit ? 'pointer' : 'not-allowed' }}>
                                {['Not Started', 'Running', 'Completed', 'QC Hold', 'Failed', 'Rework'].map(s => <option key={s}>{s}</option>)}
                            </select>
                        </div>
                        <div>
                            <label style={{ fontSize: '11px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>Start Date/Time</label>
                            <input type="datetime-local" value={form.startTime} onChange={e => set('startTime', e.target.value)} style={inp} disabled={!canEdit} />
                        </div>
                        <div>
                            <label style={{ fontSize: '11px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>End Date/Time</label>
                            <input type="datetime-local" value={form.endTime} onChange={e => set('endTime', e.target.value)} style={inp} disabled={!canEdit} />
                        </div>
                        <div>
                            <label style={{ fontSize: '11px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>Current Operator</label>
                            <input value={form.operator} onChange={e => set('operator', e.target.value)} style={inp} disabled={!canEdit} />
                        </div>
                        <div>
                            <label style={{ fontSize: '11px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>Line</label>
                            <input value={form.line} onChange={e => set('line', e.target.value)} style={inp} disabled={!canEdit} />
                        </div>
                    </div>

                    <div style={{ marginBottom: '16px' }}>
                        <label style={{ fontSize: '11px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>Remarks</label>
                        <textarea rows={2} value={form.remarks} onChange={e => set('remarks', e.target.value)} style={{ ...inp, resize: 'vertical' }} disabled={!canEdit} />
                    </div>

                    {/* Aggregate Totals (Read Only) */}
                    <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', background: '#1e293b', padding: '12px', borderRadius: '8px', border: '1px solid #334155' }}>
                        <div style={{ flex: 1, textAlign: 'center' }}><div style={{ fontSize: '11px', color: '#94a3b8' }}>Target Qty</div><div style={{ fontSize: '16px', fontWeight: 600, color: '#f1f5f9' }}>{targetQty}</div></div>
                        <div style={{ width: '1px', background: '#334155' }}></div>
                        <div style={{ flex: 1, textAlign: 'center' }}><div style={{ fontSize: '11px', color: '#94a3b8' }}>Pending to Start</div><div style={{ fontSize: '16px', fontWeight: 600, color: '#fcd34d' }}>{pendingToStart}</div></div>
                        <div style={{ width: '1px', background: '#334155' }}></div>
                        <div style={{ flex: 1, textAlign: 'center' }}><div style={{ fontSize: '11px', color: '#94a3b8' }}>Total Input</div><div style={{ fontSize: '16px', fontWeight: 600, color: '#3b82f6' }}>{totalInput}</div></div>
                        <div style={{ width: '1px', background: '#334155' }}></div>
                        <div style={{ flex: 1, textAlign: 'center' }}><div style={{ fontSize: '11px', color: '#94a3b8' }}>Balance in Process</div><div style={{ fontSize: '16px', fontWeight: 700, color: '#10b981' }}>{balanceInProcess}</div></div>
                        <div style={{ width: '1px', background: '#334155' }}></div>
                        <div style={{ flex: 1, textAlign: 'center' }}><div style={{ fontSize: '11px', color: '#94a3b8' }}>Total Output</div><div style={{ fontSize: '16px', fontWeight: 600, color: '#f1f5f9' }}>{totalOutput}</div></div>
                        <div style={{ width: '1px', background: '#334155' }}></div>
                        <div style={{ flex: 1, textAlign: 'center' }}><div style={{ fontSize: '11px', color: '#94a3b8' }}>Total Rework</div><div style={{ fontSize: '16px', fontWeight: 600, color: '#a78bfa' }}>{totalRework}</div></div>
                        <div style={{ width: '1px', background: '#334155' }}></div>
                        <div style={{ flex: 1, textAlign: 'center' }}><div style={{ fontSize: '11px', color: '#94a3b8' }}>Total Rejection</div><div style={{ fontSize: '16px', fontWeight: 600, color: '#ef4444' }}>{totalRejection}</div></div>
                    </div>

                    {/* Execution Logs Table */}
                    <div style={{ marginBottom: '20px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                            <div style={{ fontSize: '13px', fontWeight: 600, color: '#e2e8f0' }}>Execution Runs ({productionLogs.length})</div>
                            {canEdit && !showNewLog && (
                                <button onClick={() => setShowNewLog(true)} style={{ padding: '4px 10px', background: '#334155', color: '#f1f5f9', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', fontWeight: 600 }}>+ Add Run Log</button>
                            )}
                        </div>

                        {productionLogs.length > 0 && (
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', marginBottom: '12px' }}>
                                <thead>
                                    <tr style={{ background: '#1e293b', color: '#94a3b8', textAlign: 'left' }}>
                                        <th style={{ padding: '8px', borderBottom: '1px solid #334155' }}>Start</th>
                                        <th style={{ padding: '8px', borderBottom: '1px solid #334155' }}>End</th>
                                        <th style={{ padding: '8px', borderBottom: '1px solid #334155' }}>Operator</th>
                                        <th style={{ padding: '8px', borderBottom: '1px solid #334155' }}>Started</th>
                                        <th style={{ padding: '8px', borderBottom: '1px solid #334155' }}>Completed</th>
                                        <th style={{ padding: '8px', borderBottom: '1px solid #334155' }}>Rw</th>
                                        <th style={{ padding: '8px', borderBottom: '1px solid #334155' }}>Rej</th>
                                        <th style={{ padding: '8px', borderBottom: '1px solid #334155' }}></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {productionLogs.map((l, i) => (
                                        <tr key={i} style={{ borderBottom: '1px solid #1e293b' }}>
                                            <td style={{ padding: '8px', color: '#f1f5f9' }}>{l.startTime ? new Date(l.startTime).toLocaleString() : '—'}</td>
                                            <td style={{ padding: '8px', color: '#f1f5f9' }}>{l.endTime ? new Date(l.endTime).toLocaleString() : '—'}</td>
                                            <td style={{ padding: '8px', color: '#94a3b8' }}>{l.operator || '—'}</td>
                                            <td style={{ padding: '8px', color: '#f1f5f9' }}>{l.inputQty}</td>
                                            <td style={{ padding: '8px', color: '#10b981' }}>{l.outputQty}</td>
                                            <td style={{ padding: '8px', color: '#a78bfa' }}>{l.reworkQty}</td>
                                            <td style={{ padding: '8px', color: '#ef4444' }}>{l.rejectionQty}</td>
                                            <td style={{ padding: '8px', textAlign: 'right' }}>
                                                {canEdit && (
                                                    <button onClick={() => setProductionLogs(logs => logs.filter((_, idx) => idx !== i))} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '12px' }}>✕</button>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}

                        {/* Add Run Log Form */}
                        {showNewLog && (
                            <div style={{ background: '#1e293b', border: '1px solid #3b82f6', borderRadius: '8px', padding: '16px' }}>
                                <div style={{ fontSize: '12px', fontWeight: 600, color: '#60a5fa', marginBottom: '12px' }}>New Run Details</div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '12px' }}>
                                    <div><label style={{ fontSize: '10px', color: '#94a3b8' }}>Start Time</label><input type="datetime-local" value={newLog.startTime} onChange={e => setLog('startTime', e.target.value)} style={{ ...inp, padding: '6px' }} /></div>
                                    <div><label style={{ fontSize: '10px', color: '#94a3b8' }}>End Time</label><input type="datetime-local" value={newLog.endTime} onChange={e => setLog('endTime', e.target.value)} style={{ ...inp, padding: '6px' }} /></div>
                                    <div style={{ gridColumn: 'span 2' }}><label style={{ fontSize: '10px', color: '#94a3b8' }}>Operator</label><input value={newLog.operator} onChange={e => setLog('operator', e.target.value)} placeholder="Run operator..." style={{ ...inp, padding: '6px' }} /></div>

                                    <div><label style={{ fontSize: '10px', color: '#94a3b8' }}>Qty Started</label><input type="number" value={newLog.inputQty} onChange={e => setLog('inputQty', Number(e.target.value))} style={{ ...inp, padding: '6px' }} /></div>
                                    <div><label style={{ fontSize: '10px', color: '#94a3b8' }}>Qty Completed</label><input type="number" value={newLog.outputQty} onChange={e => setLog('outputQty', Number(e.target.value))} style={{ ...inp, padding: '6px' }} /></div>
                                    <div><label style={{ fontSize: '10px', color: '#94a3b8' }}>Rework Qty</label><input type="number" value={newLog.reworkQty} onChange={e => setLog('reworkQty', Number(e.target.value))} style={{ ...inp, padding: '6px' }} /></div>
                                    <div><label style={{ fontSize: '10px', color: '#94a3b8' }}>Rejection Qty</label><input type="number" value={newLog.rejectionQty} onChange={e => setLog('rejectionQty', Number(e.target.value))} style={{ ...inp, padding: '6px' }} /></div>
                                </div>
                                <div style={{ marginBottom: '12px' }}>
                                    <label style={{ fontSize: '10px', color: '#94a3b8' }}>Rejection Reason (if any)</label>
                                    <input value={newLog.rejectionReason} onChange={e => setLog('rejectionReason', e.target.value)} style={{ ...inp, padding: '6px' }} />
                                </div>

                                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                    <button onClick={() => setShowNewLog(false)} style={{ padding: '6px 12px', background: 'transparent', color: '#94a3b8', border: '1px solid #475569', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>Cancel</button>
                                    <button onClick={handleAddLog} style={{ padding: '6px 12px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', fontWeight: 600 }}>Save Log temporarily</button>
                                </div>
                            </div>
                        )}
                    </div>

                    {canEdit && (
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', borderTop: '1px solid #334155', paddingTop: '16px' }}>
                            <button onClick={() => setOpen(false)}
                                style={{ padding: '8px 16px', borderRadius: '7px', background: '#334155', color: '#f1f5f9', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '13px' }}>
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
function QcTestingTab({ wo, load }) {
    const qcStages = (wo.stages || []).filter(s => s.isQcGate || s.isTestGate);
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
        <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '12px', padding: '20px', marginBottom: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: sc.bg, border: `2px solid ${sc.color}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: sc.color, fontWeight: 700 }}>
                    {sc.icon}
                </div>
                <div>
                    <span style={{ fontWeight: 700, fontSize: '15px', color: '#f1f5f9' }}>#{stage.seq} {stage.stageName}</span>
                    <span style={{ marginLeft: '8px', padding: '3px 8px', borderRadius: '10px', fontSize: '10px', fontWeight: 600, background: sc.bg, color: sc.color }}>{stage.status}</span>
                </div>
            </div>

            {/* Checklist */}
            {checklist.length > 0 && (
                <div style={{ marginBottom: '16px' }}>
                    <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 600, marginBottom: '10px' }}>CHECKLIST</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {checklist.map((c, i) => (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', background: '#0f172a', padding: '10px 14px', borderRadius: '8px' }}>
                                <span style={{ flex: 1, fontSize: '13px', color: '#e2e8f0' }}>{c.item}</span>
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
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {shortages.map(m => (
                            <div key={m._id} style={{ display: 'flex', alignItems: 'center', gap: '12px', background: m.isMandatory ? '#1a0608' : '#1e293b', border: `1px solid ${m.isMandatory ? '#7f1d1d' : '#334155'}`, borderRadius: '8px', padding: '12px 16px' }}>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontWeight: 600, color: m.isMandatory ? '#fca5a5' : '#f1f5f9', fontSize: '14px' }}>{m.itemName}</div>
                                    <div style={{ color: '#64748b', fontSize: '12px' }}>Required: {m.requiredQty} | Short: {m.shortQty} | {m.procurementStatus}</div>
                                </div>
                                {m.isMandatory && <span style={{ padding: '3px 8px', borderRadius: '10px', background: '#450a0a', color: '#fca5a5', fontSize: '11px', fontWeight: 700, border: '1px solid #dc2626' }}>MANDATORY</span>}
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
