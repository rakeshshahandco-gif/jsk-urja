import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getPurchaseOrderById, updatePOStatus, deletePurchaseOrder, getSupplierById } from '@/services/purchaseApi';
import { sendOrder as sendOrderApi } from '@/services/communicationApi';
import { getGRNsByPO, createGRN } from '@/services/purchaseApi';
import { getCompanyProfile } from '@/services/settingsApi';
import { useAuth } from '@/hooks/useAuth';
import { numberToWords } from '@/utils/numberToWords';
import { PATHS } from '@/routes/paths';
import toast from 'react-hot-toast';
import { Printer, FileText, ChevronLeft, Package, Trash2, Edit, Send, MessageSquare, Mail } from 'lucide-react';
import { Button } from '@/components/ui';
import CommunicationModal from '@/components/communication/CommunicationModal';

const STATUS_COLORS = {
    'Draft': { color: '#64748b', bg: '#f1f5f9', border: '#cbd5e1' },
    'Ordered': { color: '#2563eb', bg: '#eff6ff', border: '#93c5fd' },
    'Partially Received': { color: '#d97706', bg: '#fffbeb', border: '#fcd34d' },
    'Fully Received': { color: '#16a34a', bg: '#f0fdf4', border: '#86efac' },
    'Completed': { color: '#059669', bg: '#f0fdf4', border: '#6ee7b7' },
    'Cancelled': { color: '#dc2626', bg: '#fef2f2', border: '#fca5a5' },
};

const inp = { padding: '7px 10px', background: '#fff', border: '1px solid #d1d5db', borderRadius: 6, color: '#374151', fontSize: 12, outline: 'none', width: '100%', boxSizing: 'border-box' };
const th = { padding: '9px 14px', textAlign: 'left', color: '#6b7280', fontWeight: 600, borderBottom: '2px solid #e5e7eb', whiteSpace: 'nowrap', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.03em', background: '#f9fafb' };
const td = { padding: '10px 14px', fontSize: 13, borderBottom: '1px solid #f3f4f6', color: '#374151' };

export default function PurchaseOrderDetailPage() {
    const { user } = useAuth();
    const { id } = useParams();
    const navigate = useNavigate();
    const [po, setPO] = useState(null);
    const [grns, setGRNs] = useState([]);
    const [company, setCompany] = useState({});
    const [loading, setLoading] = useState(true);
    const [showGRN, setShowGRN] = useState(false);
    const [grnForm, setGRNForm] = useState({});
    const [saving, setSaving] = useState(false);
    const [isCommModalOpen, setIsCommModalOpen] = useState(false);

    const load = useCallback(() => {
        Promise.all([
            getPurchaseOrderById(id),
            getGRNsByPO(id),
            getCompanyProfile().catch(() => ({ data: {} })), // Fallback if settings fail
        ]).then(async ([poData, grnData, companyRes]) => {
            let finalPO = poData;
            // If supplierId is not populated (just an ID string), fetch it separately
            if (poData && typeof poData.supplierId === 'string') {
                try {
                    const supData = await getSupplierById(poData.supplierId);
                    finalPO = { ...poData, supplierId: supData };
                } catch (e) {
                    console.error('Failed to fetch supplier details', e);
                }
            } else if (poData && poData.supplierId && typeof poData.supplierId === 'object' && !poData.supplierId.address) {
                // If populated but missing address (old API response or partial populate), fetch full supplier
                try {
                    const supData = await getSupplierById(poData.supplierId._id || poData.supplierId);
                    finalPO = { ...poData, supplierId: supData };
                } catch (e) {
                    console.error('Failed to fetch supplier details', e);
                }
            }

            setPO(finalPO);
            setGRNs(Array.isArray(grnData) ? grnData : []);
            setCompany(companyRes?.data || {});
            const form = {};
            (finalPO.items || []).forEach(item => {
                form[item._id] = { poItemId: item._id, receivedQty: '', qcStatus: 'Pending', batchNo: '', remarks: '' };
            });
            setGRNForm(form);
        }).catch(() => toast.error('Failed to load')).finally(() => setLoading(false));
    }, [id]);

    useEffect(() => { load(); }, [load]);

    const fmt = (d) => d ? new Date(d).toLocaleString('en-IN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
    }) : '—';

    const handleGRNSubmit = async () => {
        const items = Object.values(grnForm).filter(i => i.receivedQty > 0);
        if (items.length === 0) return toast.error('Enter received quantity for at least one item');
        setSaving(true);
        try {
            const res = await createGRN({ sourceType: 'Against PO', poId: id, items });
            toast.success(res.message || 'GRN created!');
            setShowGRN(false);
            load();
        } catch (e) { toast.error(e.response?.data?.message || e.message); }
        finally { setSaving(false); }
    };

    const setFormItem = (poItemId, k, v) => setGRNForm(f => ({ ...f, [poItemId]: { ...f[poItemId], [k]: v } }));

    const handleSendComm = async (commData) => {
        const payload = { ...commData, id: po._id, type: 'Purchase Order' };
        toast.promise(
            sendOrderApi(payload),
            {
                loading: `Preparing and sending ${commData.channel}...`,
                success: `${commData.channel} sent successfully!`,
                error: (err) => err.response?.data?.message || `Failed to send ${commData.channel}.`,
            }
        ).then(() => {
            setIsCommModalOpen(false);
        });
    };

    if (loading) return <div style={{ padding: 60, textAlign: 'center', color: '#9ca3af', background: '#fff', minHeight: '100vh' }}>Loading...</div>;
    if (!po) return <div style={{ padding: 60, textAlign: 'center', color: '#dc2626', background: '#fff', minHeight: '100vh' }}>PO not found</div>;

    const sc = STATUS_COLORS[po.status] || STATUS_COLORS['Draft'];
    const canReceive = !['Completed', 'Cancelled'].includes(po.status);

    const fnum = (n) => parseFloat((n || 0).toFixed(2));
    const itemTaxable = (po.items || []).reduce((s, i) => fnum(s + (i.orderedQty * i.rate)), 0);
    const freight = po.freightAmount || 0;
    const freightGstRate = po.freightGstRate || ((po.items && po.items.length > 0) ? po.items[0].taxPercent : 18);
    const freightTax = fnum(freight * freightGstRate / 100);

    const itemTax = (po.items || []).reduce((s, i) => fnum(s + (i.orderedQty * i.rate * i.taxPercent / 100)), 0);
    const totalTaxable = fnum(itemTaxable + freight);
    const totalTax = fnum(itemTax + freightTax);
    const grandTotal = fnum(totalTaxable + totalTax);
    const isIGST = po.gstType === 'IGST';

    return (
        <div style={{ fontFamily: "'Inter', sans-serif", background: '#fff', minHeight: '100vh', color: '#1e293b' }}>
            {/* PRINT-ONLY COMPLETE LAYOUT (A4 Container) */}
            <div className="print-only" style={{ display: 'none', width: '210mm', padding: 0, margin: '0 auto' }}>
                <div className="print-content" style={{ border: '1px solid #000', padding: '20px', height: '270mm', display: 'flex', flexDirection: 'column', background: '#fff', boxSizing: 'border-box' }}>
                    {/* Header Section */}
                    <div className="p-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2px solid #000', paddingBottom: '20px', marginBottom: '25px' }}>
                        <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start' }}>
                            <img src="/logo.jpeg" alt="Logo" style={{ maxHeight: '80px', maxWidth: '120px', objectFit: 'contain' }} />
                            <div>
                                <div style={{ fontSize: '22pt', fontWeight: 900, color: '#000', marginBottom: '2px', lineHeight: 1.1 }}>{company.companyName || 'JSK URJA'}</div>
                                <div style={{ fontSize: '9pt', color: '#000', lineHeight: '1.4', maxWidth: '400px' }}>
                                    {company.address}<br />
                                    {(company.city || company.state) ? `${company.city} ${company.state}, India. Postal Code: ${company.pincode}` : ''}<br />
                                    Phone: {company.phone} | Email: {company.email}<br />
                                    {company.gstNumber && <strong>GSTIN: {company.gstNumber}</strong>}
                                </div>
                            </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                            <h1 style={{ margin: '0 0 4px 0', fontSize: '16pt', fontWeight: 900, textTransform: 'uppercase', color: '#64748b' }}>PURCHASE ORDER</h1>
                            <div style={{ fontSize: '14pt', fontWeight: 700, color: '#334155', marginBottom: '8px' }}>{po.poNumber}</div>
                            <table style={{ borderCollapse: 'collapse', float: 'right', textAlign: 'left', fontSize: '11px' }}>
                                <tbody>
                                    <tr><td style={{ padding: '2px 10px 2px 0', borderRight: '1px solid #000', fontWeight: 800 }}>PO DATE</td><td style={{ padding: '2px 0 2px 10px' }}>{fmt(po.poDate)}</td></tr>
                                    <tr><td style={{ padding: '2px 10px 2px 0', borderRight: '1px solid #000', fontWeight: 800 }}>DUE DATE</td><td style={{ padding: '2px 0 2px 10px' }}>{fmt(po.expectedDeliveryDate)}</td></tr>
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Parties Section */}
                    <div className="p-summary" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0', border: '1px solid #000', marginBottom: '25px' }}>
                        <div style={{ padding: '15px', borderRight: '1px solid #000' }}>
                            <div style={{ fontSize: '12px', fontWeight: 800, textTransform: 'uppercase', marginBottom: '10px', borderBottom: '1px solid #000', paddingBottom: '5px', color: '#666' }}>VENDORS / SUPPLIER</div>
                            <div style={{ fontWeight: 800, fontSize: '16px', marginBottom: '6px', color: '#000' }}>{po.supplierName || po.supplierId?.supplierName}</div>
                            <div style={{ fontSize: '13px', marginBottom: '4px', lineHeight: '1.4' }}>
                                {po.supplierAddress || (po.supplierId?.address ? `${po.supplierId.address}, ${po.supplierId.city}, ${po.supplierId.state}` : '')}
                            </div>
                            {(po.supplierGstNumber || po.supplierId?.gstNumber) && (
                                <div style={{ fontSize: '13px', marginTop: '8px' }}>
                                    <strong>GSTIN:</strong> {po.supplierGstNumber || po.supplierId?.gstNumber}
                                </div>
                            )}
                            {(po.supplierState || po.supplierId?.state) && (
                                <div style={{ fontSize: '13px' }}>
                                    <strong>State:</strong> {po.supplierState || po.supplierId?.state}
                                </div>
                            )}
                            {(po.supplierContact || po.supplierId?.phone) && (
                                <div style={{ fontSize: '13px' }}>
                                    <strong>Contact:</strong> {po.supplierContact || po.supplierId?.phone}
                                </div>
                            )}
                        </div>
                        <div style={{ padding: '15px' }}>
                            <div style={{ fontSize: '12px', fontWeight: 800, textTransform: 'uppercase', marginBottom: '10px', borderBottom: '1px solid #000', paddingBottom: '5px', color: '#666' }}>DELIVER TO / SHIP TO</div>
                            <div style={{ fontWeight: 800, fontSize: '16px', marginBottom: '6px', color: '#000' }}>{company.companyName || 'JSK URJA'}</div>
                            <div style={{ fontSize: '13px', color: '#333', maxWidth: '400px', lineHeight: '1.4' }}>
                                {company.address && <div>{company.address}</div>}
                                {(company.city || company.state) && <div>{company.city}, {company.state} - {company.pincode}</div>}
                            </div>
                            {company.contactNumber && <div style={{ fontSize: '13px', marginTop: '8px' }}><strong>Contact:</strong> {company.contactNumber}</div>}
                        </div>
                    </div>

                    {/* Metadata Table */}
                    <div style={{ marginBottom: '25px' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #000', fontSize: '13px' }}>
                            <thead style={{ background: '#f5f5f5' }}>
                                <tr>
                                    {['Mode of Dispatch', 'Terms of Payment'].map((h, i) => (
                                        <th key={i} style={{ border: '1px solid #000', padding: '8px 12px', textAlign: 'left', fontWeight: 800 }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                <tr style={{ borderBottom: '1px solid #000' }}>
                                    <td style={{ borderRight: '1px solid #000', padding: '8px 12px' }}>{po.dispatchMode || 'By Road'}</td>
                                    <td style={{ padding: '8px 12px' }}>{po.paymentTerms || '—'}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>

                    {/* Items Table */}
                    <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #000', fontSize: '13px', marginBottom: 'auto' }}>
                        <thead style={{ background: '#f5f5f5', color: '#000' }}>
                            <tr>
                                {['Sr.', 'Item Description', 'HSN/SAC', 'Qty', 'Unit', 'Rate', 'Total', ''].map((h, i) => (
                                    <th key={i} style={{ border: '1px solid #000', padding: '10px', textAlign: h === 'Item Description' ? 'left' : 'center', fontWeight: 800 }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {(po.items || []).map((it, i) => (
                                <tr key={i}>
                                    <td style={{ borderRight: '1px solid #000', borderBottom: '1px solid #eee', padding: '10px', textAlign: 'center', verticalAlign: 'top' }}>{i + 1}</td>
                                    <td style={{ borderRight: '1px solid #000', borderBottom: '1px solid #eee', padding: '10px', verticalAlign: 'top' }}>
                                        <div style={{ fontWeight: 800, fontSize: '14px' }}>{it.itemName}</div>
                                        {it.itemCode && <div style={{ fontSize: '11px', color: '#555', marginTop: '2px' }}>Code: {it.itemCode}</div>}
                                        {it.description && <div style={{ fontSize: '11px', color: '#666', marginTop: '4px', fontStyle: 'italic' }}>{it.description}</div>}
                                    </td>
                                    <td style={{ borderRight: '1px solid #000', borderBottom: '1px solid #eee', padding: '10px', textAlign: 'center', verticalAlign: 'top' }}>{it.hsnCode || '—'}</td>
                                    <td style={{ borderRight: '1px solid #000', borderBottom: '1px solid #eee', padding: '10px', textAlign: 'center', verticalAlign: 'top', fontWeight: 800 }}>{it.orderedQty}</td>
                                    <td style={{ borderRight: '1px solid #000', borderBottom: '1px solid #eee', padding: '10px', textAlign: 'center', verticalAlign: 'top' }}>{it.uom}</td>
                                    <td style={{ borderRight: '1px solid #000', borderBottom: '1px solid #eee', padding: '10px', textAlign: 'right', verticalAlign: 'top' }}>{it.rate.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                    <td style={{ borderBottom: '1px solid #eee', padding: '10px', textAlign: 'right', verticalAlign: 'top', fontWeight: 800 }}>{(it.orderedQty * it.rate).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                    <td style={{ borderLeft: '1px solid #000', borderBottom: '1px solid #eee' }}></td>
                                </tr>
                            ))}
                        </tbody>
                        <tfoot className="p-footer" style={{ borderTop: '1px solid #000' }}>
                            <tr>
                                <td colSpan={4} rowSpan={6} style={{ borderRight: '1px solid #000', padding: '15px', verticalAlign: 'top' }}>
                                    <div style={{ fontSize: '11px', fontWeight: 800, color: '#666', marginBottom: '5px' }}>AMOUNT IN WORDS:</div>
                                    <div style={{ fontSize: '13px', fontWeight: 800, textTransform: 'uppercase' }}>{numberToWords(grandTotal)}</div>
                                    {po.remarks && (
                                        <div style={{ marginTop: '15px' }}>
                                            <div style={{ fontSize: '11px', fontWeight: 800, color: '#666', marginBottom: '5px' }}>REMARKS / SPECIAL INSTRUCTIONS:</div>
                                            <div style={{ fontSize: '12px', whiteSpace: 'pre-wrap' }}>{po.remarks}</div>
                                        </div>
                                    )}
                                </td>
                                <td colSpan={2} style={{ borderRight: '1px solid #000', padding: '8px 12px', textAlign: 'right', fontWeight: 700 }}>TOTAL TAXABLE</td>
                                <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700 }}>{itemTaxable.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                <td style={{ borderLeft: '1px solid #000' }}></td>
                            </tr>
                            <tr>
                                <td colSpan={2} style={{ borderRight: '1px solid #000', padding: '8px 12px', textAlign: 'right', fontWeight: 700 }}>FREIGHT / SHIPPING</td>
                                <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700 }}>{freight.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                <td style={{ borderLeft: '1px solid #000' }}></td>
                            </tr>
                            <tr style={{ background: '#f5f5f5' }}>
                                <td colSpan={2} style={{ borderRight: '1px solid #000', padding: '8px 12px', textAlign: 'right', fontWeight: 800 }}>TAXABLE AMOUNT</td>
                                <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 800 }}>{totalTaxable.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                <td style={{ borderLeft: '1px solid #000' }}></td>
                            </tr>
                            {isIGST ? (
                                <tr>
                                    <td colSpan={2} style={{ borderRight: '1px solid #000', padding: '8px 12px', textAlign: 'right', fontWeight: 700 }}>IGST @ {(po.items?.[0]?.taxPercent || 18)}%</td>
                                    <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700 }}>{totalTax.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                    <td style={{ borderLeft: '1px solid #000' }}></td>
                                </tr>
                            ) : (
                                <>
                                    <tr>
                                        <td colSpan={2} style={{ borderRight: '1px solid #000', padding: '8px 12px', textAlign: 'right', fontWeight: 700 }}>CGST @ {(po.items?.[0]?.taxPercent || 18) / 2}%</td>
                                        <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700 }}>{(totalTax / 2).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                        <td style={{ borderLeft: '1px solid #000' }}></td>
                                    </tr>
                                    <tr>
                                        <td colSpan={2} style={{ borderRight: '1px solid #000', padding: '8px 12px', textAlign: 'right', fontWeight: 700 }}>SGST @ {(po.items?.[0]?.taxPercent || 18) / 2}%</td>
                                        <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700 }}>{(totalTax / 2).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                        <td style={{ borderLeft: '1px solid #000' }}></td>
                                    </tr>
                                </>
                            )}
                            <tr style={{ background: '#f5f5f5', color: '#000' }}>
                                <td colSpan={2} style={{ borderRight: '1px solid #000', padding: '10px 12px', textAlign: 'right', fontWeight: 900, fontSize: '16px', color: '#000' }}>GRAND TOTAL</td>
                                <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 900, fontSize: '16px', color: '#000' }}>₹{grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                <td style={{ borderLeft: '1px solid #000' }}></td>
                            </tr>
                        </tfoot>
                    </table>

                    {/* Footer / Signatures */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', marginTop: '30px', gap: '30px' }}>
                        <div>
                            <div style={{ fontSize: '12px', fontWeight: 800, marginBottom: '8px', textDecoration: 'underline' }}>TERMS AND CONDITIONS:</div>
                            <ol style={{ fontSize: '11px', margin: 0, paddingLeft: '18px', color: '#333', lineHeight: '1.6' }}>
                                <li>Materials must be supplied as per specifications mentioned above.</li>
                                <li>The PO number must be clearly mentioned on all invoices and delivery documents.</li>
                                <li>Materials are subject to quality checks and approval by our inspection team.</li>
                                <li>Payment terms are as per the agreed period from the date of receipt of material and correct invoice.</li>
                                <li>The company reserves the right to cancel the order if delivery is delayed beyond the expected date.</li>
                            </ol>
                        </div>
                        <div style={{ border: '1px solid #000', display: 'flex', flexDirection: 'column', height: '140px', width: '220px' }}>
                            <div style={{ background: '#f5f5f5', padding: '6px', fontSize: '11px', fontWeight: 800, textAlign: 'center', borderBottom: '1px solid #000' }}>
                                For {company.companyName || 'JSK URJA'}
                            </div>
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', paddingBottom: '12px' }}>
                                <div style={{ fontSize: '12px', fontWeight: 800, textTransform: 'uppercase' }}>{po.createdBy?.name || user?.name || 'Authorized User'}</div>
                                {(po.createdBy?.mobile || user?.mobile) && <div style={{ fontSize: '10px', color: '#333' }}>Mob: {po.createdBy?.mobile || user?.mobile}</div>}
                                <div style={{ width: '160px', borderTop: '1px solid #000', margin: '4px auto 0', paddingTop: '4px', fontSize: '11px', fontWeight: 800, textAlign: 'center' }}>AUTHORIZED SIGNATORY</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Application Header */}
            <div data-no-print style={{ background: '#fff', borderBottom: '1px solid #e5e7eb', padding: '16px 28px', position: 'sticky', top: 0, zIndex: 10 }}>
                <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
                    <button onClick={() => navigate(PATHS.PURCHASE.ORDERS)}
                        style={{ background: 'none', border: 'none', color: '#6366f1', fontSize: 13, cursor: 'pointer', padding: 0, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 4, fontWeight: 600 }}>
                        <ChevronLeft size={16} /> Back to Purchase Orders
                    </button>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: '#1e293b' }}>{po.poNumber}</h1>
                                <span style={{ padding: '4px 14px', borderRadius: 20, fontSize: 12, fontWeight: 700, background: sc.bg, color: sc.color, border: `1px solid ${sc.border}` }}>{po.status}</span>
                            </div>
                            <div style={{ color: '#64748b', fontSize: 13, marginTop: 4, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                                <span style={{ fontWeight: 600, color: '#1e293b' }}>{po.supplierName || po.supplierId?.supplierName}</span>
                                <span>•</span>
                                <span>PO: {fmt(po.poDate)}</span>
                                <span>•</span>
                                <span>Expected: {fmt(po.expectedDeliveryDate)}</span>
                                {(po.supplierGstNumber || po.supplierId?.gstNumber) && (
                                    <>
                                        <span>•</span>
                                        <span style={{ fontWeight: 600 }}>GST: {po.supplierGstNumber || po.supplierId?.gstNumber}</span>
                                    </>
                                )}
                            </div>
                            {(po.supplierAddress || po.supplierId?.address) && (
                                <div style={{ color: '#94a3b8', fontSize: 12, marginTop: 4, maxWidth: 600 }}>
                                    📍 {po.supplierAddress || `${po.supplierId?.address}, ${po.supplierId?.city}, ${po.supplierId?.state}`}
                                </div>
                            )}
                        </div>
                        <div style={{ display: 'flex', gap: 10 }}>
                            <Button variant="outline" onClick={() => window.print()} style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700 }}>
                                <Printer size={18} /> Print Order
                            </Button>
                            <Button variant="outline" onClick={() => window.print()} style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, border: '1px solid #ef4444', color: '#ef4444' }}>
                                <FileText size={18} /> Export PDF
                            </Button>
                            <Button 
                                onClick={() => setIsCommModalOpen(true)}
                                style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, background: '#25d366', color: '#fff' }}
                            >
                                <MessageSquare size={18} /> Send WhatsApp
                            </Button>
                            <Button 
                                onClick={() => setIsCommModalOpen(true)}
                                style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, background: '#ea4335', color: '#fff' }}
                            >
                                <Mail size={18} /> Send Email
                            </Button>
                            {['Draft', 'Ordered'].includes(po.status) && (
                                <>
                                    <Button variant="secondary" onClick={() => navigate(PATHS.PURCHASE.EDIT_ORDER(po._id))} style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700 }}>
                                        <Edit size={18} /> Edit
                                    </Button>
                                    <Button variant="danger" onClick={() => {
                                        if (window.confirm('Are you sure you want to delete this purchase order?')) {
                                            deletePurchaseOrder(po._id).then(() => { toast.success('Order deleted successfully'); navigate(PATHS.PURCHASE.ORDERS); }).catch(e => toast.error(e.response?.data?.message || 'Failed to delete order'));
                                        }
                                    }} style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700 }}>
                                        <Trash2 size={18} /> Delete
                                    </Button>
                                </>
                            )}
                            {['Ordered', 'Partially Received'].includes(po.status) && po.invoiceStatus !== 'Fully Invoiced' && (
                                <Button onClick={() => navigate(`${PATHS.PURCHASE.NEW_INVOICE}?poId=${id}`)} style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, background: '#0d9488', color: '#fff', boxShadow: '0 4px 12px rgba(13,148,136,0.3)' }}>
                                    <FileText size={18} /> Create Invoice
                                </Button>
                            )}
                            {canReceive && (
                                <Button onClick={() => setShowGRN(true)} style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, background: '#0fa968', color: '#fff', boxShadow: '0 4px 12px rgba(15,169,104,0.3)' }}>
                                    <Package size={18} /> Receive Material
                                </Button>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            <div style={{ padding: '24px 28px' }}>
                {/* Info Cards */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12, marginBottom: 24 }}>
                    {[
                        ['Total Taxable', `₹${totalTaxable.toLocaleString('en-IN')}`, '#2563eb'],
                        ['Total GST', `₹${(po.taxTotal || 0).toLocaleString('en-IN')}`, '#d97706'],
                        ['Grand Total', `₹${(po.grandTotal || 0).toLocaleString('en-IN')}`, '#16a34a'],
                        ['Freight', `₹${(po.freightAmount || 0).toLocaleString('en-IN')}`, '#6b7280'],
                    ].map(([k, v, c]) => (
                        <div key={k} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                            <div style={{ fontSize: 11, color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase' }}>{k}</div>
                            <div style={{ fontSize: 18, fontWeight: 700, color: c, marginTop: 4 }}>{v}</div>
                        </div>
                    ))}
                </div>

                {/* Items Table */}
                <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden', marginBottom: 24, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                    <div style={{ padding: '14px 20px', borderBottom: '1px solid #f3f4f6' }}>
                        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#1e293b' }}>Order Items</h2>
                    </div>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead>
                            <tr>
                                {['Item', 'HSN/SAC', 'UOM', 'Qty', 'Received Qty', 'Pending Qty', 'Rate', 'Tax%', 'Total Amount'].map(h => (
                                    <th key={h} style={th}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {(po.items || []).map((item) => (
                                <tr key={item._id}
                                    onMouseEnter={e => e.currentTarget.style.background = '#f8f9fa'}
                                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                    <td style={td}>
                                        <div style={{ color: '#1e293b', fontWeight: 500 }}>{item.itemName}</div>
                                        <div style={{ color: '#9ca3af', fontSize: 11 }}>{item.itemCode}</div>
                                    </td>
                                    <td style={td}>{item.hsnCode || '—'}</td>
                                    <td style={td}>{item.uom}</td>
                                    <td style={{ ...td, color: '#2563eb', fontWeight: 600 }}>{item.orderedQty}</td>
                                    <td style={{ ...td, color: '#16a34a', fontWeight: 600 }}>{item.receivedQty}</td>
                                    <td style={td}>
                                        <span style={{
                                            padding: '2px 10px', borderRadius: 10, fontWeight: 700, fontSize: 12,
                                            background: item.pendingQty > 0 ? '#fffbeb' : '#f0fdf4',
                                            color: item.pendingQty > 0 ? '#d97706' : '#16a34a',
                                            border: `1px solid ${item.pendingQty > 0 ? '#fcd34d' : '#86efac'}`
                                        }}>
                                            {item.pendingQty}
                                        </span>
                                    </td>
                                    <td style={td}>₹{item.rate}</td>
                                    <td style={td}>{item.taxPercent}%</td>
                                    <td style={{ ...td, color: '#16a34a', fontWeight: 700 }}>₹{(item.totalAmount || 0).toLocaleString('en-IN')}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* GRN History */}
                <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                    <div style={{ padding: '14px 20px', borderBottom: '1px solid #f3f4f6' }}>
                        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#1e293b' }}>📦 GRN History ({grns.length})</h2>
                    </div>
                    {grns.length === 0 ? (
                        <div style={{ padding: 32, textAlign: 'center', color: '#9ca3af' }}>No GRNs yet. Click &quot;Receive Material&quot; to create one.</div>
                    ) : grns.map((grn, i) => (
                        <div key={grn._id} style={{ padding: '16px 20px', borderBottom: i < grns.length - 1 ? '1px solid #f3f4f6' : 'none' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                                <div>
                                    <span style={{ fontWeight: 700, color: '#2563eb' }}>{grn.grnNumber}</span>
                                    <span style={{ color: '#9ca3af', fontSize: 12, marginLeft: 10 }}>{fmt(grn.grnDate)}</span>
                                </div>
                                <span style={{ color: '#16a34a', fontWeight: 700 }}>₹{(grn.totalAmount || 0).toLocaleString('en-IN')}</span>
                            </div>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                                <thead>
                                    <tr style={{ background: '#f9fafb' }}>
                                        {['Item', 'Received Qty', 'Rate', 'Amount', 'QC Status'].map(h => <th key={h} style={{ padding: '5px 10px', textAlign: 'left', color: '#6b7280', fontWeight: 600 }}>{h}</th>)}
                                    </tr>
                                </thead>
                                <tbody>
                                    {grn.items.map(gi => (
                                        <tr key={gi._id}>
                                            <td style={{ padding: '6px 10px', color: '#374151' }}>{gi.itemName}</td>
                                            <td style={{ padding: '6px 10px', color: '#16a34a', fontWeight: 600 }}>{gi.receivedQty}</td>
                                            <td style={{ padding: '6px 10px', color: '#6b7280' }}>₹{gi.rate}</td>
                                            <td style={{ padding: '6px 10px', color: '#16a34a' }}>₹{gi.amount}</td>
                                            <td style={{ padding: '6px 10px' }}>
                                                <span style={{
                                                    padding: '2px 8px', borderRadius: 8, fontSize: 11, fontWeight: 600,
                                                    background: gi.qcStatus === 'Accepted' ? '#f0fdf4' : gi.qcStatus === 'Rejected' ? '#fef2f2' : '#f1f5f9',
                                                    color: gi.qcStatus === 'Accepted' ? '#16a34a' : gi.qcStatus === 'Rejected' ? '#dc2626' : '#64748b',
                                                    border: `1px solid ${gi.qcStatus === 'Accepted' ? '#86efac' : gi.qcStatus === 'Rejected' ? '#fca5a5' : '#e2e8f0'}`
                                                }}>
                                                    {gi.qcStatus}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ))}
                </div>
            </div>

            {/* GRN Modal */}
            {showGRN && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
                    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 16, padding: 28, width: '100%', maxWidth: 820, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}>
                        <h2 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 700, color: '#1e293b' }}>📦 Receive Material – {po.poNumber}</h2>
                        <p style={{ margin: '0 0 20px', color: '#9ca3af', fontSize: 13 }}>Enter received quantities. Only items with qty &gt; 0 will be recorded.</p>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginBottom: 20 }}>
                            <thead>
                                <tr>
                                    {['Item', 'Ordered', 'Received', 'Pending', 'Receive Qty *', 'QC Status', 'Batch No'].map(h => (
                                        <th key={h} style={th}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {(po.items || []).filter(i => i.pendingQty > 0).map(item => (
                                    <tr key={item._id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                        <td style={td}>
                                            <div style={{ fontWeight: 500, color: '#1e293b' }}>{item.itemName}</div>
                                            <div style={{ fontSize: 11, color: '#9ca3af' }}>{item.itemCode}</div>
                                        </td>
                                        <td style={{ ...td, color: '#2563eb', fontWeight: 600 }}>{item.orderedQty}</td>
                                        <td style={{ ...td, color: '#16a34a' }}>{item.receivedQty}</td>
                                        <td style={{ ...td, color: '#d97706', fontWeight: 700 }}>{item.pendingQty}</td>
                                        <td style={{ ...td, width: 110 }}>
                                            <input type="number" min="0" max={item.pendingQty} step="0.01"
                                                value={grnForm[item._id]?.receivedQty || ''}
                                                onChange={e => setFormItem(item._id, 'receivedQty', Number(e.target.value))}
                                                style={{ ...inp, border: '1px solid #0d9488' }} />
                                        </td>
                                        <td style={{ ...td, width: 120 }}>
                                            <select value={grnForm[item._id]?.qcStatus || 'Pending'}
                                                onChange={e => setFormItem(item._id, 'qcStatus', e.target.value)} style={{ ...inp, cursor: 'pointer' }}>
                                                <option>Pending</option>
                                                <option>Accepted</option>
                                                <option>Rejected</option>
                                                <option>Hold</option>
                                            </select>
                                        </td>
                                        <td style={{ ...td, width: 110 }}>
                                            <input value={grnForm[item._id]?.batchNo || ''} onChange={e => setFormItem(item._id, 'batchNo', e.target.value)} style={inp} placeholder="Batch #" />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {(po.items || []).filter(i => i.pendingQty > 0).length === 0 && (
                            <div style={{ padding: 20, textAlign: 'center', color: '#16a34a', fontWeight: 600 }}>✓ All items fully received!</div>
                        )}
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                            <button onClick={() => setShowGRN(false)} style={{ padding: '8px 16px', background: '#f1f5f9', color: '#374151', border: '1px solid #e2e8f0', borderRadius: 7, cursor: 'pointer', fontWeight: 600 }}>Cancel</button>
                            <button onClick={handleGRNSubmit} disabled={saving} style={{ padding: '8px 20px', background: '#0d9488', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer', fontWeight: 700 }}>
                                {saving ? 'Creating GRN...' : '✓ Confirm Receipt & Update Stock'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {/* Print Styles */}
            <style>{`
                @media print { 
                    @page { margin: 0; size: A4 portrait; }
                    body { background: #fff !important; margin: 0 !important; padding: 0 !important; width: 210mm; height: 297mm; overflow: hidden; }
                    
                    /* Hide everything in the body by default */
                    body * { visibility: hidden; }
                    
                    /* Show only the print-only container and its children */
                    .print-only, .print-only * { visibility: visible !important; }
                    .print-only { 
                        position: absolute; 
                        left: 0; 
                        top: 0; 
                        width: 210mm !important; 
                        height: 297mm !important;
                        max-height: 297mm !important;
                        display: flex !important; 
                        flex-direction: column !important;
                        margin: 0 !important;
                        padding: 0 !important;
                        overflow: hidden !important;
                        box-sizing: border-box !important;
                    }

                    .print-content {
                        flex: 1;
                        display: flex;
                        flex-direction: column;
                        overflow: hidden;
                    }

                    button, [data-no-print], .no-print, #app-sidebar, #app-header { display: none !important; } 
                    * { color: #000 !important; box-shadow: none !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
                    table th { background: #f5f5f5 !important; }
                    
                    /* Prevent breaking critical blocks */
                    .p-header, .p-footer, .p-summary { page-break-inside: avoid !important; }
                    
                    /* Adjust table row height for dense content if needed */
                    table td { padding: 4px 8px !important; }
                }
            `}</style>

            <CommunicationModal 
                isOpen={isCommModalOpen}
                onClose={() => setIsCommModalOpen(false)}
                onSend={handleSendComm}
                type="Purchase Order"
                data={{
                    recipientName: po.supplierName || po.supplierId?.supplierName,
                    email: po.supplierEmail || po.supplierId?.email,
                    phone: po.supplierPhone || po.supplierId?.phone,
                    supplierId: po.supplierId?._id || po.supplierId,
                    number: po.poNumber,
                    id: id,
                    items: po.items,
                    total: po.grandTotal
                }}
            />
        </div>
    );
}
