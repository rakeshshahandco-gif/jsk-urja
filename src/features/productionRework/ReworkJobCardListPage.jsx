import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Plus, Eye, Wrench, Filter } from 'lucide-react';
import { PATHS } from '@/routes/paths';
import { getJobCards } from '@/services/productionReworkApi';
import { format } from 'date-fns';
import { Button } from '@/components/ui';

const ReworkJobCardListPage = () => {
    const navigate = useNavigate();
    const [jobCards, setJobCards] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        fetchJobCards();
    }, []);

    const fetchJobCards = async () => {
        try {
            setLoading(true);
            const data = await getJobCards();
            setJobCards(data);
        } catch (error) {
            console.error('Error fetching job cards:', error);
        } finally {
            setLoading(false);
        }
    };

    const filteredCards = jobCards.filter(jc =>
        jc.jobCardNo.toLowerCase().includes(searchTerm.toLowerCase()) ||
        jc.itemName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        jc.technicianName.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const getStatusStyles = (status) => {
        switch (status) {
            case 'Pending': return { bg: '#f1f5f9', color: '#64748b' };
            case 'In Progress': return { bg: '#eff6ff', color: '#2563eb' };
            case 'Repaired': return { bg: '#f0fdf4', color: '#16a34a' };
            case 'Internal Failure': return { bg: '#fef2f2', color: '#dc2626' };
            default: return { bg: '#f1f5f9', color: '#64748b' };
        }
    };

    return (
        <div style={{ padding: '24px 28px', background: '#f8f9fa', minHeight: '100vh' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                <div>
                    <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0, color: '#1e293b' }}>Rework Job Cards</h1>
                    <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: 13 }}>Technician assignments for failed products</p>
                </div>
                <button
                    onClick={() => navigate(PATHS.PRODUCTION.REWORK.NEW_JOB_CARD)}
                    style={{
                        background: '#d97706', color: '#fff', border: 'none',
                        borderRadius: 8, padding: '10px 20px', fontSize: 13, fontWeight: 700,
                        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                        boxShadow: '0 4px 12px rgba(217,119,6,0.2)',
                    }}
                >
                    <Plus size={18} /> New Job Card
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
                        placeholder="Search by ID, Product, or Technician..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        style={{
                            width: '100%',
                            padding: '10px 12px 10px 40px',
                            border: '1px solid #e2e8f0',
                            borderRadius: 8,
                            fontSize: 14,
                            outline: 'none'
                        }}
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
                    <div style={{ padding: 60, textAlign: 'center', color: '#64748b' }}>Loading record cards...</div>
                ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead>
                            <tr style={{ background: '#f8fafc', textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>
                                <th style={{ padding: '14px 20px', color: '#64748b', fontWeight: 600 }}>Date</th>
                                <th style={{ padding: '14px 20px', color: '#64748b', fontWeight: 600 }}>Job Card No</th>
                                <th style={{ padding: '14px 20px', color: '#64748b', fontWeight: 600 }}>Product</th>
                                <th style={{ padding: '14px 20px', color: '#64748b', fontWeight: 600 }}>Qty</th>
                                <th style={{ padding: '14px 20px', color: '#64748b', fontWeight: 600 }}>Technician</th>
                                <th style={{ padding: '14px 20px', color: '#64748b', fontWeight: 600 }}>Rework Type</th>
                                <th style={{ padding: '14px 20px', color: '#64748b', fontWeight: 600 }}>Status</th>
                                <th style={{ padding: '14px 20px', textAlign: 'right' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredCards.map((row) => {
                                const styles = getStatusStyles(row.status);
                                return (
                                    <tr key={row._id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                        <td style={{ padding: '14px 20px' }}>{format(new Date(row.date), 'dd/MM/yyyy')}</td>
                                        <td style={{ padding: '14px 20px', fontWeight: 700, color: '#1e293b' }}>{row.jobCardNo}</td>
                                        <td style={{ padding: '14px 20px' }}>
                                            <div style={{ fontWeight: 600, color: '#1e293b' }}>{row.itemName}</div>
                                            <div style={{ fontSize: 11, color: '#94a3b8' }}>{row.itemCode}</div>
                                        </td>
                                        <td style={{ padding: '14px 20px', fontWeight: 600 }}>{row.qtyToRepair}</td>
                                        <td style={{ padding: '14px 20px', color: '#475569' }}>{row.technicianName}</td>
                                        <td style={{ padding: '14px 20px' }}>
                                            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: '#f1f5f9', color: '#475569', fontWeight: 500 }}>
                                                {row.reworkType}
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
                                        <td style={{ padding: '14px 20px', textAlign: 'right', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                                            <button
                                                onClick={() => navigate(PATHS.PRODUCTION.REWORK.JOB_CARD_DETAILS(row._id))}
                                                style={{ background: '#f8fafc', border: '1px solid #e2e8f0', padding: 6, borderRadius: 6, cursor: 'pointer', color: '#64748b' }}
                                                title="View Details"
                                            >
                                                <Eye size={16} />
                                            </button>
                                            {row.status !== 'Repaired' && (
                                                <button
                                                    onClick={() => navigate(`${PATHS.PRODUCTION.REWORK.NEW_OUTPUT}?jobCardId=${row._id}`)}
                                                    style={{ background: '#f0fdf4', border: '1px solid #bcf0d0', padding: 6, borderRadius: 6, cursor: 'pointer', color: '#16a34a' }}
                                                    title="Record Output"
                                                >
                                                    <Wrench size={16} />
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                            {filteredCards.length === 0 && (
                                <tr><td colSpan={8} style={{ padding: 60, textAlign: 'center', color: '#94a3b8' }}>No job cards matching your search</td></tr>
                            )}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
};

export default ReworkJobCardListPage;
