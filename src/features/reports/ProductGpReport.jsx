import React, { useState, useEffect } from 'react';
import { Download, Printer, Search, TrendingUp, TrendingDown, Package, IndianRupee, Info } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { Button, BrandedLoader } from '@/components/ui';
import { apiClient } from '@/lib/apiClient';
import moment from 'moment';

const ProductGpReport = () => {
    const [reportData, setReportData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filters, setFilters] = useState({
        startDate: moment().startOf('month').format('YYYY-MM-DD'),
        endDate: moment().endOf('month').format('YYYY-MM-DD'),
        searchTerm: ''
    });

    const fetchReport = async () => {
        setLoading(true);
        try {
            const response = await apiClient.get('/accounting/reports/product-profitability', {
                params: {
                    startDate: filters.startDate,
                    endDate: filters.endDate
                }
            });
            setReportData(response.data.data || []);
        } catch (error) {
            toast.error('Failed to load profitability report');
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchReport();
    }, [filters.startDate, filters.endDate]);

    const filteredData = reportData.filter(item => 
        !filters.searchTerm || 
        item.itemName?.toLowerCase().includes(filters.searchTerm.toLowerCase()) ||
        item.itemCode?.toLowerCase().includes(filters.searchTerm.toLowerCase())
    );

    const totals = filteredData.reduce((acc, item) => ({
        revenue: acc.revenue + item.totalRevenue,
        cost: acc.cost + item.totalCost,
        profit: acc.profit + item.grossProfit
    }), { revenue: 0, cost: 0, profit: 0 });

    const totalGpPercent = totals.revenue > 0 ? (totals.profit / totals.revenue) * 100 : 0;

    const formatCurrency = (val) => {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            maximumFractionDigits: 0
        }).format(val);
    };

    return (
        <div style={{ padding: '24px', background: '#f1f5f9', minHeight: '100vh', fontFamily: "'Outfit', sans-serif" }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
                <div>
                    <h1 style={{ margin: 0, fontSize: '28px', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.5px' }}>Product-wise Gross Profit</h1>
                    <p style={{ margin: '4px 0 0', fontSize: '14px', color: '#64748b' }}>Item-level profitability analysis based on sales vs production/purchase cost</p>
                </div>
                <div style={{ display: 'flex', gap: '12px' }}>
                    <Button variant="outline" size="sm" onClick={() => window.print()} style={{ borderRadius: '10px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
                        <Printer size={16} className="mr-2" /> Print
                    </Button>
                    <Button variant="primary" size="sm" style={{ borderRadius: '10px', boxShadow: '0 4px 6px -1px rgba(59, 130, 246, 0.4)' }}>
                        <Download size={16} className="mr-2" /> Export
                    </Button>
                </div>
            </div>

            {/* Summary Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '20px', marginBottom: '24px' }}>
                <div style={{ background: '#ffffff', padding: '20px', borderRadius: '20px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                        <div style={{ padding: '8px', background: '#eff6ff', borderRadius: '12px', color: '#3b82f6' }}><TrendingUp size={20} /></div>
                        <div style={{ fontSize: '12px', fontWeight: 700, color: '#3b82f6', background: '#dbeafe', padding: '4px 10px', borderRadius: '20px' }}>Revenue</div>
                    </div>
                    <div style={{ fontSize: '26px', fontWeight: 900, color: '#1e293b' }}>{formatCurrency(totals.revenue)}</div>
                    <div style={{ fontSize: '13px', color: '#64748b', marginTop: '4px' }}>Total Sales (Taxable)</div>
                </div>

                <div style={{ background: '#ffffff', padding: '20px', borderRadius: '20px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                        <div style={{ padding: '8px', background: '#fef2f2', borderRadius: '12px', color: '#ef4444' }}><Package size={20} /></div>
                        <div style={{ fontSize: '12px', fontWeight: 700, color: '#ef4444', background: '#fee2e2', padding: '4px 10px', borderRadius: '20px' }}>Total Cost</div>
                    </div>
                    <div style={{ fontSize: '26px', fontWeight: 900, color: '#1e293b' }}>{formatCurrency(totals.cost)}</div>
                    <div style={{ fontSize: '13px', color: '#64748b', marginTop: '4px' }}>BOM / Valuation Cost</div>
                </div>

                <div style={{ background: 'linear-gradient(135deg, #059669, #047857)', padding: '20px', borderRadius: '20px', color: '#fff', boxShadow: '0 10px 15px -3px rgba(5, 150, 105, 0.3)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                        <div style={{ padding: '8px', background: 'rgba(255,255,255,0.2)', borderRadius: '12px' }}><IndianRupee size={20} /></div>
                        <div style={{ fontSize: '12px', fontWeight: 700, background: 'rgba(255,255,255,0.2)', padding: '4px 10px', borderRadius: '20px' }}>Gross Profit</div>
                    </div>
                    <div style={{ fontSize: '26px', fontWeight: 900 }}>{formatCurrency(totals.profit)}</div>
                    <div style={{ fontSize: '13px', opacity: 0.9, marginTop: '4px' }}>Overall Margin: {totalGpPercent.toFixed(1)}%</div>
                </div>
            </div>

            {/* Filters */}
            <div style={{ background: '#ffffff', borderRadius: '20px', padding: '20px', border: '1px solid #e2e8f0', marginBottom: '24px', display: 'flex', gap: '20px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <div style={{ flex: 1, minWidth: '250px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '8px', display: 'block' }}>Search Product</label>
                    <div style={{ position: 'relative' }}>
                        <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                        <input 
                            type="text"
                            placeholder="Item Name or Code..."
                            value={filters.searchTerm}
                            onChange={e => setFilters(f => ({ ...f, searchTerm: e.target.value }))}
                            style={{ width: '100%', padding: '10px 10px 10px 38px', borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '14px', outline: 'none', transition: 'border-color 0.2s' }}
                            onFocus={e => e.target.style.borderColor = '#3b82f6'}
                            onBlur={e => e.target.style.borderColor = '#e2e8f0'}
                        />
                    </div>
                </div>
                <div style={{ minWidth: '320px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '8px', display: 'block' }}>Date Range</label>
                    <div style={{ display: 'flex', gap: '10px' }}>
                        <input 
                            type="date"
                            value={filters.startDate}
                            onChange={e => setFilters(f => ({ ...f, startDate: e.target.value }))}
                            style={{ padding: '10px', borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '14px' }}
                        />
                        <input 
                            type="date"
                            value={filters.endDate}
                            onChange={e => setFilters(f => ({ ...f, endDate: e.target.value }))}
                            style={{ padding: '10px', borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '14px' }}
                        />
                    </div>
                </div>
                <Button variant="outline" onClick={fetchReport} style={{ borderRadius: '12px', padding: '10px 20px' }}>Apply Filters</Button>
            </div>

            {/* Table */}
            <div style={{ background: '#ffffff', borderRadius: '24px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.05)' }}>
                {loading ? (
                    <div style={{ padding: '80px', display: 'flex', justifyContent: 'center' }}><BrandedLoader /></div>
                ) : (
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                                    <th style={{ padding: '16px 20px', textAlign: 'left', fontSize: '12px', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>Product Details</th>
                                    <th style={{ padding: '16px 20px', textAlign: 'center', fontSize: '12px', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>Qty Sold</th>
                                    <th style={{ padding: '16px 20px', textAlign: 'right', fontSize: '12px', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>Sales Value</th>
                                    <th style={{ padding: '16px 20px', textAlign: 'right', fontSize: '12px', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>Est. Cost</th>
                                    <th style={{ padding: '16px 20px', textAlign: 'right', fontSize: '12px', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>Gross Profit</th>
                                    <th style={{ padding: '16px 20px', textAlign: 'center', fontSize: '12px', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>Margin</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredData.length === 0 ? (
                                    <tr><td colSpan="6" style={{ padding: '60px', textAlign: 'center', color: '#94a3b8', fontSize: '15px' }}>No sales data found for the selected period.</td></tr>
                                ) : filteredData.map((item, idx) => (
                                    <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9', transition: 'background 0.2s' }} onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                        <td style={{ padding: '18px 20px' }}>
                                            <div style={{ fontSize: '14px', fontWeight: 700, color: '#1e293b' }}>{item.itemName}</div>
                                            <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>{item.itemCode}</div>
                                        </td>
                                        <td style={{ padding: '18px 20px', textAlign: 'center' }}>
                                            <div style={{ fontSize: '14px', fontWeight: 600, color: '#1e293b' }}>{item.totalQty} {item.uom}</div>
                                            <div style={{ fontSize: '11px', color: '#94a3b8' }}>Avg Rate: {formatCurrency(item.avgRate)}</div>
                                        </td>
                                        <td style={{ padding: '18px 20px', textAlign: 'right' }}>
                                            <div style={{ fontSize: '14px', fontWeight: 700, color: '#1e293b' }}>{formatCurrency(item.totalRevenue)}</div>
                                        </td>
                                        <td style={{ padding: '18px 20px', textAlign: 'right' }}>
                                            <div style={{ fontSize: '14px', fontWeight: 600, color: '#475569' }}>{formatCurrency(item.totalCost)}</div>
                                            <div style={{ fontSize: '10px', color: '#94a3b8', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
                                                <Info size={10} /> {item.costSource}
                                            </div>
                                        </td>
                                        <td style={{ padding: '18px 20px', textAlign: 'right' }}>
                                            <div style={{ fontSize: '15px', fontWeight: 800, color: item.grossProfit >= 0 ? '#059669' : '#dc2626' }}>
                                                {formatCurrency(item.grossProfit)}
                                            </div>
                                        </td>
                                        <td style={{ padding: '18px 20px', textAlign: 'center' }}>
                                            <div style={{ 
                                                display: 'inline-flex', 
                                                alignItems: 'center', 
                                                gap: '4px',
                                                padding: '4px 12px', 
                                                borderRadius: '20px', 
                                                fontSize: '13px', 
                                                fontWeight: 700,
                                                background: item.gpPercent >= 20 ? '#d1fae5' : (item.gpPercent >= 0 ? '#ffedd5' : '#fee2e2'),
                                                color: item.gpPercent >= 20 ? '#065f46' : (item.gpPercent >= 0 ? '#9a3412' : '#991b1b')
                                            }}>
                                                {item.gpPercent >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                                                {item.gpPercent.toFixed(1)}%
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

export default ProductGpReport;
