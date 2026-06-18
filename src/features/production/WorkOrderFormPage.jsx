import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { createWorkOrder } from '@/services/workOrderApi';
import { getBOMs } from '@/services/bomApi';
import { getItems } from '@/services/itemApi';
import { getCompanyWorkflowAssignment } from '@/services/companyWorkflowAssignmentApi';
import SearchableSelect from '@/components/ui/SearchableSelect';
import { useCompany } from '@/contexts/CompanyContext';
import { isTextileIndustryCompany } from '@/utils/industryInventoryLabels';
import { getWorkOrderLabels, mapWorkflowPreviewToDisplayStages } from '@/utils/textileWorkOrder';
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
    width: '100%', padding: '10px 14px', background: '#ffffff',
    border: '1px solid #d1d5db', borderRadius: '8px', color: '#1e293b',
    fontSize: '14px', outline: 'none', boxSizing: 'border-box',
};

export default function WorkOrderFormPage() {
    const navigate = useNavigate();
    const { selectedCompany } = useCompany();
    const isTextile = isTextileIndustryCompany(selectedCompany);
    const labels = getWorkOrderLabels(isTextile);

    const [boms, setBoms] = useState([]);
    const [items, setItems] = useState([]);
    const [processRoute, setProcessRoute] = useState('');
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState({
        bomId: '',
        targetQty: 1,
        priority: 'Medium',
        plannedStart: '',
        plannedEnd: '',
        supervisor: '',
        remarks: '',
        designNo: '',
        colour: '',
        size: '',
        requiredFabricMeter: '',
        fabricItemId: '',
        lotNo: '',
        thanNo: '',
        rollNo: '',
        assignedVendorWorker: '',
    });

    useEffect(() => {
        getBOMs({ status: 'Approved', limit: 5000 })
            .then(d => setBoms(Array.isArray(d.data) ? d.data : []))
            .catch(() => { });
    }, []);

    useEffect(() => {
        if (!isTextile) return;
        getItems({ limit: 500 }).then(d => setItems(d.items || d.data || [])).catch(() => { });
    }, [isTextile]);

    useEffect(() => {
        if (!isTextile || !selectedCompany?._id) return;
        getCompanyWorkflowAssignment(selectedCompany._id)
            .then((data) => {
                const stages = mapWorkflowPreviewToDisplayStages(data?.previewStages || []);
                setProcessRoute(stages.map(s => s.name).join(' → '));
            })
            .catch(() => setProcessRoute(''));
    }, [isTextile, selectedCompany?._id]);

    const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!form.bomId) return toast.error('Please select a BOM / Finished Item');
        if (!form.targetQty) return toast.error('Enter order quantity');

        const payload = {
            bomId: form.bomId,
            targetQty: form.targetQty,
            priority: form.priority,
            plannedStart: form.plannedStart || undefined,
            plannedEnd: form.plannedEnd || undefined,
            supervisor: isTextile ? (form.assignedVendorWorker || form.supervisor) : form.supervisor,
            remarks: form.remarks,
        };

        if (isTextile) {
            const fabricItem = items.find(i => i._id === form.fabricItemId);
            payload.textile = {
                designNo: form.designNo,
                colour: form.colour,
                size: form.size,
                requiredFabricMeter: form.requiredFabricMeter ? Number(form.requiredFabricMeter) : 0,
                fabricItemId: form.fabricItemId || undefined,
                fabricItemName: fabricItem?.itemName || '',
                lotNo: form.lotNo,
                thanNo: form.thanNo,
                rollNo: form.rollNo,
                processRoute: processRoute || form.processRoute || '',
                assignedVendorWorker: form.assignedVendorWorker || form.supervisor,
            };
        }

        setSaving(true);
        try {
            const wo = await createWorkOrder(payload);
            toast.success(`${isTextile ? 'Textile Job Order' : 'Work Order'} ${wo.woNumber} created!`);
            navigate(PATHS.PRODUCTION.WO_DETAIL(wo._id));
        } catch (err) {
            toast.error(err.response?.data?.message || err.message || 'Failed to create');
        } finally { setSaving(false); }
    };

    return (
        <div style={{ padding: '28px', fontFamily: "'Inter', sans-serif", background: '#f8f9fa', minHeight: '100vh', color: '#1e293b' }}>
            <div style={{ maxWidth: isTextile ? '900px' : '700px', margin: '0 auto' }}>
                <div style={{ marginBottom: '24px' }}>
                    <button
                        onClick={() => navigate(PATHS.PRODUCTION.WORK_ORDERS)}
                        style={{ background: 'none', border: 'none', color: '#64748b', fontSize: '13px', cursor: 'pointer', padding: 0, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}
                    >{labels.backLink}</button>
                    <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 700 }}>{labels.newTitle}</h1>
                    <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: '13px' }}>{labels.newSubtitle}</p>
                </div>

                <form onSubmit={handleSubmit}>
                    <div style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '14px', padding: '28px', display: 'flex', flexDirection: 'column', gap: '20px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>

                        <div style={{ display: 'grid', gridTemplateColumns: isTextile ? '1fr 1fr' : '1fr 1fr', gap: '16px' }}>
                            <Field label={isTextile ? 'Job Order Number (Manual/Auto)' : 'Work Order Number (Manual/Auto)'}>
                                <input
                                    type="text" placeholder="Leave blank for auto-generate"
                                    value={form.woNumber || ''} onChange={e => set('woNumber', e.target.value)}
                                    style={inputSt}
                                />
                            </Field>
                            <Field label={isTextile ? 'Finished Item (BOM)' : 'Bill of Materials (BOM)'} required>
                                <SearchableSelect
                                    options={boms.map(b => ({
                                        value: b._id,
                                        label: `${b.bomNumber} - ${b.finishedProductId?.name || b.finishedProductName || ''} ${b.version ? `(${b.version})` : ''}`,
                                        meta: b.bomNumber
                                    }))}
                                    value={form.bomId}
                                    onChange={v => set('bomId', v)}
                                    placeholder="— Search BOM or Finished Item —"
                                />
                            </Field>
                        </div>

                        {isTextile && (
                            <>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
                                    <Field label="Design No">
                                        <input type="text" placeholder="e.g. XYZ-100" value={form.designNo} onChange={e => set('designNo', e.target.value)} style={inputSt} />
                                    </Field>
                                    <Field label="Colour">
                                        <input type="text" value={form.colour} onChange={e => set('colour', e.target.value)} style={inputSt} />
                                    </Field>
                                    <Field label="Size">
                                        <input type="text" value={form.size} onChange={e => set('size', e.target.value)} style={inputSt} />
                                    </Field>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
                                    <Field label="Order Qty (PCS)" required>
                                        <input type="number" min="1" value={form.targetQty} onChange={e => set('targetQty', Number(e.target.value))} style={inputSt} />
                                    </Field>
                                    <Field label="Required Fabric (Meter)">
                                        <input type="number" min="0" step="any" value={form.requiredFabricMeter} onChange={e => set('requiredFabricMeter', e.target.value)} style={inputSt} />
                                    </Field>
                                    <Field label="Fabric Item">
                                        <select value={form.fabricItemId} onChange={e => set('fabricItemId', e.target.value)} style={{ ...inputSt, cursor: 'pointer' }}>
                                            <option value="">— Select fabric —</option>
                                            {items.map(it => (
                                                <option key={it._id} value={it._id}>{it.itemCode ? `${it.itemCode} — ` : ''}{it.itemName}</option>
                                            ))}
                                        </select>
                                    </Field>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
                                    <Field label="Lot No">
                                        <input type="text" value={form.lotNo} onChange={e => set('lotNo', e.target.value)} style={inputSt} />
                                    </Field>
                                    <Field label="Than No">
                                        <input type="text" value={form.thanNo} onChange={e => set('thanNo', e.target.value)} style={inputSt} />
                                    </Field>
                                    <Field label="Roll No">
                                        <input type="text" value={form.rollNo} onChange={e => set('rollNo', e.target.value)} style={inputSt} />
                                    </Field>
                                </div>
                                <Field label="Process Route (from assigned workflow)">
                                    <input type="text" readOnly value={processRoute} placeholder="Assign a textile workflow in Company Profile" style={{ ...inputSt, background: '#f8fafc', color: '#475569' }} />
                                </Field>
                                <Field label="Assigned Vendor / Worker">
                                    <input type="text" placeholder="Vendor or worker name" value={form.assignedVendorWorker} onChange={e => set('assignedVendorWorker', e.target.value)} style={inputSt} />
                                </Field>
                            </>
                        )}

                        {!isTextile && (
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                <Field label="Target Quantity" required>
                                    <input type="number" min="1" value={form.targetQty} onChange={e => set('targetQty', Number(e.target.value))} style={inputSt} />
                                </Field>
                                <Field label="Priority">
                                    <select value={form.priority} onChange={e => set('priority', e.target.value)} style={{ ...inputSt, cursor: 'pointer' }}>
                                        {['Low', 'Medium', 'High', 'Urgent'].map(p => <option key={p}>{p}</option>)}
                                    </select>
                                </Field>
                            </div>
                        )}

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                            <Field label="Expected Start">
                                <input type="date" value={form.plannedStart} onChange={e => set('plannedStart', e.target.value)} style={inputSt} />
                            </Field>
                            <Field label="Expected Completion Date">
                                <input type="date" value={form.plannedEnd} onChange={e => set('plannedEnd', e.target.value)} style={inputSt} />
                            </Field>
                        </div>

                        {!isTextile && (
                            <Field label="Supervisor">
                                <input type="text" placeholder="Supervisor name" value={form.supervisor} onChange={e => set('supervisor', e.target.value)} style={inputSt} />
                            </Field>
                        )}

                        {isTextile && (
                            <Field label="Priority">
                                <select value={form.priority} onChange={e => set('priority', e.target.value)} style={{ ...inputSt, cursor: 'pointer' }}>
                                    {['Low', 'Medium', 'High', 'Urgent'].map(p => <option key={p}>{p}</option>)}
                                </select>
                            </Field>
                        )}

                        <Field label="Remarks">
                            <textarea rows={3} placeholder="Any special instructions..." value={form.remarks} onChange={e => set('remarks', e.target.value)} style={{ ...inputSt, resize: 'vertical' }} />
                        </Field>

                        <div style={{ background: isTextile ? '#f5f3ff' : '#eff6ff', border: `1px solid ${isTextile ? '#ddd6fe' : '#bfdbfe'}`, borderRadius: '8px', padding: '14px', fontSize: '13px', color: isTextile ? '#6d28d9' : '#1d4ed8' }}>
                            {isTextile
                                ? <>ℹ️ After creating the job order, review <strong>BOM & Material</strong> for fabric availability, then release to start process-wise tracking (Dyeing → Printing → Embroidery → …).</>
                                : <>ℹ️ After creating the WO, go to the <strong>BOM & Material</strong> tab to review component availability before releasing to production.</>
                            }
                        </div>

                        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                            <button
                                type="button" onClick={() => { if (window.confirm('Discard changes and return to list?')) navigate(PATHS.PRODUCTION.WORK_ORDERS); }}
                                style={{ padding: '10px 20px', borderRadius: '8px', background: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0', cursor: 'pointer', fontWeight: 600 }}
                            >Cancel</button>
                            <button
                                type="submit" disabled={saving}
                                style={{
                                    padding: '10px 24px', borderRadius: '8px',
                                    background: saving ? '#334155' : (isTextile ? 'linear-gradient(135deg,#7c3aed,#6d28d9)' : 'linear-gradient(135deg,#3b82f6,#6366f1)'),
                                    color: '#fff', border: 'none', cursor: saving ? 'not-allowed' : 'pointer',
                                    fontWeight: 600, fontSize: '14px',
                                }}
                            >{saving ? 'Creating...' : (isTextile ? 'Create Textile Job Order' : 'Create Work Order')}</button>
                        </div>
                    </div>
                </form>
            </div>
        </div>
    );
}
