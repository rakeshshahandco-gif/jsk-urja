import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    getWorkOrderById, releaseWorkOrder, updateWorkOrder, updateStage, updateMaterialStatus, refreshMaterialStock,
    addProductionLog, deleteProductionLog
} from '@/services/workOrderApi';
import { PATHS } from '@/routes/paths';
import toast from 'react-hot-toast';

// ─── Status Colors ───────────────────────────────────────────────────────────
const WO_STATUS_COLORS = {
    'Draft': { color: '#000000', bg: '#e2e8f0' },
    'Released': { color: '#000000', bg: '#bfdbfe' },
    'In Process': { color: '#000000', bg: '#a7f3d0' },
    'WIP – Waiting Material': { color: '#000000', bg: '#fecaca' },
    'On Hold': { color: '#000000', bg: '#e9d5ff' },
    'Completed': { color: '#000000', bg: '#6ee7b7' },
    'Closed': { color: '#000000', bg: '#cbd5e1' },
};

const STAGE_STATUS_COLORS = {
    'Not Started': { color: '#000000', bg: '#e2e8f0', icon: '○' },
    'Running': { color: '#000000', bg: '#fde68a', icon: '▶' },
    'Completed': { color: '#000000', bg: '#a7f3d0', icon: '✓' },
    'QC Hold': { color: '#000000', bg: '#fed7aa', icon: '⏸' },
    'Failed': { color: '#000000', bg: '#fecaca', icon: '✕' },
    'Rework': { color: '#000000', bg: '#ddd6fe', icon: '↺' },
};

const TABS = ['Overview', 'BOM & Material', 'Process Execution', 'QC & Testing', 'WIP & Exceptions', 'Material History'];

// ─── Input style ─────────────────────────────────────────────────────────────
const inp = {
    padding: '8px 12px', background: '#ffffff', border: '1px solid #d1d5db',
    borderRadius: '6px', color: '#1e293b', fontSize: '13px', outline: 'none', width: '100%', boxSizing: 'border-box',
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

    if (loading) return <div style={{ padding: '60px', textAlign: 'center', color: '#64748b', background: '#f8f9fa', minHeight: '100vh' }}>Loading...</div>;
    if (!wo) return <div style={{ padding: '60px', textAlign: 'center', color: '#ef4444', background: '#f8f9fa', minHeight: '100vh' }}>Work Order not found</div>;

    const handlePrintProductionSheet = () => {
        const printWindow = window.open('', '', 'width=900,height=800');

        let emptyRows1 = '';
        for (let i = 0; i < 5; i++) {
            emptyRows1 += `<tr style="height:45px">
                <td style="border:1px solid #000; padding:4px;"></td>
                <td style="border:1px solid #000; padding:4px;"></td>
                <td style="border:1px solid #000; padding:4px;"></td>
                <td style="border:1px solid #000; padding:4px;"></td>
                <td style="border:1px solid #000; padding:4px;"></td>
                <td style="border:1px solid #000; padding:4px;"></td>
            </tr>`;
        }

        let emptyRows2 = '';
        for (let i = 0; i < 6; i++) {
            emptyRows2 += `<tr style="height:35px">
                <td style="border:1px solid #000; padding:4px;"></td>
                <td style="border:1px solid #000; padding:4px;"></td>
                <td style="border:1px solid #000; padding:4px;"></td>
                <td style="border:1px solid #000; padding:4px;"></td>
                <td style="border:1px solid #000; padding:4px; border-left: 2px solid #000;"></td>
                <td style="border:1px solid #000; padding:4px;"></td>
                <td style="border:1px solid #000; padding:4px;"></td>
                <td style="border:1px solid #000; padding:4px;"></td>
            </tr>`;
        }

        const html = `
            <html>
            <head>
                <title>Production Sheet - ${wo.woNumber}</title>
                <style>
                    body { font-family: sans-serif; font-size: 11px; margin: 0; padding: 20px; box-sizing: border-box; }
                    .header-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; border: 1px solid #000; }
                    .header-table td { border: 1px solid #000; padding: 6px; }
                    .grid-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; border: 1px solid #000; text-align: center; }
                    .grid-table th { background: #f8f9fa; border: 1px solid #000; padding: 6px; font-weight: bold; }
                    .grid-table td { border: 1px solid #000; padding: 6px; }
                    .section-title { font-weight: bold; font-size: 12px; background: #f8f9fa; text-align: center; padding: 6px; border: 1px solid #000; text-transform: uppercase; }
                    @media print {
                        @page { size: A4 portrait; margin: 10mm; }
                        body { margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; width: 190mm; }
                    }
                </style>
            </head>
            <body>
                <table class="header-table">
                    <tr>
                        <td>Status : ${wo.status}</td>
                        <td>Company : JSK Innovative Technology Pvt Ltd</td>
                    </tr>
                    <tr>
                        <td>Item to Manufacture : ${wo.finishedProductName || '—'}</td>
                        <td>Qty to Manufacture : ${wo.targetQty}</td>
                    </tr>
                    <tr>
                        <td>Bom No : ${wo.bomVersion || '—'}</td>
                        <td>Target Warehouse : ${wo.targetWarehouse || 'Finished Goods - JITPL'}</td>
                    </tr>
                    <tr>
                        <td>Planned Start Date : ${wo.plannedStart ? new Date(wo.plannedStart).toLocaleString() : 'None'}</td>
                        <td>Actual Start Date : ${wo.actualStart ? new Date(wo.actualStart).toLocaleString() : 'None'}</td>
                    </tr>
                </table>

                <table class="grid-table">
                    <tr>
                        <th style="width:120px;"></th>
                        <th>Wo No</th><th>Date</th><th>Qty-Panel</th><th>Qty</th><th>Sign</th><th>Ent.</th>
                    </tr>
                    <tr><td style="font-weight:bold; height:60px;">SMD</td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
                    <tr><td style="font-weight:bold; height:60px;">Wave/Reflow</td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
                    <tr><td style="font-weight:bold; height:60px;">Lac/Clean</td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
                    <tr><td style="font-weight:bold; height:60px;">Dummy</td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
                    <tr><td style="font-weight:bold; height:60px;">Faulty</td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
                </table>

                <table class="grid-table" style="margin-top:20px;">
                    <tr>
                        <td colspan="4" class="section-title">TH-MOUNTING</td>
                        <td colspan="4" class="section-title" style="border-left: 2px solid #000;">TOUCH-UP</td>
                    </tr>
                    <tr>
                        <th>DATE</th><th>NAME</th><th>QTY</th><th>SIGN</th>
                        <th style="border-left: 2px solid #000;">DATE</th><th>NAME</th><th>QTY</th><th>SIGN</th>
                    </tr>
                    ${emptyRows2}
                    <tr>
                        <td colspan="4" class="section-title">1ST QC</td>
                        <td colspan="4" class="section-title" style="border-left: 2px solid #000;">FINAL QC</td>
                    </tr>
                    <tr>
                        <th>DATE</th><th>NAME</th><th>QTY</th><th>SIGN</th>
                        <th style="border-left: 2px solid #000;">DATE</th><th>NAME</th><th>QTY</th><th>SIGN</th>
                    </tr>
                    ${emptyRows2}
                </table>
            </body>
            </html>
        `;
        printWindow.document.write(html);
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => {
            printWindow.print();
            printWindow.close();
        }, 250);
    };

    const sc = WO_STATUS_COLORS[wo.status] || WO_STATUS_COLORS['Draft'];
    const pct = wo.stages?.length ? Math.round((wo.stages.filter(s => s.status === 'Completed').length / wo.stages.length) * 100) : 0;
    const mandatoryShortages = (wo.materialStatus || []).filter(m => m.isMandatory && m.shortQty > 0);

    return (
        <div style={{ fontFamily: "'Inter', sans-serif", background: '#f8f9fa', minHeight: '100vh', color: '#1e293b' }}>
            {/* Top bar */}
            <div style={{ background: '#ffffff', borderBottom: '1px solid #e5e7eb', padding: '16px 28px' }}>
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
                {tab === 0 && <OverviewTab wo={wo} load={load} />}
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
function OverviewTab({ wo, load }) {
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

    const rows = [
        ['WO Number', wo.woNumber],
        ['Status', wo.status],
        ['BOM Version', wo.bomVersion || '—'],
        ['Finished Product', wo.finishedProductName || '—'],
        ['Target Qty', editing ? (
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
        ['Supervisor', editing ? <input type="text" value={form.supervisor} onChange={e => set('supervisor', e.target.value)} style={inputStyle} /> : (wo.supervisor || '—')],
        ['Remarks', editing ? <textarea value={form.remarks} onChange={e => set('remarks', e.target.value)} style={{ ...inputStyle, resize: 'vertical' }} /> : (wo.remarks || '—')],
        ['Created', fmt(wo.createdAt)],
    ];

    return (
        <div style={{ maxWidth: '800px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 700 }}>Work Order Details</h2>
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
                        <tr style={{ background: '#f9fafb' }}>
                            {['Item', 'UOM', 'Required Qty', 'Available', 'Short Qty', 'Mandatory', 'Procurement Status', 'Remarks'].map(h => (
                                <th key={h} style={{ padding: '10px 12px', textAlign: 'left', color: '#6b7280', fontWeight: 600, borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>{h}</th>
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
                                    style={{ background: isMandShort ? '#fff1f2' : i % 2 === 0 ? '#ffffff' : '#f9fafb' }}>
                                    <td style={{ padding: '10px 12px', color: isMandShort ? '#dc2626' : '#374151', fontWeight: isMandShort ? 600 : 400, borderBottom: '1px solid #e5e7eb' }}>
                                        {m.itemName}
                                        {isMandShort && <span style={{ marginLeft: '6px', fontSize: '10px', background: '#dc2626', color: '#fff', padding: '1px 5px', borderRadius: '3px' }}>SHORT</span>}
                                    </td>
                                    <td style={{ padding: '10px 12px', color: '#6b7280', borderBottom: '1px solid #e5e7eb' }}>{m.uom || '—'}</td>
                                    <td style={{ padding: '10px 12px', color: '#1e293b', borderBottom: '1px solid #e5e7eb' }}>{m.requiredQty}</td>
                                    <td style={{ padding: '10px 12px', borderBottom: '1px solid #e5e7eb' }}>
                                        <input type="number" defaultValue={m.availableStock}
                                            onChange={e => setUpd(m._id, 'availableStock', Number(e.target.value))}
                                            style={{ ...inp, width: '80px' }} />
                                    </td>
                                    <td style={{ padding: '10px 12px', borderBottom: '1px solid #e5e7eb' }}>
                                        <input type="number" defaultValue={m.shortQty}
                                            onChange={e => setUpd(m._id, 'shortQty', Number(e.target.value))}
                                            style={{ ...inp, width: '70px', color: isShort ? '#dc2626' : '#1e293b' }} />
                                    </td>
                                    <td style={{ padding: '10px 12px', borderBottom: '1px solid #e5e7eb' }}>
                                        <input type="checkbox" defaultChecked={m.isMandatory}
                                            onChange={e => setUpd(m._id, 'isMandatory', e.target.checked)} />
                                    </td>
                                    <td style={{ padding: '10px 12px', borderBottom: '1px solid #e5e7eb' }}>
                                        <select defaultValue={m.procurementStatus}
                                            onChange={e => setUpd(m._id, 'procurementStatus', e.target.value)}
                                            style={{ ...inp, width: '140px', cursor: 'pointer' }}>
                                            {['Not Ordered', 'Ordered', 'In Transit', 'Received'].map(s => <option key={s}>{s}</option>)}
                                        </select>
                                    </td>
                                    <td style={{ padding: '10px 12px', borderBottom: '1px solid #e5e7eb' }}>
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

    return (
        <div style={{ maxWidth: '900px' }}>
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
