import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ClipboardList, PackageOpen, RotateCcw, BarChart3, ChevronRight, Layers, ScanLine, History } from 'lucide-react';
import { useCompany } from '@/contexts/CompanyContext';
import { isTextileIndustryCompany } from '@/utils/industryInventoryLabels';
import { PATHS } from '@/routes/paths';

const cards = [
    { title: 'Issue Challan', desc: 'Issue material to job worker — all process types', path: PATHS.PRODUCTION.TEXTILE_JOB_WORK.ISSUE, icon: ClipboardList, color: '#7c3aed' },
    { title: 'Return Entry', desc: 'Receive processed material — scan QR or select challan', path: PATHS.PRODUCTION.TEXTILE_JOB_WORK.RETURN, icon: RotateCcw, color: '#059669' },
    { title: 'Process Output Stock', desc: 'Returned stock waiting for next process — balances & status', path: PATHS.PRODUCTION.TEXTILE_JOB_WORK.PROCESS_OUTPUT_STOCK, icon: Layers, color: '#9333ea' },
    { title: 'Process Trace', desc: 'Scan QR / challan no for full process history chain', path: PATHS.PRODUCTION.TEXTILE_JOB_WORK.PROCESS_TRACE, icon: ScanLine, color: '#0891b2' },
    { title: 'Stock With Job Worker', desc: 'Pending stock at vendors by process type', path: PATHS.PRODUCTION.TEXTILE_JOB_WORK.STOCK, icon: PackageOpen, color: '#2563eb' },
    { title: 'Job Work Reports', desc: 'Returns, ledger, loss and pending reports', path: PATHS.PRODUCTION.TEXTILE_JOB_WORK.REPORTS, icon: BarChart3, color: '#d97706' },
    { title: 'Process Output Reports', desc: 'Pending next process, history and FG transfers', path: PATHS.PRODUCTION.TEXTILE_JOB_WORK.PROCESS_OUTPUT_REPORTS, icon: History, color: '#be185d' },
];

export default function TextileJobWorkHomePage() {
    const navigate = useNavigate();
    const { selectedCompany } = useCompany();
    const isTextile = isTextileIndustryCompany(selectedCompany);

    if (!isTextile) {
        return <div style={{ padding: 24 }}>Textile / Handloom company required.</div>;
    }

    return (
        <div style={{ padding: '20px 24px', maxWidth: 960, margin: '0 auto' }}>
            <h1 style={{ margin: '0 0 6px', fontSize: 24, fontWeight: 800 }}>Textile Job Work</h1>
            <p style={{ margin: '0 0 24px', fontSize: 14, color: '#64748b' }}>
                One module for Dyeing, Printing, Embroidery and all job-work processes
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16 }}>
                {cards.map((c) => {
                    const Icon = c.icon;
                    return (
                        <button
                            key={c.path}
                            type="button"
                            onClick={() => navigate(c.path)}
                            style={{
                                textAlign: 'left',
                                padding: 18,
                                border: '1px solid #e2e8f0',
                                borderRadius: 12,
                                background: '#fff',
                                cursor: 'pointer',
                                boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                                <div style={{ width: 40, height: 40, borderRadius: 10, background: `${c.color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: c.color }}>
                                    <Icon size={20} />
                                </div>
                                <ChevronRight size={16} color="#94a3b8" />
                            </div>
                            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>{c.title}</div>
                            <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.4 }}>{c.desc}</div>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
