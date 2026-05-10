import React, { useState, useEffect } from 'react';
import { Card, Table, Button, Badge } from '@/components/ui';
import { Download, Calendar as CalendarIcon, RefreshCw, ArrowUpRight, ArrowDownLeft } from 'lucide-react';
import apiClient from '@/config/apiClient';
import { formatCurrency, formatDate } from '@/utils/formatters';
import * as XLSX from 'xlsx';

export const GstLedgerPage = () => {
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);

    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
    
    const [dateRange, setDateRange] = useState({ startDate: firstDay, endDate: lastDay });

    const fetchLedger = async () => {
        setLoading(true);
        try {
            const res = await apiClient.get('/gst-reports/ledger', { params: dateRange });
            if (res.data.success) {
                setData(res.data.data || []);
            }
        } catch (error) {
            console.error('Error fetching GST Ledger:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchLedger();
    }, []);

    const handleExport = () => {
        const exportData = data.map(row => ({
            'Date': formatDate(row.date),
            'Particulars': row.particulars,
            'Ref Number': row.refNumber,
            'Type': row.type,
            'Debit (Asset/ITC)': row.debit,
            'Credit (Liability)': row.credit,
            'Net Balance': row.balance,
            'CGST Debit': row.cgst?.debit,
            'CGST Credit': row.cgst?.credit,
            'SGST Debit': row.sgst?.debit,
            'SGST Credit': row.sgst?.credit,
            'IGST Debit': row.igst?.debit,
            'IGST Credit': row.igst?.credit,
        }));

        const ws = XLSX.utils.json_to_sheet(exportData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "GST_Ledger");
        XLSX.writeFile(wb, `GST_Ledger_${dateRange.startDate}_to_${dateRange.endDate}.xlsx`);
    };

    const columns = [
        { header: 'Date', accessor: row => formatDate(row.date), className: 'w-24' },
        { 
            header: 'Particulars', 
            accessor: row => (
                <div>
                    <div className="font-medium text-slate-800">{row.particulars}</div>
                    <div className="text-xs text-slate-500">Ref: {row.refNumber}</div>
                </div>
            )
        },
        { 
            header: 'Type', 
            accessor: row => (
                <Badge variant={row.type === 'SALES_INVOICE' ? 'error' : 'success'} className="text-[10px]">
                    {row.type === 'SALES_INVOICE' ? 'Output (Sales)' : 'Input (Purchase)'}
                </Badge>
            )
        },
        { 
            header: 'Debit (ITC Added)', 
            accessor: row => row.debit > 0 ? (
                <div className="flex items-center justify-end gap-1 text-blue-600 font-medium">
                    {formatCurrency(row.debit)}
                </div>
            ) : '-',
            className: 'text-right'
        },
        { 
            header: 'Credit (Liability Added)', 
            accessor: row => row.credit > 0 ? (
                <div className="flex items-center justify-end gap-1 text-rose-600 font-medium">
                    {formatCurrency(row.credit)}
                </div>
            ) : '-',
            className: 'text-right'
        },
        { 
            header: 'Running Balance', 
            accessor: row => {
                const isDebitBal = row.balance >= 0;
                return (
                    <span className={`font-bold ${isDebitBal ? 'text-indigo-600' : 'text-rose-600'}`}>
                        {formatCurrency(Math.abs(row.balance))} {isDebitBal ? 'Dr' : 'Cr'}
                    </span>
                );
            },
            className: 'text-right bg-slate-50'
        },
    ];

    const totals = data.reduce((acc, row) => {
        acc.debit += (row.debit || 0);
        acc.credit += (row.credit || 0);
        return acc;
    }, { debit: 0, credit: 0 });

    const netBal = totals.debit - totals.credit;

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
                    <Button variant="secondary" size="sm" onClick={fetchLedger} disabled={loading} icon={RefreshCw}>
                        Refresh
                    </Button>
                </div>
                <Button variant="primary" size="sm" onClick={handleExport} disabled={data.length === 0} icon={Download}>
                    Export Excel
                </Button>
            </div>

            <Card>
                <div className="p-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
                    <div>
                        <h3 className="font-semibold text-slate-800">GST Electronic Ledger (Local Approximation)</h3>
                        <p className="text-xs text-slate-500">Tracks flow of Output Liabilities (Credit) and Input Tax Credits (Debit).</p>
                    </div>
                    <div className="text-right">
                        <p className="text-sm font-medium text-slate-500">Closing Balance for Period</p>
                        <p className={`text-xl font-bold ${netBal >= 0 ? 'text-indigo-600' : 'text-rose-600'}`}>
                            {formatCurrency(Math.abs(netBal))} {netBal >= 0 ? 'Dr (Credit Available)' : 'Cr (Payable)'}
                        </p>
                    </div>
                </div>
                <Table
                    columns={columns}
                    data={data}
                    loading={loading}
                    emptyMessage="No GST ledger entries found for the selected period."
                    footer={
                        data.length > 0 && (
                            <tr className="bg-slate-100 font-bold border-t-2 border-slate-300">
                                <td colSpan={3} className="p-3 text-right text-slate-600">Period Totals:</td>
                                <td className="p-3 text-right text-blue-700">{formatCurrency(totals.debit)}</td>
                                <td className="p-3 text-right text-rose-700">{formatCurrency(totals.credit)}</td>
                                <td className="p-3 text-right bg-slate-200 text-slate-800">
                                    {formatCurrency(Math.abs(netBal))} {netBal >= 0 ? 'Dr' : 'Cr'}
                                </td>
                            </tr>
                        )
                    }
                />
            </Card>
        </div>
    );
};

export default GstLedgerPage;
