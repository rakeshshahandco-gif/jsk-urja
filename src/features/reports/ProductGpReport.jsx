import React, { useState, useEffect } from 'react';
import { Download, Printer, Search, TrendingUp, TrendingDown, Package, IndianRupee, Info } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { Button, BrandedLoader } from '@/components/ui';
import { apiClient } from '@/lib/apiClient';
import moment from 'moment';

const ProductGpReport = () => {
    const [reportData, setReportData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedItem, setSelectedItem] = useState(null); // For drill-down
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

    const formatCurrency = (val, dec = 0) => {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            maximumFractionDigits: dec
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
                    <div style={{ fontSize: '13px', color: '#64748b', marginTop: '4px' }}>Estimated Cost Breakdown</div>
                </div>

                <div style={{ background: totals.profit >= 0 ? 'linear-gradient(135deg, #059669, #047857)' : 'linear-gradient(135deg, #dc2626, #991b1b)', padding: '20px', borderRadius: '20px', color: '#fff', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.2)' }}>
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

            {/* Info Note */}
            <div style={{ background: '#eff6ff', padding: '10px 20px', borderRadius: '12px', border: '1px solid #dbeafe', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Info size={16} style={{ color: '#3b82f6' }} />
                <span style={{ fontSize: '13px', color: '#1e40af', fontWeight: 500 }}>
                    If BOM is not available, valuation rate from Item Master is used for estimated cost.
                </span>
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
                                    <th style={{ padding: '16px 20px', textAlign: 'left', fontSize: '11px', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>Product Details</th>
                                    <th style={{ padding: '16px 20px', textAlign: 'center', fontSize: '11px', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>Qty Sold</th>
                                    <th style={{ padding: '16px 20px', textAlign: 'right', fontSize: '11px', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>Avg Rate</th>
                                    <th style={{ padding: '16px 20px', textAlign: 'right', fontSize: '11px', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>Sales Value</th>
                                    <th style={{ padding: '16px 20px', textAlign: 'right', fontSize: '11px', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>Cost/Unit</th>
                                    <th style={{ padding: '16px 20px', textAlign: 'left', fontSize: '11px', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>Cost Source</th>
                                    <th style={{ padding: '16px 20px', textAlign: 'right', fontSize: '11px', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>Est. Cost</th>
                                    <th style={{ padding: '16px 20px', textAlign: 'right', fontSize: '11px', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>Gross Profit</th>
                                    <th style={{ padding: '16px 20px', textAlign: 'center', fontSize: '11px', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>Margin %</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredData.length === 0 ? (
                                    <tr><td colSpan="8" style={{ padding: '60px', textAlign: 'center', color: '#94a3b8', fontSize: '15px' }}>No sales data found for the selected period.</td></tr>
                                ) : filteredData.map((item, idx) => (
                                    <tr key={idx} 
                                        style={{ borderBottom: '1px solid #f1f5f9', transition: 'background 0.2s', cursor: 'pointer' }} 
                                        onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'} 
                                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                        onClick={() => setSelectedItem(item)}
                                    >
                                        <td style={{ padding: '14px 20px' }}>
                                            <div style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b' }}>{item.itemName}</div>
                                            <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>{item.itemCode}</div>
                                        </td>
                                        <td style={{ padding: '14px 20px', textAlign: 'center' }}>
                                            <div style={{ fontSize: '13px', fontWeight: 600, color: '#1e293b' }}>{item.totalQty} {item.uom}</div>
                                        </td>
                                        <td style={{ padding: '14px 20px', textAlign: 'right' }}>
                                            <div style={{ fontSize: '13px', fontWeight: 600, color: '#475569' }}>{formatCurrency(item.avgRate, 2)}</div>
                                        </td>
                                        <td style={{ padding: '14px 20px', textAlign: 'right' }}>
                                            <div style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b' }}>{formatCurrency(item.totalRevenue)}</div>
                                        </td>
                                        <td style={{ padding: '14px 20px', textAlign: 'right' }}>
                                            <div style={{ fontSize: '13px', fontWeight: 600, color: item.costSource === 'Cost Missing' ? '#dc2626' : '#475569' }}>
                                                {formatCurrency(item.unitCost, 2)}
                                            </div>
                                        </td>
                                        <td style={{ padding: '14px 20px' }}>
                                            <span style={{ 
                                                fontSize: '10px', 
                                                fontWeight: 700, 
                                                padding: '4px 8px', 
                                                borderRadius: '6px',
                                                textTransform: 'uppercase',
                                                letterSpacing: '0.02em',
                                                background: item.costSource === 'BOM Final Cost' ? '#f0fdf4' : 
                                                            item.costSource === 'Item Valuation Rate' ? '#fffbeb' : 
                                                            item.costSource === 'Cost Missing' ? '#fef2f2' : '#eff6ff',
                                                color: item.costSource === 'BOM Final Cost' ? '#16a34a' : 
                                                       item.costSource === 'Item Valuation Rate' ? '#d97706' : 
                                                       item.costSource === 'Cost Missing' ? '#dc2626' : '#3b82f6',
                                                border: `1px solid ${
                                                    item.costSource === 'BOM Final Cost' ? '#dcfce7' : 
                                                    item.costSource === 'Item Valuation Rate' ? '#fef3c7' : 
                                                    item.costSource === 'Cost Missing' ? '#fee2e2' : '#dbeafe'
                                                }`
                                            }}>
                                                {item.costSource}
                                            </span>
                                        </td>
                                        <td style={{ padding: '14px 20px', textAlign: 'right' }}>
                                            <div style={{ fontSize: '13px', fontWeight: 600, color: '#475569' }}>{formatCurrency(item.totalCost)}</div>
                                        </td>
                                        <td style={{ padding: '14px 20px', textAlign: 'right' }}>
                                            <div style={{ fontSize: '14px', fontWeight: 800, color: item.grossProfit >= 0 ? '#059669' : '#dc2626' }}>
                                                {formatCurrency(item.grossProfit)}
                                            </div>
                                        </td>
                                        <td style={{ padding: '14px 20px', textAlign: 'center' }}>
                                            <div style={{ 
                                                display: 'inline-flex', 
                                                alignItems: 'center', 
                                                gap: '4px',
                                                padding: '3px 10px', 
                                                borderRadius: '20px', 
                                                fontSize: '12px', 
                                                fontWeight: 700,
                                                background: item.gpPercent >= 20 ? '#d1fae5' : (item.gpPercent >= 0 ? '#ffedd5' : '#fee2e2'),
                                                color: item.gpPercent >= 20 ? '#065f46' : (item.gpPercent >= 0 ? '#9a3412' : '#991b1b')
                                            }}>
                                                {item.gpPercent >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
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

            {/* Drill-down Modal */}
            {selectedItem && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15, 23, 42, 0.75)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }} onClick={() => setSelectedItem(null)}>
                    <div style={{ background: '#fff', width: '100%', maxWidth: '800px', borderRadius: '24px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)', overflow: 'hidden', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
                        {/* Modal Header */}
                        <div style={{ padding: '24px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 800, color: '#0f172a' }}>{selectedItem.itemName}</h2>
                                <p style={{ margin: '2px 0 0', fontSize: '13px', color: '#64748b' }}>{selectedItem.itemCode} • Profitability Analysis Details</p>
                            </div>
                            <button onClick={() => setSelectedItem(null)} style={{ width: '32px', height: '32px', borderRadius: '50%', border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontSize: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>×</button>
                        </div>

                        {/* Modal Content */}
                        <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
                            {/* Summary row */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '24px' }}>
                                <div style={{ background: '#f1f5f9', padding: '16px', borderRadius: '16px' }}>
                                    <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Formula Used</div>
                                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#1e293b', marginTop: '4px' }}>{selectedItem.formula}</div>
                                </div>
                                <div style={{ background: '#f1f5f9', padding: '16px', borderRadius: '16px' }}>
                                    <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Cost Source</div>
                                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#1e293b', marginTop: '4px' }}>{selectedItem.costSource}</div>
                                </div>
                                <div style={{ background: selectedItem.grossProfit >= 0 ? '#d1fae5' : '#fee2e2', padding: '16px', borderRadius: '16px' }}>
                                    <div style={{ fontSize: '11px', fontWeight: 700, color: selectedItem.grossProfit >= 0 ? '#065f46' : '#991b1b', textTransform: 'uppercase' }}>Result</div>
                                    <div style={{ fontSize: '13px', fontWeight: 800, color: selectedItem.grossProfit >= 0 ? '#047857' : '#dc2626', marginTop: '4px' }}>
                                        {selectedItem.grossProfit >= 0 ? 'Profitable' : 'Loss-making'} ({selectedItem.gpPercent.toFixed(1)}%)
                                    </div>
                                </div>
                            </div>

                            {/* Cost Breakdown */}
                            <div style={{ marginBottom: '24px' }}>
                                <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <Package size={16} /> Cost Breakdown (Per Unit)
                                </h3>
                                {selectedItem.costSource === 'BOM Final Cost' ? (
                                    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '16px' }}>
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                                                <span style={{ color: '#64748b' }}>Raw Material:</span>
                                                <span style={{ fontWeight: 600 }}>{formatCurrency(selectedItem.costDetails.rawMaterialCost, 2)}</span>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                                                <span style={{ color: '#64748b' }}>Component Labour:</span>
                                                <span style={{ fontWeight: 600 }}>{formatCurrency(selectedItem.costDetails.pointsLabourCost, 2)}</span>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                                                <span style={{ color: '#64748b' }}>Process Cost:</span>
                                                <span style={{ fontWeight: 600 }}>{formatCurrency(selectedItem.costDetails.processCost, 2)}</span>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                                                <span style={{ color: '#64748b' }}>Overhead Cost:</span>
                                                <span style={{ fontWeight: 600 }}>{formatCurrency(selectedItem.costDetails.overheadCost, 2)}</span>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                                                <span style={{ color: '#64748b' }}>Other Labour:</span>
                                                <span style={{ fontWeight: 600 }}>{formatCurrency(selectedItem.costDetails.labourCost, 2)}</span>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', borderTop: '1px dashed #cbd5e1', paddingTop: '8px', gridColumn: 'span 2' }}>
                                                <span style={{ fontWeight: 700, color: '#1e293b' }}>Final BOM Cost:</span>
                                                <span style={{ fontWeight: 800, color: '#2563eb' }}>{formatCurrency(selectedItem.unitCost, 2)}</span>
                                            </div>
                                        </div>
                                    </div>
                                ) : selectedItem.costSource === 'Manual BOM Cost' ? (
                                    <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '16px', padding: '20px', textAlign: 'center' }}>
                                        <p style={{ margin: 0, fontSize: '13px', color: '#1e40af' }}>Manual cost override active for this item.</p>
                                        <p style={{ margin: '4px 0 0', fontSize: '24px', fontWeight: 800, color: '#1e3a8a' }}>{formatCurrency(selectedItem.unitCost, 2)}</p>
                                    </div>
                                ) : (
                                    <div style={{ background: '#fef2f2', border: '1px solid #fecdd3', borderRadius: '16px', padding: '20px', textAlign: 'center' }}>
                                        <p style={{ margin: 0, fontSize: '13px', color: '#991b1b', fontWeight: 600 }}>COST DATA MISSING</p>
                                        <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#b91c1c' }}>Please configure a BOM or set a Manual Cost in Item Master.</p>
                                    </div>
                                )}
                            </div>

                            {/* Sales Invoices List */}
                            <div>
                                <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <Search size={16} /> Sales Invoices Included
                                </h3>
                                <div style={{ border: '1px solid #e2e8f0', borderRadius: '16px', overflow: 'hidden' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                                        <thead>
                                            <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                                                <th style={{ padding: '10px 12px', textAlign: 'left' }}>Invoice #</th>
                                                <th style={{ padding: '10px 12px', textAlign: 'left' }}>Date</th>
                                                <th style={{ padding: '10px 12px', textAlign: 'left' }}>Customer</th>
                                                <th style={{ padding: '10px 12px', textAlign: 'center' }}>Qty</th>
                                                <th style={{ padding: '10px 12px', textAlign: 'right' }}>Value</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {selectedItem.invoices?.map((inv, i) => (
                                                <tr key={i} style={{ borderBottom: i === selectedItem.invoices.length - 1 ? 'none' : '1px solid #f1f5f9' }}>
                                                    <td style={{ padding: '10px 12px', fontWeight: 600 }}>{inv.invoiceNumber}</td>
                                                    <td style={{ padding: '10px 12px' }}>{moment(inv.invoiceDate).format('DD-MMM-YY')}</td>
                                                    <td style={{ padding: '10px 12px' }}>{inv.customerName}</td>
                                                    <td style={{ padding: '10px 12px', textAlign: 'center' }}>{inv.qty}</td>
                                                    <td style={{ padding: '10px 12px', textAlign: 'right' }}>{formatCurrency(inv.taxableAmount)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                        <tfoot>
                                            <tr style={{ background: '#f8fafc', borderTop: '2px solid #e2e8f0', fontWeight: 800 }}>
                                                <td colSpan="3" style={{ padding: '10px 12px', textAlign: 'right' }}>TOTAL:</td>
                                                <td style={{ padding: '10px 12px', textAlign: 'center' }}>{selectedItem.totalQty}</td>
                                                <td style={{ padding: '10px 12px', textAlign: 'right' }}>{formatCurrency(selectedItem.totalRevenue)}</td>
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>
                            </div>
                        </div>

                        {/* Modal Footer */}
                        <div style={{ padding: '16px 24px', borderTop: '1px solid #e2e8f0', textAlign: 'right' }}>
                            <Button variant="primary" size="sm" onClick={() => setSelectedItem(null)} style={{ borderRadius: '10px' }}>Close Analysis</Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ProductGpReport;
