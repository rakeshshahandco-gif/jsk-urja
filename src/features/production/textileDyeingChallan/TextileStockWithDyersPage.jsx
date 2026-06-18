import React, { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { useCompany } from '@/contexts/CompanyContext';
import { isTextileIndustryCompany } from '@/utils/industryInventoryLabels';
import { getTextileJobWorkProcessConfig } from '@/utils/textileJobWorkProcessConfig';
import {
    getStockWithVendorReport,
    getPendingJobWorkChallansReport,
    getJobWorkReturnRegisterReport,
    getVendorLedgerReport,
    getJobWorkLossReport,
} from '@/services/textileJobWorkChallanApi';
import { BrandedLoader } from '@/components/ui/BrandedLoading';

const th = { padding: 8, textAlign: 'left', borderBottom: '1px solid #e2e8f0', fontSize: 11, color: '#64748b', fontWeight: 700 };
const td = { padding: 8, borderBottom: '1px solid #f1f5f9', fontSize: 13 };

export function TextileJobWorkStockPage({ processType = 'Dyeing', defaultTab = 0, hideTitle = false }) {
    const cfg = getTextileJobWorkProcessConfig(processType);
    const vendorCol = processType === 'Dyeing' ? 'Dyer' : `${processType} Vendor`;
    const { selectedCompany } = useCompany();
    const isTextile = isTextileIndustryCompany(selectedCompany);
    const [tab, setTab] = useState(defaultTab);
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);

    const TABS = useMemo(() => [
        {
            id: 'stock',
            label: cfg.stockWithLabel,
            load: (params) => getStockWithVendorReport(processType, params),
            cols: ['Vendor', 'Challan No', 'Issue Date', 'Issued (m)', 'Returned (m)', 'Pending (m)', 'Days', 'Status'],
            row: (r) => [r.vendorName, r.challanNo, r.issueDate ? new Date(r.issueDate).toLocaleDateString() : ' ', r.meterIssued, r.meterReturned, r.pendingMeter, r.daysPending, r.status],
        },
        {
            id: 'pending',
            label: 'Pending Challans',
            load: (params) => getPendingJobWorkChallansReport(processType, params),
            cols: ['Vendor', 'Challan No', 'Issue Date', 'Pending (m)', 'Days', 'Status'],
            row: (r) => [r.vendorName, r.challanNo, r.issueDate ? new Date(r.issueDate).toLocaleDateString() : ' ', r.pendingMeter, r.daysPending, r.status],
        },
        {
            id: 'returns',
            label: 'Return Register',
            load: (params) => getJobWorkReturnRegisterReport(processType, params),
            cols: ['Challan', vendorCol, 'Return No', 'Return Date', 'Qty', 'Loss (m)'],
            row: (r) => [r.challanNo, r.dyerName, r.returnNo, r.returnDate ? new Date(r.returnDate).toLocaleDateString() : ' ', r.totalReturnedQty, r.totalLossMeter],
        },
        {
            id: 'ledger',
            label: `${vendorCol} Ledger`,
            load: (params) => getVendorLedgerReport(processType, params),
            cols: [vendorCol, 'Challans', 'Issued (m)', 'Returned (m)', 'Pending (m)', 'Loss (m)'],
            row: (r) => [r.dyerName, r.challanCount, r.issued?.toFixed?.(2) ?? r.issued, r.returned?.toFixed?.(2) ?? r.returned, r.pending?.toFixed?.(2) ?? r.pending, r.loss?.toFixed?.(2) ?? r.loss],
        },
        {
            id: 'loss',
            label: 'Loss Report',
            load: (params) => getJobWorkLossReport(processType, params),
            cols: ['Challan', vendorCol, 'Issue Date', 'Issued (m)', 'Returned (m)', 'Loss (m)'],
            row: (r) => [r.challanNo, r.dyerName, r.issueDate ? new Date(r.issueDate).toLocaleDateString() : ' ', r.issued, r.returned, r.loss],
        },
    ], [processType, cfg.stockWithLabel, vendorCol]);

    useEffect(() => {
        setTab(defaultTab);
    }, [processType, defaultTab]);

    useEffect(() => {
        if (!isTextile || !selectedCompany?._id) return setLoading(false);
        setLoading(true);
        TABS[tab].load({ companyId: selectedCompany._id })
            .then(setRows)
            .catch((e) => toast.error(e.response?.data?.message || 'Failed to load report'))
            .finally(() => setLoading(false));
    }, [tab, isTextile, selectedCompany?._id, TABS]);

    if (!isTextile) return <div style={{ padding: 24 }}>Textile company required.</div>;

    const reportCfg = TABS[tab];

    return (
        <div style={{ padding: hideTitle ? 0 : '16px 20px' }}>
            {!hideTitle && <h1 style={{ margin: '0 0 16px', fontSize: 22, fontWeight: 800 }}>{processType} Job Work Reports</h1>}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
                {TABS.map((t, i) => (
                    <button key={t.id} type="button" onClick={() => setTab(i)}
                        style={{ padding: '8px 12px', borderRadius: 8, border: tab === i ? '2px solid #7c3aed' : '1px solid #e2e8f0', background: tab === i ? '#f5f3ff' : '#fff', cursor: 'pointer', fontWeight: tab === i ? 700 : 500 }}>
                        {t.label}
                    </button>
                ))}
            </div>
            {loading ? <BrandedLoader size={80} /> : (
                <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead><tr style={{ background: '#f8fafc' }}>{reportCfg.cols.map((c) => <th key={c} style={th}>{c}</th>)}</tr></thead>
                        <tbody>
                            {rows.map((r, i) => (
                                <tr key={i}>{reportCfg.row(r).map((v, j) => <td key={j} style={td}>{v ?? ' '}</td>)}</tr>
                            ))}
                            {rows.length === 0 && <tr><td colSpan={reportCfg.cols.length} style={{ padding: 20, color: '#94a3b8' }}>No records</td></tr>}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

export default function TextileStockWithDyersPage() {
    return <TextileJobWorkStockPage processType="Dyeing" />;
}
