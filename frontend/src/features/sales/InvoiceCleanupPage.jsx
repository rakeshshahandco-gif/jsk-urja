import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getInvoiceSeries, previewCleanupDrafts, executeCleanupDrafts } from '@/services/salesApi';
import { getFinancialYears } from '@/services/financialYearApi';
import { PATHS } from '@/routes/paths';
import toast from 'react-hot-toast';
import { Trash2, AlertTriangle, CheckCircle, Info, ArrowLeft, Loader2, ShieldCheck, FileSearch, Archive } from 'lucide-react';

const cardStyle = {
    background: '#fff',
    borderRadius: '12px',
    border: '1px solid #e2e8f0',
    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
    padding: '24px',
    marginBottom: '24px'
};

const tableHeaderStyle = {
    background: '#f8fafc',
    padding: '12px 16px',
    borderBottom: '2px solid #e2e8f0',
    fontSize: '12px',
    fontWeight: '700',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: '0.05em'
};

const tableCellStyle = {
    padding: '12px 16px',
    borderBottom: '1px solid #f1f5f9',
    fontSize: '14px',
    color: '#334155'
};

const badgeStyle = {
    padding: '4px 10px',
    borderRadius: '9999px',
    fontSize: '12px',
    fontWeight: '600'
};

export default function InvoiceCleanupPage() {
    const navigate = useNavigate();
    const [fyList, setFyList] = useState([]);
    const [seriesList, setSeriesList] = useState([]);
    const [selectedFY, setSelectedFY] = useState(localStorage.getItem('selectedFY') || '');
    const [selectedSeries, setSelectedSeries] = useState('');
    const [searchText, setSearchText] = useState('');
    
    const [loading, setLoading] = useState(false);
    const [executing, setExecuting] = useState(false);
    const [data, setData] = useState(null);

    useEffect(() => {
        // Fetch FYs
        getFinancialYears().then(res => {
            const list = res?.data || [];
            setFyList(list);
            if (!selectedFY && list.length > 0) {
                const current = list.find(f => f.isCurrent)?.name || list[0].name;
                setSelectedFY(current);
            }
        });

        // Fetch Series
        getInvoiceSeries({ active: true }).then(res => {
            setSeriesList(res || []);
            if (!selectedSeries && res && res.length > 0) setSelectedSeries(res[0]._id);
        });
    }, []);

    const handlePreview = async () => {
        if (!selectedSeries && !searchText) return toast.error('Please select a series or enter a search term');
        setLoading(true);
        try {
            const res = await previewCleanupDrafts(selectedFY, selectedSeries, searchText);
            setData(res);
        } catch (e) {
            toast.error(e.response?.data?.message || 'Failed to load preview');
        } finally {
            setLoading(false);
        }
    };

    const handleForceDelete = async (inv) => {
        const confirmText = `FORCE DELETE ${inv.invoiceNumber}`;
        const reason = window.prompt(`CRITICAL: You are about to HARD-DELETE a Protected/Confirmed invoice. This will rollback its stock and ledger entries. To proceed, enter the reason (e.g. "Test data cleanup") and then type "${confirmText}":`);
        
        if (!reason || !window.confirm(`Are you absolutely sure you want to force delete ${inv.invoiceNumber}?`)) return;

        setExecuting(true);
        try {
            await forceCleanupInvoice(inv._id, reason);
            toast.success(`Invoice ${inv.invoiceNumber} force-deleted successfully.`);
            handlePreview(); // Refresh
        } catch (e) {
            toast.error(e.response?.data?.message || 'Force cleanup failed');
        } finally {
            setExecuting(false);
        }
    };

    const handleExecute = async () => {
        if (!data || data.eligible.length === 0) return;
        
        const confirmText = `DELETE ${data.eligible.length} INVOICES`;
        const userInput = window.prompt(`CRITICAL ACTION: This will permanently delete ${data.eligible.length} draft invoices and reset numbering. To proceed, type "${confirmText}" exactly:`);
        
        if (userInput !== confirmText) {
            return toast.error('Confirmation text mismatch. Deletion cancelled.');
        }

        setExecuting(true);
        try {
            const ids = data.eligible.map(inv => inv._id);
            await executeCleanupDrafts({
                financialYear: selectedFY,
                seriesId: selectedSeries,
                invoiceIds: ids
            });
            toast.success('Draft cleanup completed successfully!');
            setData(null);
            handlePreview(); // Refresh
        } catch (e) {
            toast.error(e.response?.data?.message || 'Cleanup execution failed');
        } finally {
            setExecuting(false);
        }
    };

    return (
        <div style={{ background: '#f1f5f9', minHeight: '100vh', padding: '32px' }}>
            <div style={{ maxWidth: '1110px', margin: '0 auto' }}>
                <button 
                    onClick={() => navigate(PATHS.SALES.INVOICES)}
                    style={{ 
                        display: 'inline-flex', alignItems: 'center', gap: '8px', border: 'none', background: 'none', 
                        color: '#64748b', fontSize: '14px', cursor: 'pointer', marginBottom: '20px', fontWeight: '500', padding: 0
                    }}
                >
                    <ArrowLeft size={16} /> Back to Invoices
                </button>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px' }}>
                    <div>
                        <h1 style={{ fontSize: '32px', fontWeight: '800', color: '#0f172a', margin: '0 0 8px', letterSpacing: '-0.02em' }}>
                            ♻️ Invoice Cleanup Tool
                        </h1>
                        <p style={{ color: '#64748b', fontSize: '16px', margin: 0, fontWeight: '500' }}>
                            Administrative workspace to purge test drafts and synchronize series numbering.
                        </p>
                    </div>
                    <div style={{ 
                        display: 'flex', alignItems: 'center', gap: '10px', background: '#ecfdf5', 
                        color: '#059669', padding: '10px 20px', borderRadius: '12px', border: '1px solid #a7f3d0', fontWeight: '700', fontSize: '14px', boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                    }}>
                        <ShieldCheck size={20} /> ADMIN ONLY
                    </div>
                </div>

                {/* Configuration Card */}
                <div style={cardStyle}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: '24px', alignItems: 'flex-end' }}>
                        <div>
                            <label style={{ display: 'block', fontSize: '12px', fontWeight: '800', color: '#475569', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Financial Year</label>
                            <select 
                                value={selectedFY} 
                                onChange={e => setSelectedFY(e.target.value)}
                                style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '2px solid #e2e8f0', outline: 'none', fontSize: '15px', fontWeight: '600', transition: 'border-color 0.2s', appearance: 'none', background: '#fff' }}
                            >
                                <option value="">-- Select FY --</option>
                                {fyList.map(fy => <option key={fy._id} value={fy.name}>{fy.name}</option>)}
                            </select>
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '12px', fontWeight: '800', color: '#475569', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Invoice Series</label>
                            <select 
                                value={selectedSeries} 
                                onChange={e => setSelectedSeries(e.target.value)}
                                style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '2px solid #e2e8f0', outline: 'none', fontSize: '15px', fontWeight: '600', transition: 'border-color 0.2s', appearance: 'none', background: '#fff' }}
                            >
                                <option value="">-- Choose Series --</option>
                                {seriesList.map(s => <option key={s._id} value={s._id}>{s.seriesName} ({s.prefix})</option>)}
                            </select>
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '12px', fontWeight: '800', color: '#475569', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Search Global (e.g. 02)</label>
                            <input 
                                type="text"
                                value={searchText}
                                onChange={e => setSearchText(e.target.value)}
                                placeholder="Search partial number..."
                                style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '2px solid #3b82f6', outline: 'none', fontSize: '15px', fontWeight: '600', background: '#eff6ff' }}
                            />
                        </div>
                        <button 
                            onClick={handlePreview}
                            disabled={loading || (!selectedSeries && !searchText)}
                            style={{ 
                                background: '#2563eb', color: '#fff', padding: '12px 32px', borderRadius: '10px', 
                                border: 'none', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '15px', boxShadow: '0 4px 12px rgba(37,99,235,0.2)', transition: 'transform 0.1s'
                            }}
                        >
                            {loading ? <Loader2 size={18} className="animate-spin" /> : <FileSearch size={20} />}
                            {loading ? 'Scanning...' : 'Scan Invoices'}
                        </button>
                    </div>
                </div>

                {data && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
                        {/* Summary Infographic */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                            <div style={{ ...cardStyle, background: '#f0fdf4', border: '2px solid #bbf7d0', margin: 0, position: 'relative', overflow: 'hidden' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative', zIndex: 1 }}>
                                    <div>
                                        <div style={{ fontSize: '15px', color: '#166534', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.02em', marginBottom: '4px' }}>Eligible Drafts</div>
                                        <div style={{ fontSize: '40px', fontWeight: '900', color: '#14532d' }}>{data.eligible.length}</div>
                                    </div>
                                    <CheckCircle size={48} color="#22c55e" opacity={0.6} />
                                </div>
                            </div>
                            <div style={{ ...cardStyle, background: '#fef2f2', border: '2px solid #fecaca', margin: 0, position: 'relative', overflow: 'hidden' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative', zIndex: 1 }}>
                                    <div>
                                        <div style={{ fontSize: '15px', color: '#991b1b', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.02em', marginBottom: '4px' }}>Protected (Blocked)</div>
                                        <div style={{ fontSize: '40px', fontWeight: '900', color: '#7f1d1d' }}>{data.blocked.length}</div>
                                    </div>
                                    <AlertTriangle size={48} color="#ef4444" opacity={0.6} />
                                </div>
                            </div>
                        </div>

                        {/* Eligible Table */}
                        {data.eligible.length > 0 && (
                            <div style={cardStyle}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', borderBottom: '1px solid #f1f5f9', paddingBottom: '16px' }}>
                                    <div>
                                        <h3 style={{ margin: 0, fontSize: '20px', fontWeight: '800', color: '#0f172a' }}>Eligible for Deletion</h3>
                                        <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#64748b', fontWeight: '500' }}>Invoices that meet all strict safety conditions for draft cleanup.</p>
                                    </div>
                                    <button 
                                        onClick={handleExecute}
                                        disabled={executing}
                                        style={{ 
                                            background: '#dc2626', color: '#fff', padding: '10px 24px', borderRadius: '10px', 
                                            border: 'none', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', boxShadow: '0 4px 12px rgba(220,38,38,0.2)'
                                        }}
                                    >
                                        {executing ? <Loader2 size={18} className="animate-spin" /> : <Trash2 size={18} />}
                                        Purge Eligible Drafts
                                    </button>
                                </div>
                                <div style={{ overflowX: 'auto' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                        <thead>
                                            <tr>
                                                <th style={tableHeaderStyle}>Invoice No</th>
                                                <th style={tableHeaderStyle}>Date</th>
                                                <th style={tableHeaderStyle}>Customer</th>
                                                <th style={tableHeaderStyle}>Amount</th>
                                                <th style={tableHeaderStyle}>State</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {data.eligible.map(inv => (
                                                <tr key={inv._id}>
                                                    <td style={{ ...tableCellStyle, fontWeight: '700', color: '#2563eb', fontFamily: 'monospace', letterSpacing: '0.02em', fontSize: '16px' }}>{inv.invoiceNumber}</td>
                                                    <td style={tableCellStyle}>{new Date(inv.invoiceDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                                                    <td style={{ ...tableCellStyle, fontWeight: '600' }}>{inv.customerName}</td>
                                                    <td style={{ ...tableCellStyle, fontWeight: '700' }}>₹{inv.grandTotal?.toLocaleString('en-IN')}</td>
                                                    <td style={tableCellStyle}>
                                                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                                            <span style={{ ...badgeStyle, background: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0' }}>DRAFT</span>
                                                            {inv.isDeleted && (
                                                                <span style={{ ...badgeStyle, background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                    <Archive size={12} /> ARCHIVED
                                                                </span>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {/* Blocked Table */}
                        {data.blocked.length > 0 && (
                            <div style={cardStyle}>
                                <div style={{ marginBottom: '20px', borderBottom: '1px solid #f1f5f9', paddingBottom: '16px' }}>
                                    <h3 style={{ margin: 0, fontSize: '20px', fontWeight: '800', color: '#0f172a' }}>Protected Invoices (Admin Override Available)</h3>
                                    <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#64748b', fontWeight: '500' }}>These invoices cannot be bulk-deleted. Force delete only if you are SURE they are test records.</p>
                                </div>
                                <div style={{ overflowX: 'auto' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                        <thead>
                                            <tr>
                                                <th style={tableHeaderStyle}>Invoice No</th>
                                                <th style={tableHeaderStyle}>Customer</th>
                                                <th style={tableHeaderStyle}>Blocking Reasons</th>
                                                <th style={tableHeaderStyle}>Resolution / Action</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {data.blocked.map(inv => (
                                                <tr key={inv._id}>
                                                    <td style={{ ...tableCellStyle, fontWeight: '700', color: '#64748b', fontFamily: 'monospace' }}>{inv.invoiceNumber}</td>
                                                    <td style={{ ...tableCellStyle, fontWeight: '600' }}>{inv.customerName}</td>
                                                    <td style={tableCellStyle}>
                                                        {inv.reasons.map((r, i) => (
                                                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#991b1b', fontSize: '13px', marginBottom: '6px', background: '#fef2f2', padding: '4px 10px', borderRadius: '6px', border: '1px solid #fecaca', fontWeight: '600' }}>
                                                                <AlertTriangle size={14} /> {r}
                                                            </div>
                                                        ))}
                                                    </td>
                                                    <td style={tableCellStyle}>
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'center' }}>
                                                            <button 
                                                                onClick={() => handleForceDelete(inv)}
                                                                disabled={executing}
                                                                style={{ 
                                                                    background: '#fff', color: '#dc2626', padding: '6px 12px', borderRadius: '8px', 
                                                                    border: '1px solid #fca5a5', fontWeight: '700', cursor: 'pointer', fontSize: '12px', width: '100%', transition: 'all 0.2s'
                                                                }}
                                                            >
                                                                FORCE DELETE
                                                            </button>
                                                            <span style={{ fontSize: '10px', color: '#94a3b8', textAlign: 'center' }}>Rolls back stock/ledgers</span>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Empty State */}
                {data && data.eligible.length === 0 && data.blocked.length === 0 && (
                    <div style={{ ...cardStyle, textAlign: 'center', padding: '80px 20px', borderStyle: 'dashed', background: '#f8fafc' }}>
                        <Info size={56} color="#94a3b8" style={{ marginBottom: '20px', opacity: 0.5 }} />
                        <h3 style={{ color: '#334155', fontSize: '20px', fontWeight: '800' }}>No Invoices in Scope</h3>
                        <p style={{ color: '#64748b', fontSize: '15px' }}>We couldn't find any invoices matching the selected series and financial year.</p>
                    </div>
                )}
            </div>
        </div>
    );
}
