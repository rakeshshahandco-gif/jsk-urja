import React, { useState, useEffect } from 'react';
import { Card, Table, Button } from '@/components/ui';
import { Download, Calendar as CalendarIcon, RefreshCw } from 'lucide-react';
import apiClient from '@/config/apiClient';
import { formatCurrency } from '@/utils/formatters';
import * as XLSX from 'xlsx';

export const HsnSummaryPage = () => {
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);

    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
    
    const [dateRange, setDateRange] = useState({ startDate: firstDay, endDate: lastDay });

    const fetchSummary = async () => {
        setLoading(true);
        try {
            const res = await apiClient.get('/gst-reports/hsn-summary', { params: dateRange });
            if (res.data.success) {
                setData(res.data.data || []);
            }
        } catch (error) {
            console.error('Error fetching HSN Summary:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchSummary();
    }, []);

    const handleExport = () => {
        const exportData = data.map(row => ({
            'HSN Code': row.hsn,
            'Description': row.description,
            'UQC': row.uqc,
            'Inward Qty': row.inwardQty,
            'Inward Value': row.inwardValue,
            'Inward Tax': row.inwardTax,
            'Outward Qty': row.outwardQty,
            'Outward Value': row.outwardValue,
            'Outward Tax': row.outwardTax,
            'CGST Total': row.cgst,
            'SGST Total': row.sgst,
            'IGST Total': row.igst
        }));

        const ws = XLSX.utils.json_to_sheet(exportData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "HSN_Summary");
        XLSX.writeFile(wb, `HSN_Summary_${dateRange.startDate}_to_${dateRange.endDate}.xlsx`);
    };

    const columns = [
        { header: 'HSN Code', accessor: 'hsn', className: 'font-medium' },
        { header: 'Description', accessor: 'description' },
        { header: 'UQC', accessor: 'uqc', className: 'text-center' },
        { 
            header: 'Inward (Purchases)', 
            accessor: row => (
                <div className="text-right">
                    <div className="text-xs text-slate-500">Qty: {row.inwardQty}</div>
                    <div className="font-medium text-slate-800">{formatCurrency(row.inwardValue)}</div>
                </div>
            )
        },
        { 
            header: 'Outward (Sales)', 
            accessor: row => (
                <div className="text-right">
                    <div className="text-xs text-slate-500">Qty: {row.outwardQty}</div>
                    <div className="font-medium text-slate-800">{formatCurrency(row.outwardValue)}</div>
                </div>
            )
        },
        { header: 'Total CGST', accessor: row => formatCurrency(row.cgst), className: 'text-right' },
        { header: 'Total SGST', accessor: row => formatCurrency(row.sgst), className: 'text-right' },
        { header: 'Total IGST', accessor: row => formatCurrency(row.igst), className: 'text-right' },
    ];

    const totals = data.reduce((acc, row) => {
        acc.inwardValue += (row.inwardValue || 0);
        acc.outwardValue += (row.outwardValue || 0);
        acc.cgst += (row.cgst || 0);
        acc.sgst += (row.sgst || 0);
        acc.igst += (row.igst || 0);
        return acc;
    }, { inwardValue: 0, outwardValue: 0, cgst: 0, sgst: 0, igst: 0 });

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
                    <Button variant="secondary" size="sm" onClick={fetchSummary} disabled={loading} icon={RefreshCw}>
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
                    emptyMessage="No HSN data found for the selected period."
                    footer={
                        data.length > 0 && (
                            <tr className="bg-slate-50 font-bold border-t-2 border-slate-200">
                                <td colSpan={3} className="p-3 text-right">Totals:</td>
                                <td className="p-3 text-right">{formatCurrency(totals.inwardValue)}</td>
                                <td className="p-3 text-right">{formatCurrency(totals.outwardValue)}</td>
                                <td className="p-3 text-right">{formatCurrency(totals.cgst)}</td>
                                <td className="p-3 text-right">{formatCurrency(totals.sgst)}</td>
                                <td className="p-3 text-right">{formatCurrency(totals.igst)}</td>
                            </tr>
                        )
                    }
                />
            </Card>
        </div>
    );
};

export default HsnSummaryPage;
