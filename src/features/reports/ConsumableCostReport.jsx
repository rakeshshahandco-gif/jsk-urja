import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, Printer, Filter, Search, Tag, Box, ShoppingCart } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { Button, BrandedLoader } from '@/components/ui';
import * as purchaseApi from '@/services/purchaseApi';
import moment from 'moment';

const ConsumableCostReport = () => {
    const [reportData, setReportData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filters, setFilters] = useState({
        startDate: moment().startOf('month').format('YYYY-MM-DD'),
        endDate: moment().endOf('month').format('YYYY-MM-DD'),
        allocationType: 'All',
        searchTerm: ''
    });

    const fetchReport = async () => {
        setLoading(true);
        try {
            // Reusing purchase register but filtering for consumables
            // In a real scenario, I'd add a specific endpoint, but let's assume register has the flag
            const data = await purchaseApi.getPurchaseInvoices({ 
                limit: 1000, 
                startDate: filters.startDate, 
                endDate: filters.endDate,
                isConsumable: true 
            });
            
            // Flatten items for the report
            const flatItems = [];
            if (data && data.invoices) {
                data.invoices.forEach(inv => {
                    inv.items.forEach(item => {
                    if (item.isConsumable) {
                        flatItems.push({
                            ...item,
                            invoiceNumber: inv.invoiceNumber,
                            invoiceDate: inv.invoiceDate,
                            supplierName: inv.supplierName,
                            piId: inv._id
                        });
                    }
                });
            });

            setReportData(flatItems);
        } catch (error) {
            toast.error('Failed to load consumable cost report');
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchReport();
    }, [filters.startDate, filters.endDate]);

    const filteredData = reportData.filter(item => {
        const matchesType = filters.allocationType === 'All' || item.allocation?.type === filters.allocationType;
        const matchesSearch = !filters.searchTerm || 
            item.itemName.toLowerCase().includes(filters.searchTerm.toLowerCase()) ||
            item.supplierName.toLowerCase().includes(filters.searchTerm.toLowerCase()) ||
            item.allocation?.referenceName?.toLowerCase().includes(filters.searchTerm.toLowerCase());
        return matchesType && matchesSearch;
    });

    const totalCost = filteredData.reduce((sum, item) => sum + (item.taxableAmount || 0), 0);

    const formatAmount = (amount) => {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            minimumFractionDigits: 2
        }).format(amount);
    };

    return (
        <div style={{ padding: '24px', background: '#f8f9fa', minHeight: '100vh', fontFamily: "'Inter', sans-serif" }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <div>
                    <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 800, color: '#1e293b' }}>Consumable Cost Report</h1>
                    <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#64748b' }}>Detailed tracking of non-stock / immediate expense purchases</p>
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                    <Button variant="outline" size="sm" onClick={() => window.print()}>
                        <Printer size={16} className="mr-2" /> Print
                    </Button>
                    <Button variant="primary" size="sm">
                        <Download size={16} className="mr-2" /> Export
                    </Button>
                </div>
            </div>

            <div style={{ background: '#ffffff', borderRadius: '14px', padding: '20px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', marginBottom: '24px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px' }}>
                    <div>
                        <label style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>Period</label>
                        <div style={{ display: 'flex', gap: '10px' }}>
                            <input 
                                type="date" 
                                value={filters.startDate} 
                                onChange={e => setFilters(f => ({ ...f, startDate: e.target.value }))}
                                style={{ padding: '8px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', width: '100%' }}
                            />
                            <input 
                                type="date" 
                                value={filters.endDate} 
                                onChange={e => setFilters(f => ({ ...f, endDate: e.target.value }))}
                                style={{ padding: '8px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', width: '100%' }}
                            />
                        </div>
                    </div>
                    <div>
                        <label style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>Allocation Type</label>
                        <select 
                            value={filters.allocationType}
                            onChange={e => setFilters(f => ({ ...f, allocationType: e.target.value }))}
                            style={{ padding: '8px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', width: '100%' }}
                        >
                            <option value="All">All Types</option>
                            <option value="General">General</option>
                            <option value="Product">Product</option>
                            <option value="Sales Order">Sales Order</option>
                            <option value="Work Order">Work Order</option>
                            <option value="Department">Department</option>
                        </select>
                    </div>
                    <div>
                        <label style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>Search</label>
                        <div style={{ position: 'relative' }}>
                            <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                            <input 
                                type="text" 
                                placeholder="Item, Supplier or Ref..."
                                value={filters.searchTerm}
                                onChange={e => setFilters(f => ({ ...f, searchTerm: e.target.value }))}
                                style={{ padding: '8px 8px 8px 32px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', width: '100%' }}
                            />
                        </div>
                    </div>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px', marginBottom: '24px' }}>
                <div style={{ background: 'linear-gradient(135deg, #4f46e5, #3730a3)', padding: '20px', borderRadius: '16px', color: '#fff', boxShadow: '0 10px 15px -3px rgba(79, 70, 229, 0.3)' }}>
                    <div style={{ fontSize: '12px', fontWeight: 600, opacity: 0.8, textTransform: 'uppercase', marginBottom: '8px' }}>Total Consumable Cost</div>
                    <div style={{ fontSize: '28px', fontWeight: 900 }}>{formatAmount(totalCost)}</div>
                    <div style={{ marginTop: '12px', fontSize: '11px', background: 'rgba(255,255,255,0.1)', padding: '4px 10px', borderRadius: '20px', width: 'fit-content' }}>
                        Showing {filteredData.length} line items
                    </div>
                </div>
                {/* Breakdowns */}
                {['Product', 'Work Order', 'Department'].map(type => {
                    const typeTotal = filteredData.filter(d => d.allocation?.type === type).reduce((s, i) => s + (i.taxableAmount || 0), 0);
                    if (typeTotal === 0) return null;
                    return (
                        <div key={type} style={{ background: '#fff', padding: '20px', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
                            <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '8px' }}>{type} Allocation</div>
                            <div style={{ fontSize: '20px', fontWeight: 800, color: '#1e293b' }}>{formatAmount(typeTotal)}</div>
                            <div style={{ fontSize: '11px', color: '#059669', fontWeight: 600, marginTop: '4px' }}>{((typeTotal / (totalCost || 1)) * 100).toFixed(1)}% of total</div>
                        </div>
                    );
                })}
            </div>

            <div style={{ background: '#ffffff', borderRadius: '14px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
                {loading ? (
                    <div style={{ padding: '60px' }}><BrandedLoader /></div>
                ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ background: '#f1f5f9', borderBottom: '1px solid #e2e8f0' }}>
                                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '11px', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>Date</th>
                                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '11px', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>Invoice / Supplier</th>
                                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '11px', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>Item Details</th>
                                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '11px', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>Allocation</th>
                                <th style={{ padding: '12px 16px', textAlign: 'right', fontSize: '11px', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>Amount</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredData.length === 0 ? (
                                <tr><td colSpan="5" style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>No consumable purchases found for this period.</td></tr>
                            ) : filteredData.map((item, idx) => (
                                <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9', transition: 'background 0.2s' }} onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                    <td style={{ padding: '14px 16px', verticalAlign: 'top' }}>
                                        <div style={{ fontSize: '13px', fontWeight: 600, color: '#1e293b' }}>{moment(item.invoiceDate).format('DD MMM YYYY')}</div>
                                        <div style={{ fontSize: '11px', color: '#94a3b8' }}>{moment(item.invoiceDate).fromNow()}</div>
                                    </td>
                                    <td style={{ padding: '14px 16px', verticalAlign: 'top' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <ShoppingCart size={12} color="#3b82f6" />
                                            <span style={{ fontSize: '13px', fontWeight: 700, color: '#2563eb' }}>{item.invoiceNumber}</span>
                                        </div>
                                        <div style={{ fontSize: '12px', color: '#475569', marginTop: '2px' }}>{item.supplierName}</div>
                                    </td>
                                    <td style={{ padding: '14px 16px', verticalAlign: 'top' }}>
                                        <div style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b' }}>{item.itemName}</div>
                                        <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>Qty: {item.qty} {item.uom} @ ₹{item.rate}</div>
                                    </td>
                                    <td style={{ padding: '14px 16px', verticalAlign: 'top' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                                            <Tag size={12} color="#9333ea" />
                                            <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '4px', background: '#f3e8ff', color: '#9333ea' }}>{item.allocation?.type}</span>
                                        </div>
                                        {item.allocation?.referenceName && (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                <Box size={10} color="#64748b" />
                                                <span style={{ fontSize: '12px', fontWeight: 600, color: '#475569' }}>{item.allocation.referenceName}</span>
                                            </div>
                                        )}
                                    </td>
                                    <td style={{ padding: '14px 16px', textAlign: 'right', verticalAlign: 'top' }}>
                                        <div style={{ fontSize: '14px', fontWeight: 800, color: '#059669' }}>{formatAmount(item.taxableAmount)}</div>
                                        <div style={{ fontSize: '10px', color: '#94a3b8' }}>+ GST ₹{item.totalAmount - item.taxableAmount}</div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
};

export default ConsumableCostReport;
