import React, { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ChevronLeft, Printer } from 'lucide-react';
import { PATHS } from '@/routes/paths';
import { useCompany } from '@/contexts/CompanyContext';
import { getTextileJobWorkProcessConfig } from '@/utils/textileJobWorkProcessConfig';
import { getTextileJobWorkChallan } from '@/services/textileJobWorkChallanApi';
import { getSuppliers } from '@/services/purchaseApi';
import { BrandedLoader } from '@/components/ui/BrandedLoading';
import TextileJobWorkChallanPrintLayout from '@/features/production/textileDyeingChallan/TextileJobWorkChallanPrintLayout';
import TextileJobWorkChallanQrBlock from '@/features/production/textileDyeingChallan/TextileJobWorkChallanQrBlock';

const th = { padding: 8, textAlign: 'left', borderBottom: '1px solid #e2e8f0', fontSize: 11, color: '#64748b' };
const td = { padding: 8, borderBottom: '1px solid #f1f5f9', fontSize: 12 };

export function TextileJobWorkChallanDetailPage({ processType = 'Dyeing' }) {
    const cfg = getTextileJobWorkProcessConfig(processType);
    const { selectedCompany } = useCompany();
    const { id } = useParams();
    const [searchParams] = useSearchParams();
    const poId = searchParams.get('po');
    const navigate = useNavigate();
    const [doc, setDoc] = useState(null);
    const [jobWorker, setJobWorker] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        getTextileJobWorkChallan(processType, id)
            .then(setDoc)
            .catch((e) => toast.error(e.response?.data?.message || 'Failed to load'))
            .finally(() => setLoading(false));
    }, [id, processType]);

    useEffect(() => {
        if (!doc?.dyerName) return;
        getSuppliers({ limit: 500, isActive: 'true' })
            .then((res) => {
                const list = res?.suppliers || res || [];
                const key = doc.dyerName.trim().toLowerCase();
                setJobWorker(list.find((s) => String(s.supplierName || '').trim().toLowerCase() === key) || null);
            })
            .catch(() => setJobWorker(null));
    }, [doc?.dyerName]);

    if (loading) return <BrandedLoader size={100} />;
    if (!doc) return <div style={{ padding: 24 }}>Challan not found</div>;

    const detailCols = cfg.showColourFields
        ? ['Lot', 'Than', 'Colour', 'Issued m', 'M/PCS', 'Exp PCS', 'Exp Ret m', 'Exp Loss m', 'Labour ₹', 'Returned m', 'Pending m']
        : ['Lot', 'Than', 'Design', 'Input Qty', 'UOM', 'Issued m', 'M/PCS', 'Exp PCS', 'Labour ₹', 'Returned m', 'Pending m'];

    const handlePrint = () => window.print();

    return (
        <div style={{ fontFamily: "'Inter', sans-serif", background: '#f8fafc', minHeight: '100vh' }}>
            {/* A4 print layout — hidden on screen, visible when printing */}
            <div className="print-only textile-challan-print" style={{ display: 'none' }}>
                <TextileJobWorkChallanPrintLayout
                    doc={doc}
                    company={selectedCompany}
                    processType={processType}
                    jobWorker={jobWorker}
                />
            </div>

            {/* Screen view */}
            <div className="no-print" style={{ padding: '16px 20px', maxWidth: 1100, margin: '0 auto' }}>
                <button type="button" onClick={() => navigate(poId ? PATHS.PRODUCTION.TEXTILE_PRODUCTION_ORDER_DETAIL(poId) : cfg.paths.list)} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, border: 'none', background: 'none', color: '#64748b', cursor: 'pointer', marginBottom: 12 }}>
                    <ChevronLeft size={16} /> {poId ? 'Back to Production Order' : 'Back'}
                </button>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
                    <div>
                        <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 800 }}>{doc.challanNo}</h1>
                        <p style={{ margin: 0, color: '#64748b' }}>
                            {cfg.issueTitle} · {doc.dyerName} · {doc.status} · Issued {doc.totalIssuedMeter} m · Pending {doc.totalPendingMeter} m
                        </p>
                        {doc.productionOrderNo && (
                            <p style={{ margin: '8px 0 0', fontSize: 13, color: '#64748b' }}>Production Order: <strong>{doc.productionOrderNo}</strong></p>
                        )}
                    </div>
                    <button type="button" onClick={handlePrint} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 18px', borderRadius: 8, border: '1px solid #7c3aed', background: '#7c3aed', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
                        <Printer size={16} /> Print / PDF
                    </button>
                </div>

                <div style={{ background: '#faf5ff', border: '1px solid #ddd6fe', borderRadius: 8, padding: 14, marginBottom: 16, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, fontSize: 13 }}>
                    <div>Expected PCS: <strong>{doc.totalExpectedPcs ?? '—'}</strong></div>
                    <div>Expected Return Meter: <strong>{doc.totalExpectedReturnMeter ?? '—'}</strong></div>
                    <div>Expected Loss Meter: <strong>{doc.totalExpectedLossMeter ?? '—'}</strong></div>
                    <div>Total Labour: <strong>₹{doc.totalLabourAmount ?? 0}</strong></div>
                    <div>Actual Return Loss: <strong>{doc.totalLossMeter ?? 0} m</strong></div>
                </div>

                <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 16, marginBottom: 16, display: 'flex', justifyContent: 'flex-end' }}>
                    <TextileJobWorkChallanQrBlock
                        doc={doc}
                        company={selectedCompany}
                        processType={processType}
                        jobWorker={jobWorker}
                        variant="screen"
                    />
                </div>

                <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 16, overflow: 'auto' }}>
                    <h2 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 700 }}>Issue Lines</h2>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead><tr style={{ background: '#f8fafc' }}>
                            {detailCols.map((h) => <th key={h} style={th}>{h}</th>)}
                        </tr></thead>
                        <tbody>
                            {(doc.lines || []).map((l) => (
                                <tr key={l._id}>
                                    {cfg.showColourFields ? (
                                        <>
                                            <td style={td}>{l.lotNo}</td>
                                            <td style={td}>{l.thanNo}</td>
                                            <td style={td}>{l.colourName || l.colourInstructionType}</td>
                                            <td style={td}>{l.issuedMeter}</td>
                                            <td style={td}>{l.meterPerPcs || '—'}</td>
                                            <td style={td}>{l.expectedPcs ?? '—'}</td>
                                            <td style={td}>{l.expectedReturnMeter ?? '—'}</td>
                                            <td style={td}>{l.expectedLossMeter ?? '—'}</td>
                                            <td style={td}>{l.labourAmount ? `₹${l.labourAmount}` : '—'}</td>
                                            <td style={td}>{l.returnedMeter}</td>
                                            <td style={td}>{l.pendingMeter}</td>
                                        </>
                                    ) : (
                                        <>
                                            <td style={td}>{l.lotNo}</td>
                                            <td style={td}>{l.thanNo}</td>
                                            <td style={td}>{l.designPattern || l.colourName || '—'}</td>
                                            <td style={td}>{l.issuedQty || l.issuedMeter}</td>
                                            <td style={td}>{l.issuedUom || 'Meter'}</td>
                                            <td style={td}>{l.issuedMeter}</td>
                                            <td style={td}>{l.meterPerPcs || '—'}</td>
                                            <td style={td}>{l.expectedPcs ?? '—'}</td>
                                            <td style={td}>{l.labourAmount ? `₹${l.labourAmount}` : '—'}</td>
                                            <td style={td}>{l.returnedMeter}</td>
                                            <td style={td}>{l.pendingMeter}</td>
                                        </>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            <style>{`
                @media print {
                    @page { margin: 0; size: A4 portrait; }
                    body { background: #fff !important; margin: 0 !important; padding: 0 !important; }
                    body * { visibility: hidden; }
                    .print-only, .print-only * { visibility: visible !important; }
                    .print-only.textile-challan-print {
                        display: block !important;
                        position: absolute;
                        left: 0;
                        top: 0;
                        width: 210mm;
                        margin: 0;
                        padding: 0;
                    }
                    .textile-challan-print .challan-print-signatures {
                        display: flex !important;
                        flex-direction: row !important;
                        flex-wrap: nowrap !important;
                    }
                    .textile-challan-print .challan-print-footer {
                        page-break-inside: avoid !important;
                        break-inside: avoid !important;
                    }
                    .no-print, button, [data-no-print], #app-sidebar, #app-header { display: none !important; }
                    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
                }
            `}</style>
        </div>
    );
}

export default function TextileDyeingChallanDetailPage() {
    return <TextileJobWorkChallanDetailPage processType="Dyeing" />;
}
