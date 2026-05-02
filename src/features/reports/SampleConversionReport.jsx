import React, { useState, useEffect } from 'react';
import moment from 'moment';
import { 
    Package, 
    Calendar, 
    Search, 
    Filter, 
    Download, 
    ArrowRight,
    TrendingUp,
    CheckCircle2,
    XCircle,
    User,
    BarChart3,
    AlertCircle,
    Clock,
    ShoppingCart
} from 'lucide-react';
import { apiClient } from '@/lib/apiClient';
import { BrandedLoader } from '@/components/ui/BrandedLoading';
import { Button, Input, Select } from '@/components/ui';
import toast from 'react-hot-toast';

const SampleConversionReport = () => {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [reportData, setReportData] = useState([]);
    const [filters, setFilters] = useState({
        fromDate: moment().subtract(3, 'months').format('YYYY-MM-DD'),
        toDate: moment().endOf('month').format('YYYY-MM-DD'),
        searchTerm: ''
    });

    const fetchReport = async () => {
        setLoading(true);
        try {
            const response = await apiClient.get('/accounting/reports/sample-conversion-report', {
                params: {
                    fromDate: filters.fromDate,
                    toDate: filters.toDate
                }
            });
            setReportData(response.data.data || []);
            setError(null);
        } catch (error) {
            toast.error('Failed to load sample conversion report');
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
        item.customerName?.toLowerCase().includes(filters.searchTerm.toLowerCase())
    );

    const stats = filteredData.reduce((acc, item) => {
        const isConverted = item.converted === 'Yes';
        return {
            total: acc.total + 1,
            converted: acc.converted + (isConverted ? 1 : 0),
            sampleValue: acc.sampleValue + (item.sampleValue || 0),
            conversionValue: acc.conversionValue + (item.salesQty > 0 ? (item.salesQty * (item.sampleValue / item.sampleQty)) : 0) // rough estimate
        };
    }, { total: 0, converted: 0, sampleValue: 0, conversionValue: 0 });

    const conversionRate = stats.total > 0 ? (stats.converted / stats.total) * 100 : 0;

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
                        <BarChart3 size={28} color="#2563eb" />
                        Sample to Sales Conversion Report
                    </h1>
                    <p style={{ color: '#64748b', marginTop: '4px', fontWeight: 500 }}>Analyzing effectiveness of product sampling in generating revenue</p>
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
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px', textTransform: 'uppercase' }}>Search Sample Data</label>
                    <div style={{ position: 'relative' }}>
                        <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                        <input 
                            type="text"
                            name="searchTerm"
                            value={filters.searchTerm}
                            onChange={handleFilterChange}
                            placeholder="Customer or Item name..."
                            style={{ 
                                width: '100%', 
                                padding: '10px 12px 10px 40px', 
                                borderRadius: '10px', 
                                border: '1px solid #e2e8f0',
                                fontSize: '14px',
                                outline: 'none',
                                transition: 'all 0.2s'
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
                        background: '#2563eb',
                        color: 'white',
                        fontWeight: 700,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        boxShadow: '0 4px 12px rgba(37, 99, 235, 0.2)'
                    }}
                >
                    <Filter size={18} />
                    Apply Filters
                </Button>
            </div>

            {/* Stats Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px', marginBottom: '24px' }}>
                <div style={{ background: '#ffffff', padding: '20px', borderRadius: '16px', border: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Package size={24} color="#2563eb" />
                    </div>
                    <div>
                        <div style={{ fontSize: '12px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Total Samples</div>
                        <div style={{ fontSize: '24px', fontWeight: 800, color: '#0f172a' }}>{stats.total}</div>
                    </div>
                </div>

                <div style={{ background: '#ffffff', padding: '20px', borderRadius: '16px', border: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <CheckCircle2 size={24} color="#16a34a" />
                    </div>
                    <div>
                        <div style={{ fontSize: '12px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Converted</div>
                        <div style={{ fontSize: '24px', fontWeight: 800, color: '#16a34a' }}>{stats.converted}</div>
                    </div>
                </div>

                <div style={{ background: '#ffffff', padding: '20px', borderRadius: '16px', border: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: '#fefce8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <TrendingUp size={24} color="#ca8a04" />
                    </div>
                    <div>
                        <div style={{ fontSize: '12px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Conversion Rate</div>
                        <div style={{ fontSize: '24px', fontWeight: 800, color: '#0f172a' }}>{conversionRate.toFixed(1)}%</div>
                    </div>
                </div>

                <div style={{ background: '#0f172a', padding: '20px', borderRadius: '16px', display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <ShoppingCart size={24} color="#3b82f6" />
                    </div>
                    <div>
                        <div style={{ fontSize: '12px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>Total Sample Value</div>
                        <div style={{ fontSize: '24px', fontWeight: 800, color: '#ffffff' }}>{formatCurrency(stats.sampleValue)}</div>
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
                        <p style={{ marginTop: '16px', color: '#64748b', fontWeight: 500 }}>Analyzing conversion patterns...</p>
                    </div>
                ) : filteredData.length === 0 ? (
                    <div style={{ padding: '100px', textAlign: 'center', color: '#64748b' }}>
                        <AlertCircle size={64} style={{ opacity: 0.2, marginBottom: '16px' }} />
                        <h3 style={{ fontSize: '18px', fontWeight: 700 }}>No Data Found</h3>
                        <p>Adjust your filters or try a different search term</p>
                    </div>
                ) : (
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                                    <th style={{ padding: '16px 12px', textAlign: 'left', fontSize: '10px', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>Sample Date</th>
                                    <th style={{ padding: '16px 12px', textAlign: 'left', fontSize: '10px', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>Customer</th>
                                    <th style={{ padding: '16px 12px', textAlign: 'left', fontSize: '10px', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>Item Details</th>
                                    <th style={{ padding: '16px 12px', textAlign: 'center', fontSize: '10px', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>Sample Qty</th>
                                    <th style={{ padding: '16px 12px', textAlign: 'center', fontSize: '10px', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>Converted</th>
                                    <th style={{ padding: '16px 12px', textAlign: 'left', fontSize: '10px', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>Sales Info</th>
                                    <th style={{ padding: '16px 12px', textAlign: 'center', fontSize: '10px', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>Time Taken</th>
                                    <th style={{ padding: '16px 12px', textAlign: 'left', fontSize: '10px', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>Salesperson</th>
                                    <th style={{ padding: '16px 12px', textAlign: 'left', fontSize: '10px', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>Reason</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredData.map((item, idx) => (
                                    <tr key={idx} style={{ 
                                        borderBottom: idx === filteredData.length - 1 ? 'none' : '1px solid #f1f5f9',
                                        transition: 'background 0.2s',
                                        cursor: 'pointer'
                                    }} onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                        <td style={{ padding: '14px 12px', fontSize: '12px', fontWeight: 600, color: '#1e293b' }}>
                                            {moment(item.sampleDate).format('DD-MMM-YY')}
                                        </td>
                                        <td style={{ padding: '14px 12px' }}>
                                            <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>{item.customerName}</div>
                                        </td>
                                        <td style={{ padding: '14px 12px' }}>
                                            <div style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b' }}>{item.itemName}</div>
                                            <div style={{ fontSize: '11px', color: '#64748b' }}>{item.itemCode}</div>
                                        </td>
                                        <td style={{ padding: '14px 12px', textAlign: 'center' }}>
                                            <div style={{ fontSize: '13px', fontWeight: 700, color: '#2563eb' }}>{item.sampleQty} NOS</div>
                                            <div style={{ fontSize: '10px', color: '#64748b' }}>{formatCurrency(item.sampleValue)}</div>
                                        </td>
                                        <td style={{ padding: '14px 12px', textAlign: 'center' }}>
                                            {item.converted === 'Yes' ? (
                                                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#16a34a', fontWeight: 800, background: '#f0fdf4', padding: '2px 8px', borderRadius: '12px', fontSize: '10px' }}>
                                                    <CheckCircle2 size={12} /> CONVERTED
                                                </div>
                                            ) : (
                                                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#94a3b8', fontWeight: 700, background: '#f8fafc', padding: '2px 8px', borderRadius: '12px', fontSize: '10px' }}>
                                                    <Clock size={12} /> PENDING
                                                </div>
                                            )}
                                        </td>
                                        <td style={{ padding: '14px 12px' }}>
                                            {item.converted === 'Yes' ? (
                                                <div>
                                                    <div style={{ fontSize: '12px', fontWeight: 700, color: '#16a34a' }}>Sales Qty: {item.salesQty}</div>
                                                    <div style={{ fontSize: '10px', color: '#64748b' }}>On {moment(item.conversionDate).format('DD-MMM-YY')}</div>
                                                </div>
                                            ) : '-'}
                                        </td>
                                        <td style={{ padding: '14px 12px', textAlign: 'center' }}>
                                            {item.converted === 'Yes' ? (
                                                <div style={{ fontSize: '12px', fontWeight: 600, color: '#475569' }}>
                                                    {item.daysToConvert} Days
                                                </div>
                                            ) : '-'}
                                        </td>
                                        <td style={{ padding: '14px 12px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#475569' }}>
                                                <User size={14} color="#94a3b8" />
                                                {item.salesperson}
                                            </div>
                                        </td>
                                        <td style={{ padding: '14px 12px' }}>
                                            <div style={{ fontSize: '12px', color: '#64748b' }}>{item.reason || '—'}</div>
                                            {item.matter && <div style={{ fontSize: '10px', color: '#94a3b8', fontStyle: 'italic' }}>{item.matter}</div>}
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

export default SampleConversionReport;
