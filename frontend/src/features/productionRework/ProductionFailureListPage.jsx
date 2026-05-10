import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Plus, Eye, Filter } from 'lucide-react';
import { PATHS } from '@/routes/paths';
import { getFailures } from '@/services/productionReworkApi';
import { format } from 'date-fns';
import { Button, Input } from '@/components/ui';

const ProductionFailureListPage = () => {
    const navigate = useNavigate();
    const [failures, setFailures] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        fetchFailures();
    }, []);

    const fetchFailures = async () => {
        try {
            setLoading(true);
            const data = await getFailures();
            setFailures(data);
        } catch (error) {
            console.error('Error fetching failures:', error);
        } finally {
            setLoading(false);
        }
    };

    const filteredFailures = failures.filter(f =>
        f.failureNo.toLowerCase().includes(searchTerm.toLowerCase()) ||
        f.itemName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        f.itemCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (f.workOrderNo && f.workOrderNo.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    const getStatusStyles = (status) => {
        switch (status) {
            case 'Open': return { bg: '#fef2f2', color: '#dc2626' };
            case 'Sent for Rework': return { bg: '#fffbeb', color: '#d97706' };
            case 'Under Repair': return { bg: '#eff6ff', color: '#2563eb' };
            case 'Passed After Rework': return { bg: '#f0fdf4', color: '#16a34a' };
            default: return { bg: '#f1f5f9', color: '#64748b' };
        }
    };

    return (
        <div style={{ padding: '24px 28px', background: '#f8f9fa', minHeight: '100vh' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                <div>
                    <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0, color: '#1e293b' }}>Production Failure Entries</h1>
                    <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: 13 }}>Manage failed production quantities</p>
                </div>
                <button
                    onClick={() => navigate(PATHS.PRODUCTION.REWORK.NEW_FAILURE)}
                    style={{
                        background: '#2563eb', color: '#fff', border: 'none',
                        borderRadius: 8, padding: '10px 20px', fontSize: 13, fontWeight: 700,
                        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                        boxShadow: '0 4px 12px rgba(37,99,235,0.2)',
                    }}
                >
                    <Plus size={18} /> New Failure Entry
                </button>
            </div>

            <div style={{
                background: '#fff',
                padding: '16px 20px',
                borderRadius: 12,
                border: '1px solid #e2e8f0',
                display: 'flex',
                gap: 16,
                marginBottom: 20,
                alignItems: 'center'
            }}>
                <div style={{ position: 'relative', flex: 1, maxWidth: 400 }}>
                    <Search size={18} color="#94a3b8" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
                    <input
                        type="text"
                        placeholder="Search by ID, Product, or WO..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        style={{
                            width: '100%',
                            padding: '10px 12px 10px 40px',
                            border: '1px solid #e2e8f0',
                            borderRadius: 8,
                            fontSize: 14,
                            outline: 'none',
                            transition: 'border-color 0.2s'
                        }}
                        onFocus={e => e.currentTarget.style.borderColor = '#2563eb'}
                        onBlur={e => e.currentTarget.style.borderColor = '#e2e8f0'}
                    />
                </div>
                <button style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '10px 16px', borderRadius: 8, border: '1px solid #e2e8f0',
                    background: '#fff', color: '#334155', fontSize: 13, fontWeight: 600, cursor: 'pointer'
                }}>
                    <Filter size={16} /> Filter
                </button>
            </div>

            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' }}>
                {loading ? (
                    <div style={{ padding: 60, textAlign: 'center', color: '#64748b' }}>Loading records...</div>
                ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead>
                            <tr style={{ background: '#f8fafc', textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>
                                <th style={{ padding: '14px 20px', color: '#64748b', fontWeight: 600 }}>Date</th>
                                <th style={{ padding: '14px 20px', color: '#64748b', fontWeight: 600 }}>Failure No</th>
                                <th style={{ padding: '14px 20px', color: '#64748b', fontWeight: 600 }}>Work Order</th>
                                <th style={{ padding: '14px 20px', color: '#64748b', fontWeight: 600 }}>Product</th>
                                <th style={{ padding: '14px 20px', color: '#64748b', fontWeight: 600 }}>Failed Qty</th>
                                <th style={{ padding: '14px 20px', color: '#64748b', fontWeight: 600 }}>Stage</th>
                                <th style={{ padding: '14px 20px', color: '#64748b', fontWeight: 600 }}>Status</th>
                                <th style={{ padding: '14px 20px', textAlign: 'right' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredFailures.map((row) => {
                                const styles = getStatusStyles(row.status);
                                return (
                                    <tr key={row._id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                        <td style={{ padding: '14px 20px' }}>{format(new Date(row.date), 'dd/MM/yyyy')}</td>
                                        <td style={{ padding: '14px 20px', fontWeight: 700, color: '#1e293b' }}>{row.failureNo}</td>
                                        <td style={{ padding: '14px 20px', color: '#475569' }}>{row.workOrderNo || '—'}</td>
                                        <td style={{ padding: '14px 20px' }}>
                                            <div style={{ fontWeight: 600, color: '#1e293b' }}>{row.itemName}</div>
                                            <div style={{ fontSize: 11, color: '#94a3b8' }}>{row.itemCode}</div>
                                        </td>
                                        <td style={{ padding: '14px 20px', fontWeight: 600 }}>{row.qtyFailed}</td>
                                        <td style={{ padding: '14px 20px' }}>
                                            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: '#f1f5f9', color: '#475569', fontWeight: 500 }}>
                                                {row.stage}
                                            </span>
                                        </td>
                                        <td style={{ padding: '14px 20px' }}>
                                            <span style={{
                                                display: 'inline-block',
                                                padding: '4px 12px',
                                                borderRadius: 20,
                                                fontSize: 11,
                                                fontWeight: 700,
                                                background: styles.bg,
                                                color: styles.color
                                            }}>
                                                {row.status}
                                            </span>
                                        </td>
                                        <td style={{ padding: '14px 20px', textAlign: 'right' }}>
                                            <button
                                                onClick={() => navigate(PATHS.PRODUCTION.REWORK.FAILURE_DETAILS(row._id))}
                                                style={{
                                                    background: '#f8fafc', border: '1px solid #e2e8f0',
                                                    padding: 6, borderRadius: 6, cursor: 'pointer', color: '#64748b',
                                                    transition: 'all 0.2s'
                                                }}
                                                onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'}
                                                onMouseLeave={e => e.currentTarget.style.background = '#f8fafc'}
                                            >
                                                <Eye size={16} />
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                            {filteredFailures.length === 0 && (
                                <tr><td colSpan={8} style={{ padding: 60, textAlign: 'center', color: '#94a3b8' }}>No failure records matching your search</td></tr>
                            )}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
};

export default ProductionFailureListPage;
