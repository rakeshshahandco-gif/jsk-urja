import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { getInvoiceSeries, resequenceSeries } from '@/services/salesApi';
import { useAuth } from '@/hooks/useAuth';
import { PATHS } from '@/routes/paths';
import toast from 'react-hot-toast';

export default function ResequenceTool() {
    const { hasRole } = useAuth();
    const isAdmin = hasRole('admin') || hasRole('superadmin');
    const location = useLocation();
    const navigate = useNavigate();
    const [series, setSeries] = useState([]);
    const [loading, setLoading] = useState(false);
    
    const [form, setForm] = useState({
        seriesId: location.state?.seriesId || '',
        financialYear: location.state?.financialYear || '',
        overrideStartNumber: '',
        forceAll: false,
        confirm: false
    });

    useEffect(() => {
        getInvoiceSeries({ active: true }).then(res => setSeries(res || [])).catch(() => toast.error('Failed to load series'));
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!form.seriesId || !form.financialYear) return toast.error('Please select series and FY');
        if (!form.confirm) return toast.error('Please check the confirmation box');

        if (!window.confirm('CRITICAL ACTION: This will RENUMBER ALL UNLOCKED INVOICES in this series. Stock and Ledger references will be updated. Proceed?')) return;

        setLoading(true);
        try {
            const res = await resequenceSeries(form);
            toast.success(`Successfully re-sequenced ${res.count} invoices!`);
            navigate(PATHS.SALES.INVOICES);
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to re-sequence');
        } finally {
            setLoading(false);
        }
    };

    if (!isAdmin) return <div style={{ padding: 40, textAlign: 'center', color: '#ef4444', fontWeight: 700 }}>RESTRICTED: Administrator Access Only</div>;

    const selectedSeries = series.find(s => s._id === form.seriesId);

    return (
        <div style={{ padding: '30px 40px', maxWidth: 800, margin: '0 auto', fontFamily: "'Inter', sans-serif" }}>
            <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
                <div style={{ background: 'linear-gradient(135deg, #1e293b 0%, #334155 100%)', padding: '24px 32px', color: '#fff' }}>
                    <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800 }}>Invoice Resequence Tool</h1>
                    <p style={{ margin: '8px 0 0', opacity: 0.8, fontSize: 13 }}>Administrative Tool to fix numbering gaps and inconsistencies</p>
                </div>

                <form onSubmit={handleSubmit} style={{ padding: 32 }}>
                    <div style={{ padding: '16px 20px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 12, marginBottom: 24 }}>
                        <h3 style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 800, color: '#92400e', display: 'flex', alignItems: 'center', gap: 8 }}>
                            ⚠️ IMPORTANT RULES
                        </h3>
                        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: '#92400e', lineHeight: 1.6 }}>
                            <li>This will re-calculate serial numbers based on <strong>Invoice Date</strong> and <strong>Creation Time</strong>.</li>
                            <li><strong>Locked Invoices</strong> (Confirmed/Issued) will NOT be renumbered by default.</li>
                            <li><strong>Paid Invoices</strong> will NOT be renumbered unless "Force All" is enabled.</li>
                            <li>All references in <strong>Stock Ledger</strong> and <strong>Accounting Ledgers</strong> will be automatically updated.</li>
                        </ul>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }}>
                        <div>
                            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#64748b', marginBottom: 8, textTransform: 'uppercase' }}>Invoice Series</label>
                            <select 
                                value={form.seriesId} 
                                onChange={e => setForm({...form, seriesId: e.target.value})}
                                style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 14, outline: 'none' }}
                                required
                            >
                                <option value="">Select Series...</option>
                                {series.map(s => <option key={s._id} value={s._id}>{s.seriesName} ({s.prefix})</option>)}
                            </select>
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#64748b', marginBottom: 8, textTransform: 'uppercase' }}>Financial Year</label>
                            <input 
                                type="text"
                                value={form.financialYear}
                                onChange={e => setForm({...form, financialYear: e.target.value})}
                                placeholder="e.g. 2026-2027"
                                style={{ width: '100%', padding: '10px 14px', boxSizing: 'border-box', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 14, outline: 'none' }}
                                required
                            />
                        </div>
                    </div>

                    <div style={{ marginBottom: 24 }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', marginBottom: 12 }}>
                            <input 
                                type="checkbox" 
                                checked={form.forceAll} 
                                onChange={e => setForm({...form, forceAll: e.target.checked})}
                                style={{ width: 18, height: 18 }}
                            />
                            <span style={{ fontSize: 14, fontWeight: 600, color: '#1e293b' }}>Force resequence including Paid and Private Locked invoices</span>
                        </label>
                        <p style={{ fontSize: 11, color: '#94a3b8', margin: '0 0 0 28px' }}>Use this only if you are repairing a heavily corrupted sequence. Extremely dangerous for printed/issued invoices.</p>
                    </div>

                    <div style={{ padding: 20, background: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0', marginBottom: 32 }}>
                        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 12, cursor: 'pointer' }}>
                            <input 
                                type="checkbox" 
                                checked={form.confirm} 
                                onChange={e => setForm({...form, confirm: e.target.checked})}
                                style={{ width: 20, height: 20, marginTop: 2 }}
                                required
                            />
                            <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>
                                I understand that this action is irreversible and affects financial & stock records.
                                <div style={{ fontWeight: 500, color: '#64748b', marginTop: 4 }}>I have verified the selected series {selectedSeries && <strong>"{selectedSeries.seriesName}"</strong>}.</div>
                            </div>
                        </label>
                    </div>

                    <div style={{ display: 'flex', gap: 12 }}>
                        <button 
                            type="button" 
                            onClick={() => navigate(-1)}
                            style={{ flex: 1, padding: '12px', borderRadius: 10, background: '#fff', border: '1px solid #e2e8f0', color: '#64748b', fontWeight: 700, cursor: 'pointer' }}
                        >
                            Cancel
                        </button>
                        <button 
                            type="submit" 
                            disabled={loading}
                            style={{ flex: 2, padding: '12px', borderRadius: 10, background: '#1e293b', border: 'none', color: '#fff', fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 12px rgba(30,41,59,0.2)' }}
                        >
                            {loading ? 'Executing Resequence...' : '🚀 Start Bulk Resequence'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
