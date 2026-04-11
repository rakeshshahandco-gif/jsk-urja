import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSalesInvoices, getInvoiceSeries, bulkRenumberInvoices, bulkLockInvoices } from '@/services/salesApi';
import { PATHS } from '@/routes/paths';
import { useAuth } from '@/hooks/useAuth';
import toast from 'react-hot-toast';
import { Check, Lock, Unlock, Save, RefreshCw, ArrowLeft, Filter } from 'lucide-react';

const th = { padding: '12px 14px', textAlign: 'left', color: '#64748b', fontWeight: 600, borderBottom: '2px solid #e2e8f0', whiteSpace: 'nowrap', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.03em', background: '#f8fafc' };
const td = { padding: '10px 14px', fontSize: 13, borderBottom: '1px solid #f1f5f9', color: '#334155' };

export default function BulkInvoiceRenumber() {
    const navigate = useNavigate();
    const { hasRole } = useAuth();
    const [invoices, setInvoices] = useState([]);
    const [seriesOptions, setSeriesOptions] = useState([]);
    const [loading, setLoading] = useState(false);
    
    // Filters
    const [selectedSeries, setSelectedSeries] = useState('');
    const [selectedFY, setSelectedFY] = useState(localStorage.getItem('selectedFY') || '2026-2027');

    // Selection & Edits
    const [selectedIds, setSelectedIds] = useState({}); // { id: boolean }
    const [draftNumbers, setDraftNumbers] = useState({}); // { id: displayNumber }

    useEffect(() => {
        getInvoiceSeries().then(setSeriesOptions).catch(() => {});
    }, []);

    const load = useCallback(async () => {
        if (!selectedSeries) {
            setInvoices([]);
            return;
        }
        setLoading(true);
        try {
            const data = await getSalesInvoices({
                series: selectedSeries,
                financialYear: selectedFY,
                limit: 200,
                includeDeleted: false
            });
            const invs = data.invoices || [];
            setInvoices(invs);
            
            // Sync draft with current
            const drafts = {};
            invs.forEach(inv => {
                drafts[inv._id] = inv.displayInvoiceNumber || inv.invoiceNumber;
            });
            setDraftNumbers(drafts);
            setSelectedIds({});
        } catch (e) {
            toast.error('Failed to load invoices');
        } finally {
            setLoading(false);
        }
    }, [selectedSeries, selectedFY]);

    useEffect(() => { load(); }, [load]);

    const handleSelectAll = (e) => {
        const checked = e.target.checked;
        const newSel = {};
        if (checked) {
            invoices.forEach(inv => {
                if (!inv.numberLocked) newSel[inv._id] = true;
            });
        }
        setSelectedIds(newSel);
    };

    const toggleSelect = (id) => {
        setSelectedIds(prev => ({ ...prev, [id]: !prev[id] }));
    };

    const handleNumChange = (id, val) => {
        setDraftNumbers(prev => ({ ...prev, [id]: val }));
    };

    const handleAutoFill = () => {
        const idsToFill = Object.keys(selectedIds).filter(id => selectedIds[id]);
        if (idsToFill.length === 0) return toast.error('Select invoices to auto-fill');

        const series = seriesOptions.find(s => s._id === selectedSeries);
        if (!series) return toast.error('Series data missing');

        const startFrom = window.prompt('Auto-Fill: Start sequence from?', '1');
        if (startFrom === null) return;
        let seq = parseInt(startFrom, 10);
        if (isNaN(seq)) seq = 1;

        // Sort selected invoices by date then createdAt
        const sortedSubset = invoices
            .filter(inv => selectedIds[inv._id])
            .sort((a, b) => {
                const dateCompare = new Date(a.invoiceDate) - new Date(b.invoiceDate);
                if (dateCompare !== 0) return dateCompare;
                return new Date(a.createdAt) - new Date(b.createdAt);
            });

        const newDrafts = { ...draftNumbers };
        sortedSubset.forEach(inv => {
            const padded = String(seq).padStart(series.padLength || 2, '0');
            newDrafts[inv._id] = `${series.prefix}${padded}`;
            seq++;
        });
        setDraftNumbers(newDrafts);
        toast.success(`Prepared ${sortedSubset.length} numbers.`);
    };

    const handleLockBatch = async (lock) => {
        const idsToLock = Object.keys(selectedIds).filter(id => selectedIds[id]);
        if (idsToLock.length === 0) return toast.error('Select invoices first');

        if (!window.confirm(`${lock ? 'Lock' : 'Unlock'} ${idsToLock.length} invoices?`)) return;

        setLoading(true);
        try {
            await bulkLockInvoices({ ids: idsToLock, lock });
            toast.success('Status updated');
            load();
        } catch (e) {
            toast.error(e.response?.data?.message || 'Lock failed');
        } finally {
            setLoading(false);
        }
    };

    const handleSaveAll = async () => {
        const updates = [];
        invoices.forEach(inv => {
            if (draftNumbers[inv._id] !== (inv.displayInvoiceNumber || inv.invoiceNumber)) {
                updates.push({
                    id: inv._id,
                    newDisplayNumber: draftNumbers[inv._id]
                });
            }
        });

        if (updates.length === 0) return toast('No changes detected', { icon: 'ℹ️' });

        if (!window.confirm(`Save changes to ${updates.length} invoices?`)) return;

        setLoading(true);
        try {
            await bulkRenumberInvoices({
                updates,
                seriesId: selectedSeries,
                financialYear: selectedFY
            });
            toast.success('All changes saved successfully!');
            load();
        } catch (e) {
            toast.error(e.response?.data?.message || 'Bulk save failed');
        } finally {
            setLoading(false);
        }
    };

    const isAdmin = hasRole('admin') || hasRole('superadmin');
    if (!isAdmin) return <div style={{ padding: 40, textAlign: 'center' }}>Access Denied</div>;

    const selectedCount = Object.values(selectedIds).filter(Boolean).length;

    return (
        <div style={{ padding: '24px 28px', fontFamily: "'Inter', sans-serif", background: '#f8fafc', minHeight: '100vh' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                <div>
                    <button onClick={() => navigate(PATHS.SALES.INVOICES)} style={{ background: 'none', border: 'none', color: '#64748b', fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, padding: 0, marginBottom: 8 }}>
                        <ArrowLeft size={14} /> Back to Invoices
                    </button>
                    <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: '#0f172a' }}>🏗️ Bulk Invoice Renumbering</h1>
                    <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: 14 }}>Manually organize and lock multiple invoice numbers together</p>
                </div>
                
                <div style={{ display: 'flex', gap: 12 }}>
                    <button onClick={() => { setDraftNumbers({}); load(); }} style={{ padding: '10px 18px', borderRadius: 8, background: '#fff', color: '#64748b', border: '1px solid #e2e8f0', cursor: 'pointer', fontWeight: 600, fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <RefreshCw size={14} /> Discard Changes
                    </button>
                    <button onClick={handleSaveAll} disabled={loading} style={{ padding: '10px 24px', borderRadius: 8, background: '#0f172a', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', gap: 8, opacity: loading ? 0.7 : 1 }}>
                        <Save size={16} /> Save All Changes
                    </button>
                </div>
            </div>

            {/* Config & Filters */}
            <div style={{ background: '#fff', borderRadius: 12, padding: '16px 20px', border: '1px solid #e2e8f0', boxShadow: '0 1px 2px rgba(0,0,0,0.05)', marginBottom: 20, display: 'flex', gap: 20, alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Filter size={16} color="#64748b" />
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#475569' }}>Selection:</span>
                </div>
                
                <div style={{ display: 'flex', gap: 12, flex: 1 }}>
                    <select value={selectedFY} onChange={e => setSelectedFY(e.target.value)} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, outline: 'none', minWidth: 140 }}>
                        <option value="2024-2025">FY 2024-2025</option>
                        <option value="2025-2026">FY 2025-2026</option>
                        <option value="2026-2027">FY 2026-2027</option>
                    </select>

                    <select value={selectedSeries} onChange={e => setSelectedSeries(e.target.value)} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, outline: 'none', minWidth: 200 }}>
                        <option value="">-- Select Series --</option>
                        {seriesOptions.map(s => <option key={s._id} value={s._id}>{s.seriesName}</option>)}
                    </select>
                </div>

                <div style={{ display: 'flex', gap: 10 }}>
                    <button onClick={handleAutoFill} disabled={!selectedSeries || selectedCount === 0} style={{ padding: '8px 16px', borderRadius: 8, background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', cursor: 'pointer', fontWeight: 700, fontSize: 12, display: 'flex', alignItems: 'center', gap: 6, opacity: (!selectedSeries || selectedCount === 0) ? 0.5 : 1 }}>
                        ⚡ Auto Fill Serial
                    </button>
                    <button onClick={() => handleLockBatch(true)} disabled={selectedCount === 0} style={{ padding: '8px 16px', borderRadius: 8, background: '#fff1f2', color: '#e11d48', border: '1px solid #fecdd3', cursor: 'pointer', fontWeight: 700, fontSize: 12, display: 'flex', alignItems: 'center', gap: 6, opacity: selectedCount === 0 ? 0.5 : 1 }}>
                        <Lock size={13} /> Lock Selected
                    </button>
                    <button onClick={() => handleLockBatch(false)} disabled={selectedCount === 0} style={{ padding: '8px 16px', borderRadius: 8, background: '#f8fafc', color: '#475569', border: '1px solid #e2e8f0', cursor: 'pointer', fontWeight: 700, fontSize: 12, display: 'flex', alignItems: 'center', gap: 6, opacity: selectedCount === 0 ? 0.5 : 1 }}>
                        <Unlock size={13} /> Unlock Selected
                    </button>
                </div>
            </div>

            {/* Selection Info */}
            {selectedCount > 0 && (
                <div style={{ marginBottom: 12, padding: '8px 16px', background: '#334155', color: '#fff', borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{selectedCount} invoices selected for bulk actions</span>
                    <button onClick={() => setSelectedIds({})} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: 12, cursor: 'pointer', textDecoration: 'underline' }}>Clear Selection</button>
                </div>
            )}

            {/* Table */}
            <div style={{ background: '#fff', borderRadius: 12, overflow: 'hidden', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
                <div style={{ maxHeight: 'calc(100vh - 350px)', overflowY: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                            <tr>
                                <th style={{ ...th, width: 40 }}>
                                    <input type="checkbox" onChange={handleSelectAll} checked={selectedCount > 0 && selectedCount === invoices.filter(i => !i.numberLocked).length} />
                                </th>
                                <th style={th}>Current Invoice No</th>
                                <th style={th}>New Invoice No</th>
                                <th style={th}>Date</th>
                                <th style={th}>Customer</th>
                                <th style={th}>Amount</th>
                                <th style={th}>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan={7} style={{ padding: 60, textAlign: 'center', color: '#94a3b8' }}>Loading invoices...</td></tr>
                            ) : invoices.length === 0 ? (
                                <tr><td colSpan={7} style={{ padding: 60, textAlign: 'center', color: '#94a3b8' }}>{selectedSeries ? 'No invoices found for this selection' : 'Please select a series to begin'}</td></tr>
                            ) : invoices.map(inv => {
                                const isSelected = !!selectedIds[inv._id];
                                const isModified = draftNumbers[inv._id] !== (inv.displayInvoiceNumber || inv.invoiceNumber);
                                const isLocked = inv.numberLocked;

                                return (
                                    <tr key={inv._id} style={{ background: isSelected ? '#f0f9ff' : 'transparent', transition: 'background 0.2s' }}>
                                        <td style={td}>
                                            {!isLocked && <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(inv._id)} />}
                                        </td>
                                        <td style={{ ...td, fontWeight: 700, color: isLocked ? '#94a3b8' : '#334155' }}>
                                            {inv.displayInvoiceNumber || inv.invoiceNumber}
                                            {isLocked && <Lock size={12} style={{ marginLeft: 6, verticalAlign: 'middle', color: '#94a3b8' }} />}
                                        </td>
                                        <td style={td}>
                                            <input 
                                                type="text" 
                                                disabled={isLocked}
                                                value={draftNumbers[inv._id] || ''} 
                                                onChange={e => handleNumChange(inv._id, e.target.value)}
                                                style={{ 
                                                    padding: '6px 10px', borderRadius: 6, border: isModified ? '1px solid #0ea5e9' : '1px solid #e2e8f0',
                                                    width: '100%', background: isLocked ? '#f8fafc' : (isModified ? '#f0f9ff' : '#fff'),
                                                    fontSize: 13, fontWeight: isModified ? 700 : 400, color: isModified ? '#0369a1' : '#334155',
                                                    outline: 'none', transition: 'all 0.2s'
                                                }}
                                            />
                                        </td>
                                        <td style={td}>{new Date(inv.invoiceDate).toLocaleDateString('en-IN')}</td>
                                        <td style={{ ...td, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{inv.customerName}</td>
                                        <td style={{ ...td, fontWeight: 600 }}>₹{inv.grandTotal?.toLocaleString('en-IN')}</td>
                                        <td style={td}>
                                            {isLocked ? (
                                                <span style={{ fontSize: 10, fontWeight: 800, color: '#475569', background: '#f1f5f9', padding: '2px 8px', borderRadius: 4, border: '1px solid #cbd5e1' }}>🔒 LOCKED</span>
                                            ) : (
                                                <span style={{ fontSize: 10, fontWeight: 800, color: '#059669', background: '#ecfdf5', padding: '2px 8px', borderRadius: 4, border: '1px solid #6ee7b7' }}>🔓 UNLOCKED</span>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
