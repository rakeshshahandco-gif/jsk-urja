import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ChevronLeft, ExternalLink } from 'lucide-react';
import { useCompany } from '@/contexts/CompanyContext';
import { isTextileIndustryCompany } from '@/utils/industryInventoryLabels';
import { PATHS } from '@/routes/paths';
import {
    getTextileProductionOrder,
    skipTextileProductionStage,
    completeTextileProductionStage,
    startTextileProductionOrder,
} from '@/services/textileProductionWorkflowApi';
import { getChallanDetailPath } from '@/utils/textileJobWorkProcessConfig';
import { resolveStageProcessType, stageLabel } from '@/utils/textileProductionWorkflowHelpers';
import { BrandedLoader } from '@/components/ui/BrandedLoading';

export default function TextileProductionOrderDetailPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { selectedCompany } = useCompany();
    const isTextile = isTextileIndustryCompany(selectedCompany);
    const [doc, setDoc] = useState(null);
    const [loading, setLoading] = useState(true);
    const [skipReason, setSkipReason] = useState('');
    const [busy, setBusy] = useState(false);

    const reload = () => getTextileProductionOrder(id).then(setDoc).catch((e) => toast.error(e.response?.data?.message || 'Failed'));

    useEffect(() => {
        if (!isTextile) return setLoading(false);
        reload().finally(() => setLoading(false));
    }, [id, isTextile]);

    const currentStage = doc?.stageStates?.[doc?.currentStageIndex];
    const processType = currentStage ? resolveStageProcessType(currentStage) : null;
    const supportsVendor = !!processType;
    const hasActiveChallan = !!currentStage?.activeChallanId;

    const openChallan = (stage, challanId) => {
        const pt = resolveStageProcessType(stage);
        if (!pt || !challanId) return;
        navigate(`${getChallanDetailPath(pt, challanId)}?po=${id}`);
    };

    const run = async (fn, msg) => {
        setBusy(true);
        try {
            await fn();
            toast.success(msg);
            await reload();
        } catch (e) {
            toast.error(e.response?.data?.message || e.message);
        } finally {
            setBusy(false);
        }
    };

    if (!isTextile) return <div style={{ padding: 24 }}>Textile company required.</div>;
    if (loading) return <BrandedLoader size={80} />;
    if (!doc) return <div style={{ padding: 24 }}>Order not found</div>;

    const linkedChallans = (doc.stageStates || [])
        .map((s, idx) => ({ stage: s, idx, processType: resolveStageProcessType(s) }))
        .filter((x) => x.stage.activeChallanId && x.processType);

    const btn = (bg, label, onClick, disabled = false, outline = false) => (
        <button type="button" disabled={busy || disabled} onClick={onClick} style={{ padding: '9px 16px', background: outline ? '#fff' : bg, color: outline ? bg : '#fff', border: outline ? `1px solid ${bg}` : 'none', borderRadius: 6, fontWeight: 700, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1 }}>
            {label}
        </button>
    );

    return (
        <div style={{ padding: '16px 20px', maxWidth: 1000, margin: '0 auto' }}>
            <button type="button" onClick={() => navigate(PATHS.PRODUCTION.TEXTILE_PRODUCTION_WORKFLOW)} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, border: 'none', background: 'none', color: '#64748b', cursor: 'pointer', marginBottom: 12 }}>
                <ChevronLeft size={16} /> Back
            </button>
            <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 800 }}>{doc.orderNo}</h1>
            <p style={{ margin: '0 0 16px', color: '#64748b' }}>
                {doc.routeName} · Design {doc.designNo || '—'} · {doc.qty} {doc.qtyUom}
                {doc.colour ? ` · ${doc.colour}` : ''} · <strong>{doc.status}</strong>
            </p>

            <div style={{ background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: 8, padding: 14, marginBottom: 16 }}>
                <div style={{ fontSize: 13 }}>Current Stage: <strong>{doc.currentProcessName || '—'}</strong></div>
                <div style={{ fontSize: 13 }}>Next Stage: <strong>{doc.nextProcessName || 'Finished'}</strong></div>
                {currentStage?.activeVendorName && <div style={{ fontSize: 13, marginTop: 4 }}>Vendor: <strong>{currentStage.activeVendorName}</strong></div>}
                {hasActiveChallan && processType && (
                    <div style={{ fontSize: 13, marginTop: 4 }}>
                        Active Challan: <button type="button" onClick={() => openChallan(currentStage, currentStage.activeChallanId)} style={{ border: 'none', background: 'none', color: '#2563eb', fontWeight: 700, cursor: 'pointer', padding: 0 }}>View current stage challan</button>
                    </div>
                )}
                {doc.barcodeValue && <div style={{ fontSize: 11, color: '#64748b', marginTop: 8, wordBreak: 'break-all' }}>Order Barcode: {doc.barcodeValue}</div>}
            </div>

            {doc.status === 'Draft' && (
                btn('#2563eb', 'Start Production', () => run(() => startTextileProductionOrder(id), 'Production started'))
            )}

            {doc.status === 'In Progress' && currentStage && (
                <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 16, marginBottom: 16 }}>
                    <h2 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 700 }}>Stage Actions — {stageLabel(currentStage)}</h2>
                    <p style={{ margin: '0 0 12px', fontSize: 13, color: '#64748b' }}>
                        Planning stays on this screen. Issue and receive use the full {processType || stageLabel(currentStage)} challan screens.
                    </p>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
                        {supportsVendor && btn('#7c3aed', 'Issue Material', () => navigate(PATHS.PRODUCTION.TEXTILE_PRODUCTION_ORDER_ISSUE(id)), hasActiveChallan)}
                        {supportsVendor && hasActiveChallan && btn('#059669', 'Receive Material', () => navigate(PATHS.PRODUCTION.TEXTILE_PRODUCTION_ORDER_RECEIVE(id)))}
                        {hasActiveChallan && processType && btn('#6366f1', 'View Challan', () => openChallan(currentStage, currentStage.activeChallanId), false, true)}
                        {btn('#2563eb', 'Move To Next Stage', () => run(() => completeTextileProductionStage(id, { companyId: selectedCompany._id, vendorName: currentStage.activeVendorName }), 'Stage completed'))}
                    </div>
                    {currentStage.allowSkip && (
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', paddingTop: 12, borderTop: '1px solid #f1f5f9' }}>
                            <input value={skipReason} onChange={(e) => setSkipReason(e.target.value)} placeholder="Skip reason" style={{ flex: 1, minWidth: 180, padding: 8, border: '1px solid #d1d5db', borderRadius: 6 }} />
                            {btn('#f59e0b', 'Skip Stage', () => run(() => skipTextileProductionStage(id, { companyId: selectedCompany._id, reason: skipReason }), 'Stage skipped'))}
                        </div>
                    )}
                    {!supportsVendor && (
                        <p style={{ margin: '8px 0 0', fontSize: 12, color: '#64748b' }}>{stageLabel(currentStage)} is in-house — use Move To Next Stage when done.</p>
                    )}
                </div>
            )}

            {linkedChallans.length > 0 && (
                <>
                    <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>Linked Process Challans</h2>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
                        {linkedChallans.map(({ stage, idx, processType: pt }) => (
                            <button key={`${idx}-${stage.activeChallanId}`} type="button" onClick={() => openChallan(stage, stage.activeChallanId)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, cursor: 'pointer', textAlign: 'left' }}>
                                <span><strong>{stageLabel(stage)}</strong> · {stage.activeVendorName || 'Vendor'} · {stage.status}</span>
                                <ExternalLink size={14} color="#64748b" />
                            </button>
                        ))}
                    </div>
                </>
            )}

            <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>Route Progress</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {(doc.stageStates || []).map((s, i) => (
                    <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: 8, borderRadius: 6, background: i === doc.currentStageIndex && doc.status === 'In Progress' ? '#eff6ff' : '#f8fafc' }}>
                        <span style={{ fontWeight: 700, width: 24 }}>{i + 1}</span>
                        <span style={{ flex: 1 }}>{stageLabel(s)}</span>
                        <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 12, background: s.status === 'completed' ? '#dcfce7' : s.status === 'skipped' ? '#fef3c7' : s.status === 'in_progress' ? '#dbeafe' : '#f1f5f9' }}>{s.status}</span>
                        {s.activeChallanId && resolveStageProcessType(s) && (
                            <button type="button" onClick={() => openChallan(s, s.activeChallanId)} style={{ fontSize: 11, color: '#2563eb', border: 'none', background: 'none', cursor: 'pointer' }}>Challan</button>
                        )}
                    </div>
                ))}
            </div>

            {(doc.skipAudit || []).length > 0 && (
                <>
                    <h2 style={{ fontSize: 15, fontWeight: 700, margin: '16px 0 8px' }}>Skip Audit</h2>
                    {doc.skipAudit.map((a, i) => (
                        <div key={i} style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>{a.processName}: {a.reason || '—'} ({new Date(a.skippedAt).toLocaleString()})</div>
                    ))}
                </>
            )}
        </div>
    );
}
