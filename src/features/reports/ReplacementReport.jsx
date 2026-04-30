import React, { useState, useEffect } from 'react';
import moment from 'moment';
import { 
    Package, 
    Calendar, 
    Search, 
    Filter, 
    Download, 
    ArrowRight,
    RotateCcw,
    AlertCircle,
    FileText,
    User,
    ClipboardList,
    TrendingDown
} from 'lucide-react';
import { apiClient } from '@/lib/apiClient';
import { BrandedLoader } from '@/components/ui/BrandedLoading';
import { Button, Input, Select } from '@/components/ui';
import toast from 'react-hot-toast';

const ReplacementReport = () => {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [reportData, setReportData] = useState([]);
    const [filters, setFilters] = useState({
        fromDate: moment().startOf('month').format('YYYY-MM-DD'),
        toDate: moment().endOf('month').format('YYYY-MM-DD'),
        searchTerm: ''
    });

    const fetchReport = async () => {
        setLoading(true);
        try {
            const response = await apiClient.get('/accounting/reports/replacement-report', {
                params: {
                    fromDate: filters.fromDate,
                    toDate: filters.toDate
                }
            });
            setReportData(response.data.data || []);
            setError(null);
        } catch (error) {
            toast.error('Failed to load replacement report');
            setError(error);
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchReport();
    }, []);

    const handleFilterChange = (e) => {
        const { name, value } = e.target;
        setFilters(prev => ({ ...prev, [name]: value }));
    };

    const handleApplyFilters = () => {
        fetchReport(filters.fromDate, filters.toDate);
    };

    const filteredData = (reportData || []).filter(item => 
        !filters.searchTerm || 
        item.itemName?.toLowerCase().includes(filters.searchTerm.toLowerCase()) ||
        item.itemCode?.toLowerCase().includes(filters.searchTerm.toLowerCase()) ||
        item.customerName?.toLowerCase().includes(filters.searchTerm.toLowerCase()) ||
        item.invoiceNumber?.toLowerCase().includes(filters.searchTerm.toLowerCase())
    );

    const totals = filteredData.reduce((acc, item) => ({
        qty: acc.qty + (item.qty || 0),
        cost: acc.cost + (item.totalCost || 0)
    }), { qty: 0, cost: 0 });

    const formatCurrency = (val, dec = 0) => {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            maximumFractionDigits: dec
        }).format(val);
    };

    if (error) return (
        <div style={{ padding: '40px', textAlign: 'center', color: '#dc2626', background: '#fef2f2', margin: '20px', borderRadius: '12px' }}>
            <AlertCircle size={48} style={{ marginBottom: '16px' }} />
            <h3 style={{ fontSize: '18px', fontWeight: 700 }}>Error Loading Report</h3>
            <p>{error.message || 'Something went wrong while fetching data'}</p>
        </div>
    );

    return (
        <div style={{ padding: '24px', background: '#f8fafc', minHeight: '100vh' }}>
            {/* Header Area */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <div>
                    <h1 style={{ fontSize: '24px', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.025em', display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <RotateCcw size={28} color="#e11d48" />
                        Replacement Outward Report
                    </h1>
                    <p style={{ color: '#64748b', marginTop: '4px', fontWeight: 500 }}>Tracking warranty and service replacement cost impact</p>
                </div>
                <div style={{ display: 'flex', gap: '12px' }}>
                    <Button variant="outline" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Download size={18} />
                        Export Excel
                    </Button>
                </div>
            </div>

            {/* Filter Bar */}
            <div style={{ 
                background: '#ffffff', 
                padding: '20px', 
                borderRadius: '16px', 
                boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
                marginBottom: '24px',
                display: 'flex',
                flexWrap: 'wrap',
                gap: '16px',
                alignItems: 'flex-end',
                border: '1px solid #f1f5f9'
            }}>
                <div style={{ flex: 1, minWidth: '200px' }}>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px', textTransform: 'uppercase' }}>Search Replacement</label>
                    <div style={{ position: 'relative' }}>
                        <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                        <input 
                            type="text"
                            name="searchTerm"
                            value={filters.searchTerm}
                            onChange={handleFilterChange}
                            placeholder="Customer, Item, Invoice..."
                            style={{ 
                                width: '100%', 
                                padding: '10px 12px 10px 40px', 
                                borderRadius: '10px', 
                                border: '1px solid #e2e8f0',
                                fontSize: '14px',
                                outline: 'none',
                                transition: 'all 0.2s',
                                '&:focus': { borderColor: '#e11d48', boxShadow: '0 0 0 3px rgba(225, 29, 72, 0.1)' }
                            }}
                        />
                    </div>
                </div>

                <div style={{ width: '160px' }}>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px', textTransform: 'uppercase' }}>From Date</label>
                    <input 
                        type="date"
                        name="fromDate"
                        value={filters.fromDate}
                        onChange={handleFilterChange}
                        style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '14px' }}
                    />
                </div>

                <div style={{ width: '160px' }}>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px', textTransform: 'uppercase' }}>To Date</label>
                    <input 
                        type="date"
                        name="toDate"
                        value={filters.toDate}
                        onChange={handleFilterChange}
                        style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '14px' }}
                    />
                </div>

                <Button 
                    onClick={handleApplyFilters}
                    style={{ 
                        height: '42px', 
                        padding: '0 24px', 
                        borderRadius: '10px', 
                        background: '#e11d48',
                        color: 'white',
                        fontWeight: 700,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        boxShadow: '0 4px 12px rgba(225, 29, 72, 0.2)'
                    }}
                >
                    <Filter size={18} />
                    Fetch Data
                </Button>
            </div>

            {/* Summary Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '20px', marginBottom: '24px' }}>
                <div style={{ background: '#ffffff', padding: '20px', borderRadius: '16px', border: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: '#fff1f2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <RotateCcw size={24} color="#e11d48" />
                    </div>
                    <div>
                        <div style={{ fontSize: '12px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Total Replacements</div>
                        <div style={{ fontSize: '24px', fontWeight: 800, color: '#0f172a' }}>{filteredData.length} Entries</div>
                    </div>
                </div>

                <div style={{ background: '#ffffff', padding: '20px', borderRadius: '16px', border: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: '#fff1f2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Package size={24} color="#e11d48" />
                    </div>
                    <div>
                        <div style={{ fontSize: '12px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Total Qty Replaced</div>
                        <div style={{ fontSize: '24px', fontWeight: 800, color: '#0f172a' }}>{totals.qty} Units</div>
                    </div>
                </div>

                <div style={{ background: '#0f172a', padding: '20px', borderRadius: '16px', display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <TrendingDown size={24} color="#f43f5e" />
                    </div>
                    <div>
                        <div style={{ fontSize: '12px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>Total Cost Impact</div>
                        <div style={{ fontSize: '24px', fontWeight: 800, color: '#ffffff' }}>{formatCurrency(totals.cost)}</div>
                    </div>
                </div>
            </div>

            {/* Table Container */}
            <div style={{ 
                background: '#ffffff', 
                borderRadius: '16px', 
                border: '1px solid #f1f5f9',
                boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.1)',
                overflow: 'hidden'
            }}>
                {loading ? (
                    <div style={{ padding: '100px', textAlign: 'center' }}>
                        <BrandedLoader size={80} />
                        <p style={{ marginTop: '16px', color: '#64748b', fontWeight: 500 }}>Analyzing replacement data...</p>
                    </div>
                ) : filteredData.length === 0 ? (
                    <div style={{ padding: '100px', textAlign: 'center', color: '#64748b' }}>
                        <ClipboardList size={64} style={{ opacity: 0.2, marginBottom: '16px' }} />
                        <h3 style={{ fontSize: '18px', fontWeight: 700 }}>No Data Found</h3>
                        <p>Adjust your filters or try a different search term</p>
                    </div>
                ) : (
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                                    <th style={{ padding: '16px 12px', textAlign: 'left', fontSize: '10px', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>Date</th>
                                    <th style={{ padding: '16px 12px', textAlign: 'left', fontSize: '10px', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>Customer</th>
                                    <th style={{ padding: '16px 12px', textAlign: 'left', fontSize: '10px', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>Invoice / Ref</th>
                                    <th style={{ padding: '16px 12px', textAlign: 'left', fontSize: '10px', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>Item Details</th>
                                    <th style={{ padding: '16px 12px', textAlign: 'center', fontSize: '10px', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>Qty</th>
                                    <th style={{ padding: '16px 12px', textAlign: 'right', fontSize: '10px', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>Unit Cost</th>
                                    <th style={{ padding: '16px 12px', textAlign: 'right', fontSize: '10px', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>Total Cost</th>
                                    <th style={{ padding: '16px 12px', textAlign: 'left', fontSize: '10px', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>Reason / Remarks</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredData.map((item, idx) => (
                                    <tr key={idx} style={{ 
                                        borderBottom: idx === filteredData.length - 1 ? 'none' : '1px solid #f1f5f9',
                                        transition: 'background 0.2s',
                                        cursor: 'pointer'
                                    }} onMouseEnter={e => e.currentTarget.style.background = '#fff1f2'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                        <td style={{ padding: '14px 12px', fontSize: '12px', fontWeight: 600, color: '#1e293b' }}>
                                            {moment(item.date).format('DD-MMM-YYYY')}
                                        </td>
                                        <td style={{ padding: '14px 12px' }}>
                                            <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>{item.customerName}</div>
                                        </td>
                                        <td style={{ padding: '14px 12px' }}>
                                            <div style={{ fontSize: '12px', fontWeight: 600, color: '#1e293b' }}>{item.invoiceNumber}</div>
                                            {item.originalInvoice && <div style={{ fontSize: '10px', color: '#64748b' }}>Ref: {item.originalInvoice}</div>}
                                        </td>
                                        <td style={{ padding: '14px 12px' }}>
                                            <div style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b' }}>{item.itemName}</div>
                                            <div style={{ fontSize: '11px', color: '#64748b' }}>{item.itemCode}</div>
                                        </td>
                                        <td style={{ padding: '14px 12px', textAlign: 'center' }}>
                                            <div style={{ fontSize: '13px', fontWeight: 700, color: '#e11d48' }}>{item.qty} {item.uom}</div>
                                        </td>
                                        <td style={{ padding: '14px 12px', textAlign: 'right' }}>
                                            <div style={{ fontSize: '12px', color: '#475569' }}>{formatCurrency(item.unitCost, 1)}</div>
                                        </td>
                                        <td style={{ padding: '14px 12px', textAlign: 'right' }}>
                                            <div style={{ fontSize: '13px', fontWeight: 800, color: '#e11d48' }}>{formatCurrency(item.totalCost)}</div>
                                        </td>
                                        <td style={{ padding: '14px 12px' }}>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                                <span style={{ fontSize: '11px', fontWeight: 700, color: '#be123c', background: '#ffe4e6', padding: '1px 6px', borderRadius: '4px', width: 'fit-content' }}>
                                                    {item.reason}
                                                </span>
                                                <span style={{ fontSize: '11px', color: '#64748b', fontStyle: 'italic' }}>{item.remarks || 'No remarks'}</span>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ReplacementReport;
