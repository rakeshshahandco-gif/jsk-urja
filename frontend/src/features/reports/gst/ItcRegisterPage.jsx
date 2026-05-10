import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Table, Button, Badge } from '@/components/ui';
import { Download, Calendar as CalendarIcon, RefreshCw, AlertCircle, FileText, IndianRupee } from 'lucide-react';
import apiClient from '@/config/apiClient';
import { formatCurrency, formatDate } from '@/utils/formatters';
import * as XLSX from 'xlsx';

export const ItcRegisterPage = () => {
    const navigate = useNavigate();
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);

    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
    
    const [dateRange, setDateRange] = useState({ startDate: firstDay, endDate: lastDay });
    const [filters, setFilters] = useState({
        supplier: '',
        gstin: '',
        gstType: 'All',
        itcEligibility: 'All',
        purchaseType: 'All',
        missingGstinOnly: false
    });

    const fetchRegister = async () => {
        setLoading(true);
        try {
            const res = await apiClient.get('/gst-reports/itc-register', { 
                params: { ...dateRange, ...filters } 
            });
            if (res.data.success) {
                setData(res.data.data || []);
            }
        } catch (error) {
            console.error('Error fetching ITC Register:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchRegister();
    }, []);

    const handleExport = () => {
        const exportData = data.map(row => {
            const r = {
                'Date': formatDate(row.date),
                'Invoice Number': row.invoiceNumber,
                'Supplier Name': row.supplierName,
                'GSTIN': row.supplierGstin || 'GSTIN Missing',
                'Taxable Value': row.taxableValue,
                'CGST': row.cgst,
                'SGST': row.sgst,
                'IGST': row.igst,
                'Total ITC': row.totalTax,
                'ITC Eligibility': row.itcEligibility,
                'Purchase Type': row.purchaseType
            };
            // Excel should not export blank/zero values if actual purchase invoice has data
            // We just export exactly what we have in numbers.
            return r;
        });

        const ws = XLSX.utils.json_to_sheet(exportData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "ITC_Register");
        XLSX.writeFile(wb, `ITC_Register_${dateRange.startDate}_to_${dateRange.endDate}.xlsx`);
    };

    const columns = [
        { header: 'Date', accessor: row => formatDate(row.date) },
        { header: 'Supplier Name', accessor: 'supplierName' },
        { header: 'GSTIN', accessor: row => row.supplierGstin ? row.supplierGstin : <Badge variant="destructive">GSTIN Missing</Badge> },
        { header: 'Invoice No', accessor: 'invoiceNumber' },
        { header: 'Taxable Value', accessor: row => formatCurrency(row.taxableValue), className: 'text-right' },
        { header: 'CGST', accessor: row => formatCurrency(row.cgst), className: 'text-right' },
        { header: 'SGST', accessor: row => formatCurrency(row.sgst), className: 'text-right' },
        { header: 'IGST', accessor: row => formatCurrency(row.igst), className: 'text-right' },
        { header: 'Total ITC', accessor: row => <span className="font-semibold text-blue-600">{formatCurrency(row.totalTax)}</span>, className: 'text-right' },
        { header: 'Eligibility', accessor: row => (
            <Badge variant={row.itcEligibility === 'Eligible' ? 'success' : 'warning'}>{row.itcEligibility}</Badge>
        )},
        { header: 'Type', accessor: 'purchaseType' }
    ];

    const totals = data.reduce((acc, row) => {
        acc.taxableValue += (row.taxableValue || 0);
        acc.cgst += (row.cgst || 0);
        acc.sgst += (row.sgst || 0);
        acc.igst += (row.igst || 0);
        acc.totalTax += (row.totalTax || 0);
        if (!row.supplierGstin) acc.missingGstin++;
        return acc;
    }, { taxableValue: 0, cgst: 0, sgst: 0, igst: 0, totalTax: 0, missingGstin: 0 });

    const handleRowClick = (row) => {
        if (row.id) {
            navigate(`/purchase/purchase-invoice/${row.id}`);
        }
    };

    const SummaryCard = ({ title, value, icon, color }) => (
        <div className={`p-4 rounded-lg border bg-white flex items-center gap-4 border-${color}-200 shadow-sm`}>
            <div className={`p-3 rounded-full bg-${color}-50 text-${color}-600`}>
                {icon}
            </div>
            <div>
                <p className="text-xs font-semibold text-slate-500 uppercase">{title}</p>
                <p className="text-xl font-bold text-slate-800">{value}</p>
            </div>
        </div>
    );

    return (
        <div className="space-y-4 pb-12">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-4 rounded-lg shadow-sm border border-slate-200">
                <div className="flex flex-wrap items-center gap-4 w-full sm:w-auto">
                    <div className="flex items-center gap-2 border rounded-md px-2 bg-slate-50">
                        <CalendarIcon size={16} className="text-slate-500" />
                        <input
                            type="date"
                            value={dateRange.startDate}
                            onChange={(e) => setDateRange(p => ({ ...p, startDate: e.target.value }))}
                            className="bg-transparent px-1 py-1.5 text-sm focus:outline-none"
                        />
                        <span className="text-slate-400">to</span>
                        <input
                            type="date"
                            value={dateRange.endDate}
                            onChange={(e) => setDateRange(p => ({ ...p, endDate: e.target.value }))}
                            className="bg-transparent px-1 py-1.5 text-sm focus:outline-none"
                        />
                    </div>
                    
                    <input
                        type="text"
                        placeholder="Search Supplier..."
                        value={filters.supplier}
                        onChange={(e) => setFilters(p => ({ ...p, supplier: e.target.value }))}
                        className="border rounded px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none w-40"
                    />

                    <input
                        type="text"
                        placeholder="GSTIN..."
                        value={filters.gstin}
                        onChange={(e) => setFilters(p => ({ ...p, gstin: e.target.value }))}
                        className="border rounded px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none w-32"
                    />

                    <select
                        value={filters.gstType}
                        onChange={(e) => setFilters(p => ({ ...p, gstType: e.target.value }))}
                        className="border rounded px-2 py-1.5 text-sm bg-white focus:outline-none"
                    >
                        <option value="All">All GST Types</option>
                        <option value="CGST/SGST">Local (CGST/SGST)</option>
                        <option value="IGST">Interstate (IGST)</option>
                    </select>

                    <select
                        value={filters.purchaseType}
                        onChange={(e) => setFilters(p => ({ ...p, purchaseType: e.target.value }))}
                        className="border rounded px-2 py-1.5 text-sm bg-white focus:outline-none"
                    >
                        <option value="All">All Purchase Types</option>
                        <option value="Raw Material">Raw Material</option>
                        <option value="Trading">Trading</option>
                        <option value="Consumable">Consumable</option>
                        <option value="Expense">Expense</option>
                    </select>
                    
                    <select
                        value={filters.itcEligibility}
                        onChange={(e) => setFilters(p => ({ ...p, itcEligibility: e.target.value }))}
                        className="border rounded px-2 py-1.5 text-sm bg-white focus:outline-none"
                    >
                        <option value="All">All Eligibility</option>
                        <option value="Eligible">Eligible</option>
                        <option value="Ineligible">Ineligible</option>
                        <option value="Blocked">Blocked</option>
                        <option value="Reverse Charge">Reverse Charge</option>
                        <option value="Pending">Pending</option>
                    </select>

                    <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                        <input 
                            type="checkbox" 
                            checked={filters.missingGstinOnly}
                            onChange={(e) => setFilters(p => ({ ...p, missingGstinOnly: e.target.checked }))}
                            className="rounded border-slate-300"
                        />
                        Missing GSTIN Only
                    </label>

                    <Button variant="secondary" size="sm" onClick={fetchRegister} disabled={loading} icon={RefreshCw}>
                        Apply Filters
                    </Button>
                </div>
                <div className="shrink-0">
                    <Button variant="primary" size="sm" onClick={handleExport} disabled={data.length === 0} icon={Download}>
                        Export Excel
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                <SummaryCard title="Taxable Purchase" value={formatCurrency(totals.taxableValue)} icon={<IndianRupee size={20} />} color="blue" />
                <SummaryCard title="Total CGST" value={formatCurrency(totals.cgst)} icon={<FileText size={20} />} color="teal" />
                <SummaryCard title="Total SGST" value={formatCurrency(totals.sgst)} icon={<FileText size={20} />} color="emerald" />
                <SummaryCard title="Total IGST" value={formatCurrency(totals.igst)} icon={<FileText size={20} />} color="indigo" />
                <SummaryCard title="Total ITC" value={formatCurrency(totals.totalTax)} icon={<IndianRupee size={20} />} color="violet" />
                <SummaryCard title="Missing GSTIN" value={totals.missingGstin} icon={<AlertCircle size={20} />} color="red" />
            </div>

            <Card>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="text-xs text-slate-500 bg-slate-50 uppercase border-b border-slate-200">
                            <tr>
                                {columns.map((col, idx) => (
                                    <th key={idx} className={`px-4 py-3 ${col.className || ''}`}>{col.header}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan={columns.length} className="text-center py-8 text-slate-500">Loading ITC data...</td>
                                </tr>
                            ) : data.length === 0 ? (
                                <tr>
                                    <td colSpan={columns.length} className="text-center py-8 text-slate-500">No ITC records found for the selected filters.</td>
                                </tr>
                            ) : (
                                data.map((row, idx) => (
                                    <tr 
                                        key={row.id || idx} 
                                        onClick={() => handleRowClick(row)}
                                        className={`border-b border-slate-100 hover:bg-blue-50 cursor-pointer transition-colors ${!row.supplierGstin ? 'bg-red-50/50' : ''}`}
                                    >
                                        {columns.map((col, colIdx) => (
                                            <td key={colIdx} className={`px-4 py-3 ${col.className || ''}`}>
                                                {typeof col.accessor === 'function' ? col.accessor(row) : row[col.accessor]}
                                            </td>
                                        ))}
                                    </tr>
                                ))
                            )}
                        </tbody>
                        {!loading && data.length > 0 && (
                            <tfoot className="bg-slate-50 font-bold border-t-2 border-slate-200">
                                <tr>
                                    <td colSpan={4} className="px-4 py-3 text-right">Totals (Invoices: {data.length}):</td>
                                    <td className="px-4 py-3 text-right">{formatCurrency(totals.taxableValue)}</td>
                                    <td className="px-4 py-3 text-right">{formatCurrency(totals.cgst)}</td>
                                    <td className="px-4 py-3 text-right">{formatCurrency(totals.sgst)}</td>
                                    <td className="px-4 py-3 text-right">{formatCurrency(totals.igst)}</td>
                                    <td className="px-4 py-3 text-right text-blue-700">{formatCurrency(totals.totalTax)}</td>
                                    <td colSpan={2}></td>
                                </tr>
                            </tfoot>
                        )}
                    </table>
                </div>
            </Card>
        </div>
    );
};

export default ItcRegisterPage;
