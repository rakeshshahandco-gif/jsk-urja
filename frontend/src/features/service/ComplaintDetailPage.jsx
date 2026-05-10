import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, AlertTriangle, Truck, Package, Wrench, CheckCircle, XCircle, Edit2, Plus, Clipboard } from 'lucide-react';
import { getComplaint } from '@/services/serviceApi';
import { useToast } from '@/components/ui/Toast';

const STATUS_COLORS = {
    'Open': { bg: '#fee2e2', color: '#991b1b' },
    'Waiting Faulty Return': { bg: '#ede9fe', color: '#5b21b6' },
    'Faulty Partially Received': { bg: '#ffedd5', color: '#9a3412' },
    'Faulty Fully Received': { bg: '#d1fae5', color: '#065f46' },
    'Replacement Sent': { bg: '#dbeafe', color: '#1e40af' },
    'Repair In Process': { bg: '#ede9fe', color: '#5b21b6' },
    'Credit Note Issued': { bg: '#dcfce7', color: '#166534' },
    'Closed': { bg: '#f0fdf4', color: '#166534' },
};

const Card = ({ title, value, sub, color }) => (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: '12px 16px', flex: 1, minWidth: 100 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', marginBottom: 4 }}>{title}</div>
        <div style={{ fontSize: 24, fontWeight: 800, color: color || '#111827' }}>{value}</div>
        {sub && <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 2 }}>{sub}</div>}
    </div>
);

const Section = ({ icon: Icon, title, color, children }) => (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: '#f8fafc', borderBottom: '1px solid #e5e7eb' }}>
            <Icon size={14} color={color || '#374151'} />
            <span style={{ fontSize: 12, fontWeight: 700, color: '#374151' }}>{title}</span>
        </div>
        <div style={{ padding: 14 }}>{children}</div>
    </div>
);

import { BrandedLoader } from '@/components/ui/BrandedLoading';

const ComplaintDetailPage = () => {
    const navigate = useNavigate();
    const { id } = useParams();
    const { addToast } = useToast();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        getComplaint(id)
            .then(d => { setData(d); setLoading(false); })
            .catch(() => { addToast('Failed to load', 'error'); setLoading(false); });
    }, [id]);

    if (loading) return <BrandedLoader size={120} />;
    if (!data) return <div style={{ padding: 40, textAlign: 'center', color: '#dc2626' }}>Complaint not found</div>;

    const totalFaulty = data.items?.reduce((s, i) => s + i.qtyFaultyReported, 0) || 0;
    const totalDispatched = data.items?.reduce((s, i) => s + (i.dispatchedQty || 0), 0) || 0;
    const totalReceived = data.items?.reduce((s, i) => s + (i.faultyReceivedQty || 0), 0) || 0;
    const totalPending = data.items?.reduce((s, i) => s + (i.pendingReturnQty || 0), 0) || 0;
    const statusStyle = STATUS_COLORS[data.status] || { bg: '#f3f4f6', color: '#374151' };

    return (
        <div style={{ padding: '12px 16px', background: '#f8fafc', minHeight: '100vh' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button onClick={() => navigate('/service/complaints')} style={{ width: 28, height: 28, border: '1px solid #e5e7eb', borderRadius: 6, background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <ChevronLeft size={15} />
                    </button>
                    <AlertTriangle size={15} color="#dc2626" />
                    <span style={{ fontSize: 15, fontWeight: 800, color: '#111827', fontFamily: 'monospace' }}>{data.complaintNo}</span>
                    <span style={{ background: statusStyle.bg, color: statusStyle.color, padding: '2px 10px', borderRadius: 12, fontSize: 11, fontWeight: 600 }}>{data.status}</span>
                    <span style={{ background: '#fef3c7', color: '#92400e', padding: '2px 8px', borderRadius: 10, fontSize: 10, fontWeight: 600 }}>{data.priority}</span>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => navigate(`/service/complaints/${id}/edit`)}
                        style={{ display: 'flex', alignItems: 'center', gap: 5, height: 30, padding: '0 12px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                        <Edit2 size={12} /> Edit
                    </button>
                    <button onClick={() => navigate(`/service/replacement-dispatches/new?complaintId=${id}&complaintNo=${data.complaintNo}&customerId=${data.customerId}&customer=${data.customerName}`)}
                        style={{ display: 'flex', alignItems: 'center', gap: 5, height: 30, padding: '0 12px', background: '#1d4ed8', color: '#fff', border: 'none', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                        <Truck size={12} /> Replacement Dispatch
                    </button>
                    <button onClick={() => navigate(`/service/faulty-receipts/new?complaintId=${id}&complaintNo=${data.complaintNo}&customerId=${data.customerId}&customer=${data.customerName}`)}
                        style={{ display: 'flex', alignItems: 'center', gap: 5, height: 30, padding: '0 12px', background: '#d97706', color: '#fff', border: 'none', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                        <Package size={12} /> Faulty Receipt
                    </button>
                    <button onClick={() => navigate(`/service/repair-job-cards/new?complaintId=${id}&complaintNo=${data.complaintNo}`)}
                        style={{ display: 'flex', alignItems: 'center', gap: 5, height: 30, padding: '0 12px', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                        <Wrench size={12} /> Repair Job Card
                    </button>
                    {data.serviceType === 'Credit Note' && !data.creditNoteId && (
                        <button onClick={() => {
                            if (window.confirm('Generate Credit Note for this complaint?')) {
                                addToast('Please use the Credit Note form (Coming soon in full UI update)', 'info');
                            }
                        }}
                        style={{ display: 'flex', alignItems: 'center', gap: 5, height: 30, padding: '0 12px', background: '#10b981', color: '#fff', border: 'none', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                             Credit Note
                        </button>
                    )}
                </div>
            </div>

            {/* Journey Tracker */}
            <div style={{ display: 'flex', alignItems: 'center', background: '#fff', padding: '16px 20px', border: '1px solid #e5e7eb', borderRadius: 8, marginBottom: 14, gap: 4 }}>
                {[
                    { label: 'Ticket Open', active: true, done: true },
                    { label: 'Faulty Inward', active: data.receipts?.length > 0 || data.serviceType === 'Advance Replacement', done: data.receipts?.length > 0 },
                    { label: 'Inspection / Repair', active: data.jobCards?.length > 0, done: data.jobCards?.every(jc => ['Repaired', 'Not Repairable', 'Closed'].includes(jc.status)) && data.jobCards.length > 0 },
                    { label: data.serviceType === 'Credit Note' ? 'Credit Note' : 'Replacement', active: data.serviceType === 'Credit Note' ? !!data.creditNoteId : data.dispatches?.length > 0, done: data.serviceType === 'Credit Note' ? !!data.creditNoteId : data.dispatches?.length > 0 },
                    { label: 'Closure', active: data.status === 'Closed', done: data.status === 'Closed' }
                ].map((step, idx, arr) => (
                    <React.Fragment key={idx}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
                            <div style={{ 
                                width: 24, height: 24, borderRadius: '50%', background: step.done ? '#059669' : (step.active ? '#1d4ed8' : '#f3f4f6'),
                                color: step.active || step.done ? '#fff' : '#9ca3af', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800,
                                border: step.active && !step.done ? '2px solid #93c5fd' : 'none'
                             }}>
                                {step.done ? <CheckCircle size={14} /> : idx + 1}
                            </div>
                            <div style={{ fontSize: 9, fontWeight: 700, marginTop: 4, color: step.active || step.done ? '#374151' : '#9ca3af', textTransform: 'uppercase' }}>{step.label}</div>
                        </div>
                        {idx < arr.length - 1 && <div style={{ height: 2, background: step.done ? '#059669' : '#e5e7eb', flex: 2, marginBottom: 14 }} />}
                    </React.Fragment>
                ))}
            </div>

            {/* Info Row */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
                <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 14, flex: 2 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, fontSize: 12 }}>
                        <div><span style={{ fontSize: 10, color: '#9ca3af', fontWeight: 700, display: 'block' }}>CUSTOMER</span><span style={{ fontWeight: 700 }}>{data.customerName}</span></div>
                        <div><span style={{ fontSize: 10, color: '#9ca3af', fontWeight: 700, display: 'block' }}>CONTACT</span>{data.contactPerson || '—'} {data.mobile ? `(${data.mobile})` : ''}</div>
                        <div><span style={{ fontSize: 10, color: '#9ca3af', fontWeight: 700, display: 'block' }}>DATE</span>{new Date(data.date).toLocaleDateString('en-IN')}</div>
                        <div><span style={{ fontSize: 10, color: '#9ca3af', fontWeight: 700, display: 'block' }}>SERVICE TYPE</span><span style={{ color: '#1d4ed8', fontWeight: 700 }}>{data.serviceType}</span></div>
                        <div><span style={{ fontSize: 10, color: '#9ca3af', fontWeight: 700, display: 'block' }}>INVOICE REF</span>{data.salesInvoiceNo || '—'}</div>
                        <div><span style={{ fontSize: 10, color: '#9ca3af', fontWeight: 700, display: 'block' }}>FAULT CATEGORY</span>{data.faultCategory}</div>
                        <div><span style={{ fontSize: 10, color: '#9ca3af', fontWeight: 700, display: 'block' }}>WARRANTY</span>{data.warrantyStatus}</div>
                    </div>
                </div>
                {/* Summary Cards */}
                <div style={{ display: 'flex', gap: 8, flex: 3 }}>
                    <Card title="Faulty Reported" value={totalFaulty} color="#dc2626" />
                    <Card title="Dispatched" value={totalDispatched} color="#1d4ed8" />
                    <Card title="Received" value={totalReceived} color="#059669" />
                    <Card title="Pending Return" value={totalPending} color={totalPending > 0 ? '#d97706' : '#9ca3af'} />
                </div>
            </div>

            {/* Items */}
            <Section icon={AlertTriangle} title="Faulty Items" color="#dc2626">
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                    <thead><tr style={{ background: '#f8fafc' }}>
                        {['Item Code', 'Item Name', 'Faulty Qty', 'Dispatched', 'Received', 'Pending', 'Reason', 'Action'].map(h =>
                            <th key={h} style={{ padding: '6px 8px', textAlign: 'left', fontWeight: 700, color: '#6b7280', fontSize: 10 }}>{h}</th>
                        )}
                    </tr></thead>
                    <tbody>
                        {data.items?.map((item, i) => (
                            <tr key={i} style={{ borderTop: '1px solid #f3f4f6' }}>
                                <td style={{ padding: '6px 8px', fontFamily: 'monospace', color: '#374151' }}>{item.itemCode || '—'}</td>
                                <td style={{ padding: '6px 8px', fontWeight: 600 }}>{item.itemName}</td>
                                <td style={{ padding: '6px 8px', color: '#dc2626', fontWeight: 700 }}>{item.qtyFaultyReported}</td>
                                <td style={{ padding: '6px 8px', color: '#1d4ed8' }}>{item.dispatchedQty || 0}</td>
                                <td style={{ padding: '6px 8px', color: '#059669' }}>{item.faultyReceivedQty || 0}</td>
                                <td style={{ padding: '6px 8px', color: (item.pendingReturnQty || 0) > 0 ? '#d97706' : '#9ca3af', fontWeight: 700 }}>{item.pendingReturnQty || 0}</td>
                                <td style={{ padding: '6px 8px', color: '#6b7280' }}>{item.complaintReason}</td>
                                <td style={{ padding: '6px 8px', color: '#374151' }}>{item.actionRequired}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </Section>

            {/* Replacement Dispatches */}
            {data.dispatches?.length > 0 && (
                <Section icon={Truck} title={`Replacement Dispatches (${data.dispatches.length})`} color="#1d4ed8">
                    {data.dispatches.map(d => (
                        <div key={d._id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f3f4f6', fontSize: 12 }}>
                            <div>
                                <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#1d4ed8' }}>{d.doNo}</span>
                                <span style={{ marginLeft: 10, color: '#6b7280' }}>{new Date(d.date).toLocaleDateString('en-IN')}</span>
                                <span style={{ marginLeft: 10 }}>{d.items?.reduce((s, i) => s + i.qty, 0)} pcs</span>
                            </div>
                            <button onClick={() => navigate(`/service/replacement-dispatches/${d._id}/print`)}
                                style={{ height: 24, padding: '0 10px', background: '#dbeafe', color: '#1d4ed8', border: 'none', borderRadius: 4, fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>
                                Print Challan
                            </button>
                        </div>
                    ))}
                </Section>
            )}

            {/* Faulty Receipts */}
            {data.receipts?.length > 0 && (
                <Section icon={Package} title={`Faulty Receipts (${data.receipts.length})`} color="#d97706">
                    {data.receipts.map(r => (
                        <div key={r._id} style={{ padding: '6px 0', borderBottom: '1px solid #f3f4f6', fontSize: 12 }}>
                            <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#d97706' }}>{r.receiptNo}</span>
                            <span style={{ marginLeft: 10, color: '#6b7280' }}>{new Date(r.date).toLocaleDateString('en-IN')}</span>
                            <span style={{ marginLeft: 10 }}>{r.items?.reduce((s, i) => s + i.qtyReceived, 0)} pcs received</span>
                            <span style={{ marginLeft: 10, background: r.status === 'Complete' ? '#d1fae5' : '#fef3c7', color: r.status === 'Complete' ? '#065f46' : '#92400e', padding: '1px 8px', borderRadius: 8, fontSize: 10, fontWeight: 600 }}>{r.status}</span>
                        </div>
                    ))}
                </Section>
            )}

            {/* Job Cards */}
            {data.jobCards?.length > 0 && (
                <Section icon={Wrench} title={`Repair Job Cards (${data.jobCards.length})`} color="#7c3aed">
                    {data.jobCards.map(jc => (
                        <div key={jc._id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f3f4f6', fontSize: 12 }}>
                            <div>
                                <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#7c3aed' }}>{jc.jobCardNo}</span>
                                <span style={{ marginLeft: 10, color: '#6b7280' }}>{new Date(jc.date).toLocaleDateString('en-IN')}</span>
                                <span style={{ marginLeft: 10, color: '#374151' }}>{jc.assignedTo || 'Unassigned'}</span>
                                <span style={{ marginLeft: 10, background: '#ede9fe', color: '#5b21b6', padding: '1px 8px', borderRadius: 8, fontSize: 10, fontWeight: 600 }}>{jc.status}</span>
                            </div>
                            <div style={{ display: 'flex', gap: 6 }}>
                                <button onClick={() => navigate(`/service/repaired-stock-inwards/new?jobCardId=${jc._id}&jobCardNo=${jc.jobCardNo}&complaintId=${id}`)}
                                    style={{ height: 24, padding: '0 8px', background: '#d1fae5', color: '#065f46', border: 'none', borderRadius: 4, fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>
                                    + Repaired Inward
                                </button>
                                <button onClick={() => navigate(`/service/scrap-entries/new?jobCardId=${jc._id}&jobCardNo=${jc.jobCardNo}&complaintId=${id}`)}
                                    style={{ height: 24, padding: '0 8px', background: '#fee2e2', color: '#991b1b', border: 'none', borderRadius: 4, fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>
                                    + Scrap Entry
                                </button>
                            </div>
                        </div>
                    ))}
                </Section>
            )}

            {/* Linked Purchase Orders */}
            {data.purchaseOrders?.length > 0 && (
                <Section icon={Clipboard} title={`Purchase Orders for Replacement (${data.purchaseOrders.length})`} color="#2563eb">
                    {data.purchaseOrders.map(po => (
                        <div key={po._id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f3f4f6', fontSize: 12 }}>
                            <div>
                                <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#2563eb' }}>{po.poNumber}</span>
                                <span style={{ marginLeft: 10, color: '#374151', fontWeight: 600 }}>{po.supplierName}</span>
                                <span style={{ marginLeft: 10, color: '#6b7280' }}>{new Date(po.poDate).toLocaleDateString('en-IN')}</span>
                                <span style={{ marginLeft: 10, background: '#dbeafe', color: '#1e40af', padding: '1px 8px', borderRadius: 8, fontSize: 10, fontWeight: 600 }}>{po.status}</span>
                            </div>
                            <button onClick={() => navigate(`/purchase/orders/${po._id}/grn/new`)}
                                style={{ height: 24, padding: '0 10px', background: '#10b981', color: '#fff', border: 'none', borderRadius: 4, fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>
                                + Create GRN
                            </button>
                        </div>
                    ))}
                </Section>
            )}

            {/* Linked GRNs */}
            {data.grns?.length > 0 && (
                <Section icon={Package} title={`Goods Receipts (${data.grns.length})`} color="#059669">
                    {data.grns.map(g => (
                        <div key={g._id} style={{ padding: '6px 0', borderBottom: '1px solid #f3f4f6', fontSize: 12 }}>
                            <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#059669' }}>{g.grnNumber}</span>
                            <span style={{ marginLeft: 10, color: '#374151', fontWeight: 600 }}>{g.supplierName}</span>
                            <span style={{ marginLeft: 10, color: '#6b7280' }}>{new Date(g.grnDate).toLocaleDateString('en-IN')}</span>
                            <span style={{ marginLeft: 10 }}>{g.items?.reduce((s, i) => s + i.receivedQty, 0)} pcs received</span>
                        </div>
                    ))}
                </Section>
            )}

            {data.internalRemarks && (
                <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#92400e' }}>
                    <strong>Internal Remarks:</strong> {data.internalRemarks}
                </div>
            )}
        </div>
    );
};

export default ComplaintDetailPage;
