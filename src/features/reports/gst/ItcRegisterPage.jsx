import React, { useState, useEffect } from 'react';
import { Card, Table, Button, Badge } from '@/components/ui';
import { Download, Calendar as CalendarIcon, RefreshCw } from 'lucide-react';
import apiClient from '@/config/apiClient';
import { formatCurrency, formatDate } from '@/utils/formatters';
import * as XLSX from 'xlsx';

export const ItcRegisterPage = () => {
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);

    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
    
    const [dateRange, setDateRange] = useState({ startDate: firstDay, endDate: lastDay });

    const fetchRegister = async () => {
        setLoading(true);
        try {
            const res = await apiClient.get('/gst-reports/itc-register', { params: dateRange });
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
        const exportData = data.map(row => ({
            'Date': formatDate(row.date),
            'Invoice Number': row.invoiceNumber,
            'Supplier Name': row.supplierName,
            'GSTIN': row.supplierGstin,
            'Place Of Supply': row.placeOfSupply,
            'Taxable Value': row.taxableValue,
            'CGST': row.cgst,
            'SGST': row.sgst,
            'IGST': row.igst,
            'Total Tax': row.totalTax,
            'Total Invoice Value': row.totalInvoiceValue
        }));

        const ws = XLSX.utils.json_to_sheet(exportData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "ITC_Register");
        XLSX.writeFile(wb, `ITC_Register_${dateRange.startDate}_to_${dateRange.endDate}.xlsx`);
    };

    const columns = [
        { header: 'Date', accessor: row => formatDate(row.date) },
        { header: 'Supplier Name', accessor: 'supplierName' },
        { header: 'GSTIN', accessor: row => row.supplierGstin || <Badge variant="secondary">Unregistered</Badge> },
        { header: 'Invoice No', accessor: 'invoiceNumber' },
        { header: 'Taxable Value', accessor: row => formatCurrency(row.taxableValue), className: 'text-right' },
        { header: 'CGST', accessor: row => formatCurrency(row.cgst), className: 'text-right' },
        { header: 'SGST', accessor: row => formatCurrency(row.sgst), className: 'text-right' },
        { header: 'IGST', accessor: row => formatCurrency(row.igst), className: 'text-right' },
        { header: 'Total ITC', accessor: row => <span className="font-semibold text-blue-600">{formatCurrency(row.totalTax)}</span>, className: 'text-right' },
    ];

    const totals = data.reduce((acc, row) => {
        acc.taxableValue += (row.taxableValue || 0);
        acc.cgst += (row.cgst || 0);
        acc.sgst += (row.sgst || 0);
        acc.igst += (row.igst || 0);
        acc.totalTax += (row.totalTax || 0);
        return acc;
    }, { taxableValue: 0, cgst: 0, sgst: 0, igst: 0, totalTax: 0 });

    return (
        <div className="space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-4 rounded-lg shadow-sm border border-slate-200">
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                        <CalendarIcon size={16} className="text-slate-500" />
                        <input
                            type="date"
                            value={dateRange.startDate}
                            onChange={(e) => setDateRange(p => ({ ...p, startDate: e.target.value }))}
                            className="border rounded px-2 py-1 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                        />
                        <span className="text-slate-400">to</span>
                        <input
                            type="date"
                            value={dateRange.endDate}
                            onChange={(e) => setDateRange(p => ({ ...p, endDate: e.target.value }))}
                            className="border rounded px-2 py-1 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                        />
                    </div>
                    <Button variant="secondary" size="sm" onClick={fetchRegister} disabled={loading} icon={RefreshCw}>
                        Refresh
                    </Button>
                </div>
                <Button variant="primary" size="sm" onClick={handleExport} disabled={data.length === 0} icon={Download}>
                    Export Excel
                </Button>
            </div>

            <Card>
                <Table
                    columns={columns}
                    data={data}
                    loading={loading}
                    emptyMessage="No ITC records found for the selected period."
                    footer={
                        data.length > 0 && (
                            <tr className="bg-slate-50 font-bold border-t-2 border-slate-200">
                                <td colSpan={4} className="p-3 text-right">Totals:</td>
                                <td className="p-3 text-right">{formatCurrency(totals.taxableValue)}</td>
                                <td className="p-3 text-right">{formatCurrency(totals.cgst)}</td>
                                <td className="p-3 text-right">{formatCurrency(totals.sgst)}</td>
                                <td className="p-3 text-right">{formatCurrency(totals.igst)}</td>
                                <td className="p-3 text-right text-blue-700">{formatCurrency(totals.totalTax)}</td>
                            </tr>
                        )
                    }
                />
            </Card>
        </div>
    );
};

export default ItcRegisterPage;
