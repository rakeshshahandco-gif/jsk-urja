import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getReplacementDispatch } from '@/services/serviceApi';
import { getCompanyProfile } from '@/services/settingsApi';
import { Printer, ChevronLeft } from 'lucide-react';

import { BrandedLoader } from '@/components/ui/BrandedLoading';

const ReplacementDispatchPrintPage = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const [doc, setDoc] = useState(null);
    const [company, setCompany] = useState(null);
    const printRef = useRef();

    useEffect(() => {
        getReplacementDispatch(id).then(setDoc).catch(console.error);
        getCompanyProfile().then(setCompany).catch(console.error);
    }, [id]);

    const handlePrint = () => window.print();

    if (!doc) return <BrandedLoader size={120} />;

    const totalQty = doc.items?.reduce((s, i) => s + i.qty, 0) || 0;

    return (
        <>
            {/* Screen Toolbar */}
            <div className="no-print" style={{ display: 'flex', gap: 8, padding: '10px 16px', background: '#1d4ed8', alignItems: 'center' }}>
                <button onClick={() => navigate(-1)} style={{ display: 'flex', alignItems: 'center', gap: 5, height: 30, padding: '0 12px', background: 'rgba(255,255,255,0.2)', color: '#fff', border: 'none', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                    <ChevronLeft size={13} /> Back
                </button>
                <button onClick={handlePrint} style={{ display: 'flex', alignItems: 'center', gap: 5, height: 30, padding: '0 16px', background: '#fff', color: '#1d4ed8', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                    <Printer size={14} /> Print Challan
                </button>
                <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12, marginLeft: 8 }}>Replacement Delivery Order — {doc.doNo}</span>
            </div>

            {/* Printable area */}
            <div ref={printRef} style={{ maxWidth: 800, margin: '20px auto', padding: 32, background: '#fff', fontFamily: 'Arial, sans-serif', fontSize: 12, color: '#111' }}>
                {/* Company Header */}
                <div style={{ textAlign: 'center', borderBottom: '2px solid #000', paddingBottom: 10, marginBottom: 12 }}>
                    <div style={{ fontSize: 20, fontWeight: 900 }}>{company?.companyName || 'SHREEJAL'}</div>
                    <div style={{ fontSize: 11, marginTop: 2 }}>{company?.address || ''}</div>
                    <div style={{ fontSize: 11 }}>GST: {company?.gstin || ''} | Ph: {company?.phone || ''}</div>
                </div>

                {/* Document Title */}
                <div style={{ textAlign: 'center', marginBottom: 14 }}>
                    <div style={{ fontSize: 16, fontWeight: 900, letterSpacing: 1, textTransform: 'uppercase', border: '2px solid #000', display: 'inline-block', padding: '4px 20px' }}>
                        REPLACEMENT DELIVERY ORDER
                    </div>
                    <div style={{ fontSize: 11, color: '#444', marginTop: 4 }}>Material Sent as Replacement Against Faulty Complaint</div>
                </div>

                {/* Doc Details */}
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14, fontSize: 11 }}>
                    <table style={{ borderCollapse: 'collapse', flex: 1 }}>
                        <tbody>
                            <tr><td style={{ padding: '2px 6px', fontWeight: 700 }}>DO No.:</td><td style={{ padding: '2px 6px', fontFamily: 'monospace', fontWeight: 700 }}>{doc.doNo}</td></tr>
                            <tr><td style={{ padding: '2px 6px', fontWeight: 700 }}>Date:</td><td style={{ padding: '2px 6px' }}>{new Date(doc.date).toLocaleDateString('en-IN')}</td></tr>
                            <tr><td style={{ padding: '2px 6px', fontWeight: 700 }}>Complaint Ref.:</td><td style={{ padding: '2px 6px', fontWeight: 700, color: '#dc2626' }}>{doc.complaintNo}</td></tr>
                            <tr><td style={{ padding: '2px 6px', fontWeight: 700 }}>Orig. Invoice:</td><td style={{ padding: '2px 6px' }}>{doc.salesInvoiceNo || '—'}</td></tr>
                        </tbody>
                    </table>
                    <div style={{ flex: 1, border: '1px solid #000', padding: 10, borderRadius: 4 }}>
                        <div style={{ fontWeight: 700, fontSize: 11, marginBottom: 4 }}>TO:</div>
                        <div style={{ fontWeight: 900, fontSize: 13 }}>{doc.customerName}</div>
                        <div style={{ marginTop: 4 }}>{doc.dispatchAddress}</div>
                    </div>
                </div>

                {/* Items Table */}
                <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 14 }}>
                    <thead>
                        <tr style={{ background: '#f3f4f6' }}>
                            {['#', 'Item Code', 'Item Description', 'UOM', 'Qty', 'Remark'].map(h =>
                                <th key={h} style={{ border: '1px solid #000', padding: '6px 8px', fontSize: 11, fontWeight: 700 }}>{h}</th>
                            )}
                        </tr>
                    </thead>
                    <tbody>
                        {doc.items?.map((item, i) => (
                            <tr key={i}>
                                <td style={{ border: '1px solid #000', padding: '6px 8px', textAlign: 'center' }}>{i + 1}</td>
                                <td style={{ border: '1px solid #000', padding: '6px 8px', fontFamily: 'monospace' }}>{item.itemCode}</td>
                                <td style={{ border: '1px solid #000', padding: '6px 8px', fontWeight: 600 }}>{item.itemName}</td>
                                <td style={{ border: '1px solid #000', padding: '6px 8px', textAlign: 'center' }}>{item.uom}</td>
                                <td style={{ border: '1px solid #000', padding: '6px 8px', textAlign: 'center', fontWeight: 900 }}>{item.qty}</td>
                                <td style={{ border: '1px solid #000', padding: '6px 8px', color: '#444' }}>{item.remark || 'Replacement against faulty material'}</td>
                            </tr>
                        ))}
                        <tr style={{ background: '#f3f4f6' }}>
                            <td colSpan={4} style={{ border: '1px solid #000', padding: '6px 8px', textAlign: 'right', fontWeight: 700 }}>Total Qty:</td>
                            <td style={{ border: '1px solid #000', padding: '6px 8px', textAlign: 'center', fontWeight: 900 }}>{totalQty}</td>
                            <td style={{ border: '1px solid #000' }}></td>
                        </tr>
                    </tbody>
                </table>

                {/* Transport Details */}
                {(doc.dispatchThrough || doc.lrNo) && (
                    <div style={{ border: '1px solid #000', padding: 8, marginBottom: 14, fontSize: 11 }}>
                        <strong>Transport:</strong> {doc.dispatchThrough} &nbsp;|&nbsp; <strong>Vehicle/Courier:</strong> {doc.vehicleDetails} &nbsp;|&nbsp; <strong>LR/AWB:</strong> {doc.lrNo}
                    </div>
                )}

                {/* Notes */}
                {doc.notes && <div style={{ border: '1px dashed #999', padding: 8, marginBottom: 14, fontSize: 11, color: '#444' }}><strong>Note:</strong> {doc.notes}</div>}

                {/* Signature area */}
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 40, paddingTop: 10 }}>
                    {[`Prepared By\n${doc.preparedBy || ''}`, 'Store / Dispatch', 'Received By (Customer)'].map(sig => (
                        <div key={sig} style={{ textAlign: 'center', flex: 1 }}>
                            <div style={{ borderTop: '1px solid #000', paddingTop: 6, fontSize: 11, whiteSpace: 'pre-line' }}>{sig}</div>
                        </div>
                    ))}
                </div>
            </div>

            <style>{`@media print { .no-print { display: none !important; } body { margin: 0; } }`}</style>
        </>
    );
};

export default ReplacementDispatchPrintPage;
