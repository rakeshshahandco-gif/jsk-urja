import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { createWorkOrder } from '@/services/workOrderApi';
import { getBOMs } from '@/services/bomApi';
import { PATHS } from '@/routes/paths';
import toast from 'react-hot-toast';

const Field = ({ label, required, children }) => (
    <div>
        <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#94a3b8', marginBottom: '6px' }}>
            {label}{required && <span style={{ color: '#ef4444' }}> *</span>}
        </label>
        {children}
    </div>
);

const inputSt = {
    width: '100%', padding: '10px 14px', background: '#1e293b',
    border: '1px solid #334155', borderRadius: '8px', color: '#f1f5f9',
    fontSize: '14px', outline: 'none', boxSizing: 'border-box',
};

export default function WorkOrderFormPage() {
    const navigate = useNavigate();
    const [boms, setBoms] = useState([]);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState({
        bomId: '',
        targetQty: 1,
        priority: 'Medium',
        plannedStart: '',
        plannedEnd: '',
        supervisor: '',
        remarks: '',
    });

    useEffect(() => {
        getBOMs({ status: 'Approved', limit: 200 })
            .then(d => setBoms(Array.isArray(d.data) ? d.data : []))
            .catch(() => { });
    }, []);

    const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!form.bomId) return toast.error('Please select a BOM');
        if (!form.targetQty) return toast.error('Enter target quantity');

        setSaving(true);
        try {
            const wo = await createWorkOrder(form);
            toast.success(`Work Order ${wo.woNumber} created!`);
            navigate(PATHS.PRODUCTION.WO_DETAIL(wo._id));
        } catch (err) {
            toast.error(err.response?.data?.message || err.message || 'Failed to create');
        } finally { setSaving(false); }
    };

    return (
        <div style={{ padding: '28px', fontFamily: "'Inter', sans-serif", background: '#0f172a', minHeight: '100vh', color: '#f1f5f9' }}>
            <div style={{ maxWidth: '700px', margin: '0 auto' }}>
                {/* Header */}
                <div style={{ marginBottom: '24px' }}>
                    <button
                        onClick={() => navigate(PATHS.PRODUCTION.WORK_ORDERS)}
                        style={{ background: 'none', border: 'none', color: '#64748b', fontSize: '13px', cursor: 'pointer', padding: 0, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}
                    >← Back to Work Orders</button>
                    <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 700 }}>New Work Order</h1>
                    <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: '13px' }}>Select BOM and define production targets</p>
                </div>

                <form onSubmit={handleSubmit}>
                    <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '14px', padding: '28px', display: 'flex', flexDirection: 'column', gap: '20px' }}>

                        {/* BOM Selection */}
                        <Field label="Bill of Materials (BOM)" required>
                            <select
                                value={form.bomId}
                                onChange={e => set('bomId', e.target.value)}
                                style={{ ...inputSt, cursor: 'pointer' }}
                                required
                            >
                                <option value="">— Select BOM —</option>
                                {boms.map(b => (
                                    <option key={b._id} value={b._id}>
                                        {b.bomNumber} — {b.finishedProductId?.name || b.finishedProductName || ''} {b.version ? `(${b.version})` : ''}
                                    </option>
                                ))}
                            </select>
                        </Field>

                        {/* Qty + Priority */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                            <Field label="Target Quantity" required>
                                <input
                                    type="number" min="1" value={form.targetQty}
                                    onChange={e => set('targetQty', Number(e.target.value))}
                                    style={inputSt}
                                />
                            </Field>
                            <Field label="Priority">
                                <select value={form.priority} onChange={e => set('priority', e.target.value)} style={{ ...inputSt, cursor: 'pointer' }}>
                                    {['Low', 'Medium', 'High', 'Urgent'].map(p => <option key={p}>{p}</option>)}
                                </select>
                            </Field>
                        </div>

                        {/* Dates */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                            <Field label="Planned Start">
                                <input type="date" value={form.plannedStart} onChange={e => set('plannedStart', e.target.value)} style={inputSt} />
                            </Field>
                            <Field label="Planned End">
                                <input type="date" value={form.plannedEnd} onChange={e => set('plannedEnd', e.target.value)} style={inputSt} />
                            </Field>
                        </div>

                        {/* Supervisor */}
                        <Field label="Supervisor">
                            <input
                                type="text" placeholder="Supervisor name"
                                value={form.supervisor} onChange={e => set('supervisor', e.target.value)}
                                style={inputSt}
                            />
                        </Field>

                        <Field label="Remarks">
                            <textarea
                                rows={3} placeholder="Any special instructions..."
                                value={form.remarks} onChange={e => set('remarks', e.target.value)}
                                style={{ ...inputSt, resize: 'vertical' }}
                            />
                        </Field>

                        {/* Info box */}
                        <div style={{ background: '#0f172a', border: '1px solid #1e40af', borderRadius: '8px', padding: '14px', fontSize: '13px', color: '#93c5fd' }}>
                            ℹ️ After creating the WO, go to the <strong>BOM & Material</strong> tab to review component availability before releasing to production.
                        </div>

                        {/* Actions */}
                        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                            <button
                                type="button" onClick={() => navigate(PATHS.PRODUCTION.WORK_ORDERS)}
                                style={{ padding: '10px 20px', borderRadius: '8px', background: '#334155', color: '#f1f5f9', border: 'none', cursor: 'pointer', fontWeight: 600 }}
                            >Cancel</button>
                            <button
                                type="submit" disabled={saving}
                                style={{
                                    padding: '10px 24px', borderRadius: '8px',
                                    background: saving ? '#334155' : 'linear-gradient(135deg,#3b82f6,#6366f1)',
                                    color: '#fff', border: 'none', cursor: saving ? 'not-allowed' : 'pointer',
                                    fontWeight: 600, fontSize: '14px',
                                }}
                            >{saving ? 'Creating...' : 'Create Work Order'}</button>
                        </div>
                    </div>
                </form>
            </div>
        </div>
    );
}
