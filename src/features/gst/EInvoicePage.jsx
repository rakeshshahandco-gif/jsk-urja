import { useState } from 'react';
import { Search, QrCode, CheckCircle } from 'lucide-react';
import { BrandedLoader } from '@/components/ui';
import { toast } from 'react-hot-toast';
import { apiClient as axiosInstance } from '@/lib/apiClient';

const EInvoicePage = () => {
    const [invoiceNo, setInvoiceNo] = useState('');
    const [invoiceId, setInvoiceId] = useState('');
    const [payload, setPayload] = useState(null);
    const [loading, setLoading] = useState(false);
    const [generating, setGenerating] = useState(false);
    const [irnResult, setIrnResult] = useState(null);

    const searchInvoice = async () => {
        if (!invoiceNo.trim()) return toast.error('Enter invoice number');
        setLoading(true);
        try {
            const res = await axiosInstance.get('/sales/invoices', { params: { search: invoiceNo, limit: 5 } });
            const inv = (res.data?.data?.invoices || res.data?.data || [])[0];
            if (!inv) return toast.error('Invoice not found');
            setInvoiceId(inv._id);
            const pr = await axiosInstance.get(`/gst-reports/einvoice/${inv._id}/payload`);
            setPayload(pr.data?.data);
            setIrnResult(null);
        } catch { toast.error('Failed to fetch invoice'); }
        finally { setLoading(false); }
    };

    const generateIrn = async () => {
        if (!invoiceId) return;
        setGenerating(true);
        try {
            const res = await axiosInstance.post(`/gst-reports/einvoice/${invoiceId}/generate-irn`);
            setIrnResult(res.data?.data);
            toast.success('IRN generated successfully');
        } catch (err) { toast.error(err?.response?.data?.message || 'IRN generation failed'); }
        finally { setGenerating(false); }
    };

    return (
        <div className="p-6">
            <div className="flex items-center gap-3 mb-6">
                <QrCode className="text-blue-600" size={24} />
                <h1 className="text-xl font-bold text-slate-800">E-Invoice / IRN Generation</h1>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-5 text-sm text-blue-800">
                E-Invoice is applicable for businesses with turnover above ₹5 Crore. Enter the sales invoice number to generate the IRN from the IRP portal.
            </div>

            <div className="bg-white rounded-xl border p-4 mb-5 flex gap-4 items-end">
                <div className="flex-1 max-w-xs">
                    <label className="text-xs text-slate-500 block mb-1">Sales Invoice Number</label>
                    <input className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="e.g. INV-2025-001" value={invoiceNo} onChange={e => setInvoiceNo(e.target.value)} onKeyDown={e => e.key === 'Enter' && searchInvoice()} />
                </div>
                <button onClick={searchInvoice} className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">
                    <Search size={15} /> Fetch Payload
                </button>
            </div>

            {loading ? <BrandedLoader /> : payload && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                    <div className="bg-white rounded-xl border overflow-hidden">
                        <div className="px-4 py-3 border-b bg-slate-50 font-semibold text-slate-700 text-sm">E-Invoice Payload Preview</div>
                        <div className="p-4">
                            <div className="grid grid-cols-2 gap-y-2 text-sm">
                                {Object.entries(payload).slice(0, 12).map(([k, v]) => (
                                    <div key={k} className="contents">
                                        <span className="text-slate-500">{k}</span>
                                        <span className="font-medium text-slate-800 truncate">{String(v ?? '—')}</span>
                                    </div>
                                ))}
                            </div>
                            <button onClick={generateIrn} disabled={generating} className="mt-4 w-full flex items-center justify-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50">
                                <QrCode size={15} /> {generating ? 'Generating IRN...' : 'Generate IRN on IRP'}
                            </button>
                        </div>
                    </div>

                    {irnResult && (
                        <div className="bg-white rounded-xl border overflow-hidden">
                            <div className="px-4 py-3 border-b bg-green-50 font-semibold text-green-700 text-sm flex items-center gap-2">
                                <CheckCircle size={16} /> IRN Generated Successfully
                            </div>
                            <div className="p-4 space-y-3">
                                <div>
                                    <p className="text-xs text-slate-500 mb-1">IRN</p>
                                    <p className="font-mono text-xs break-all text-slate-800 bg-slate-50 rounded p-2">{irnResult.irn}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-slate-500 mb-1">Acknowledgement No</p>
                                    <p className="font-semibold text-slate-800">{irnResult.ackNo}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-slate-500 mb-1">Acknowledgement Date</p>
                                    <p className="text-slate-700">{irnResult.ackDate}</p>
                                </div>
                                {irnResult.signedQrCode && (
                                    <div>
                                        <p className="text-xs text-slate-500 mb-1">Signed QR Code</p>
                                        <p className="font-mono text-xs break-all text-slate-600 bg-slate-50 rounded p-2 max-h-24 overflow-y-auto">{irnResult.signedQrCode}</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default EInvoicePage;
