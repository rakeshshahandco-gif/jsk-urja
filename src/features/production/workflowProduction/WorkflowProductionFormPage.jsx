import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ChevronLeft, Save, RefreshCw } from 'lucide-react';
import { useCompany } from '@/contexts/CompanyContext';
import { PATHS } from '@/routes/paths';
import { getItems } from '@/services/itemApi';
import {
    createWorkflowProductionLot,
    getWorkflowPreviewForCompany,
} from '@/services/workflowProductionLotApi';
import { BrandedLoader } from '@/components/ui/BrandedLoading';

export default function WorkflowProductionFormPage() {
    const navigate = useNavigate();
    const { selectedCompany, companies } = useCompany();
    const [companyId, setCompanyId] = useState(selectedCompany?._id || '');
    const [preview, setPreview] = useState(null);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [items, setItems] = useState([]);
    const [itemId, setItemId] = useState('');
    const [qtyStarted, setQtyStarted] = useState('');
    const [batchNo, setBatchNo] = useState('');
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (selectedCompany?._id && !companyId) setCompanyId(selectedCompany._id);
    }, [selectedCompany?._id]);

    useEffect(() => {
        getItems({ limit: 500 }).then((d) => setItems(d.items || d.data || [])).catch(() => {});
    }, []);

    useEffect(() => {
        if (!companyId) {
            setPreview(null);
            return;
        }
        setPreviewLoading(true);
        getWorkflowPreviewForCompany(companyId)
            .then(setPreview)
            .catch((e) => {
                setPreview(null);
                toast.error(e.response?.data?.message || e.message || 'Failed to load workflow');
            })
            .finally(() => setPreviewLoading(false));
    }, [companyId]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!companyId) return toast.error('Select a company');
        if (!itemId) return toast.error('Select an item');
        if (!qtyStarted || Number(qtyStarted) <= 0) return toast.error('Enter valid qty started');
        if (!preview?.workflow) return toast.error('No active workflow assigned to this company');

        setSaving(true);
        try {
            const lot = await createWorkflowProductionLot({
                companyId,
                itemId,
                qtyStarted: Number(qtyStarted),
                batchNo: batchNo.trim() || undefined,
            });
            toast.success('Production lot created');
            navigate(PATHS.PRODUCTION.WORKFLOW_LOT_DETAIL(lot._id));
        } catch (err) {
            toast.error(err.response?.data?.message || err.message || 'Failed to create lot');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div style={{ padding: '16px 20px', maxWidth: 960, margin: '0 auto' }}>
            <button
                type="button"
                onClick={() => navigate(PATHS.PRODUCTION.WORKFLOW_LOTS)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 4, border: 'none', background: 'none', color: '#64748b', cursor: 'pointer', marginBottom: 12, fontSize: 13 }}
            >
                <ChevronLeft size={16} /> Back to list
            </button>

            <h1 style={{ margin: '0 0 4px', fontSize: 20, fontWeight: 700 }}>Create Production Lot</h1>
            <p style={{ margin: '0 0 16px', fontSize: 12, color: '#64748b' }}>
                Lot number is auto-generated. Workflow stages load from company assignment.
            </p>

            <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 14 }}>
                <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 16 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        <label style={{ display: 'grid', gap: 4 }}>
                            <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Company *</span>
                            <select value={companyId} onChange={(e) => setCompanyId(e.target.value)} required style={{ padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13 }}>
                                <option value="">Select company</option>
                                {(companies || []).map((c) => (
                                    <option key={c._id} value={c._id}>{c.companyName}</option>
                                ))}
                            </select>
                        </label>
                        <label style={{ display: 'grid', gap: 4 }}>
                            <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Batch No (optional)</span>
                            <input value={batchNo} onChange={(e) => setBatchNo(e.target.value)} placeholder="Defaults to lot no" style={{ padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13 }} />
                        </label>
                        <label style={{ display: 'grid', gap: 4 }}>
                            <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Item / Product *</span>
                            <select value={itemId} onChange={(e) => setItemId(e.target.value)} required style={{ padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13 }}>
                                <option value="">Select item</option>
                                {items.map((it) => (
                                    <option key={it._id} value={it._id}>{it.itemCode ? `${it.itemCode} — ` : ''}{it.itemName || it.name}</option>
                                ))}
                            </select>
                        </label>
                        <label style={{ display: 'grid', gap: 4 }}>
                            <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Qty Started *</span>
                            <input type="number" min="0.0001" step="any" value={qtyStarted} onChange={(e) => setQtyStarted(e.target.value)} required style={{ padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13 }} />
                        </label>
                    </div>
                </div>

                <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                        <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>Assigned Workflow Stages</h2>
                        <button type="button" onClick={() => companyId && getWorkflowPreviewForCompany(companyId).then(setPreview)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#2563eb', display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
                            <RefreshCw size={14} /> Refresh
                        </button>
                    </div>
                    {previewLoading ? (
                        <BrandedLoader message="Loading workflow..." />
                    ) : !companyId ? (
                        <p style={{ margin: 0, color: '#64748b', fontSize: 13 }}>Select a company to preview workflow.</p>
                    ) : preview?.warnings?.length ? (
                        <div style={{ padding: 12, background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, color: '#92400e', fontSize: 13 }}>
                            {preview.warnings.includes('no_active_workflow_assignment') && 'No active workflow assigned. Configure in Company Profile → Industry & Workflow.'}
                            {preview.warnings.includes('workflow_not_found') && ' Assigned workflow not found.'}
                        </div>
                    ) : preview?.workflow ? (
                        <>
                            <p style={{ margin: '0 0 10px', fontSize: 13, color: '#334155' }}>
                                <strong>{preview.workflow.workflowName}</strong>
                                {preview.workflow.workflowCode ? ` (${preview.workflow.workflowCode})` : ''}
                            </p>
                            <ol style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: '#475569' }}>
                                {(preview.workflow.stages || []).map((s, i) => (
                                    <li key={s.stageKey || i} style={{ marginBottom: 4 }}>
                                        {s.sequenceNo}. {s.stageName}
                                        {s.allowSkip ? ' · skip allowed' : ''}
                                    </li>
                                ))}
                            </ol>
                        </>
                    ) : (
                        <p style={{ margin: 0, color: '#64748b', fontSize: 13 }}>No workflow available.</p>
                    )}
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                    <button type="button" onClick={() => navigate(PATHS.PRODUCTION.WORKFLOW_LOTS)} style={{ padding: '8px 14px', border: '1px solid #cbd5e1', background: '#fff', borderRadius: 6, cursor: 'pointer' }}>
                        Cancel
                    </button>
                    <button type="submit" disabled={saving} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}>
                        <Save size={16} /> {saving ? 'Creating...' : 'Create Lot'}
                    </button>
                </div>
            </form>
        </div>
    );
}
