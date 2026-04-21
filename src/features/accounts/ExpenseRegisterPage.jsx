import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui";
import { Filter, Eye, Download } from "lucide-react";
import { getExpenseRegister } from "@/services/accountApi";
import { toast } from "react-hot-toast";
import { PATHS } from "@/routes/paths";
import { useFYDateRange } from "@/contexts/FinancialYearContext";
import FYBadge from "@/components/ui/FYBadge";
import s from "./ExpenseRegisterPage.module.scss";

const fmtCur = (n) => (n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 });
const fmtDate = (d) => d ? new Date(d).toLocaleDateString("en-IN") : "—";

const PAY_STATUS_COLORS = {
    'Paid': { bg: '#f0fdf4', color: '#16a34a', border: '#bcf0da' },
    'Unpaid': { bg: '#fff1f2', color: '#e11d48', border: '#fecdd3' },
    'Partially Paid': { bg: '#eff6ff', color: '#2563eb', border: '#bfdbfe' },
    'Cancelled': { bg: '#f8fafc', color: '#64748b', border: '#e2e8f0' },
};

export default function ExpenseRegisterPage() {
    const navigate = useNavigate();
    const fyDateRange = useFYDateRange();
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [filters, setFilters] = useState({
        from: fyDateRange.startDate,
        to: fyDateRange.endDate,
        paymentStatus: '',
        expenseType: ''
    });

    const fetchData = async () => {
        setLoading(true);
        try {
            const res = await getExpenseRegister(filters);
            setData(Array.isArray(res) ? res : (res?.data || []));
        } catch (err) {
            console.error('[ExpenseRegister] Error:', err);
            toast.error("Failed to fetch expense register");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        setFilters(p => ({ ...p, from: fyDateRange.startDate, to: fyDateRange.endDate }));
    }, [fyDateRange.startDate, fyDateRange.endDate]);

    useEffect(() => { fetchData(); }, [filters.from, filters.to, filters.paymentStatus, filters.expenseType]);

    const totals = useMemo(() => {
        return data.reduce((acc, v) => {
            acc.taxable += v.totalTaxableAmount || 0;
            acc.tax += v.totalTax || 0;
            acc.net += v.grandTotal || v.totalAmount || 0;
            acc.paid += v.paidAmount || 0;
            return acc;
        }, { taxable: 0, tax: 0, net: 0, paid: 0 });
    }, [data]);

    const exportCSV = () => {
        if (!data.length) return toast.error("No data to export");
        const rows = [
            ["Date", "Voucher No.", "Supplier / Party", "Expense Type", "Status", "Taxable Amt", "GST", "Total Value", "Paid Amt"],
            ...data.map(v => [
                fmtDate(v.date),
                v.voucherNo,
                v.partyName || v.cashBankAccountName || "Multiple",
                v.expenseType || "Cash",
                v.paymentStatus,
                v.totalTaxableAmount || 0,
                v.totalTax || 0,
                v.grandTotal || v.totalAmount,
                v.paidAmount || 0
            ])
        ];
        const csv = rows.map(r => r.map(c => `"${c}"`).join(",")).join("\n");
        const blob = new Blob([csv], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = `expense_register_${filters.from}_to_${filters.to}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div className={s.pageContainer}>
            <div className={s.headerSection}>
                <div>
                    <h1 className={s.title}>🧧 Expense Register</h1>
                    <p className={s.subtitle}>Comprehensive tracking of operational and capital expenditures</p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <FYBadge />
                    <button onClick={exportCSV} className="flex items-center gap-2 bg-slate-800 hover:bg-black text-white px-6 py-2.5 rounded-lg font-black uppercase text-[10px] tracking-widest transition-all shadow-md">
                        <Download size={14} /> Export CSV
                    </button>
                </div>
            </div>

            <div className={s.filterPanel}>
                <div className={s.filterGroup}>
                    <label>Period</label>
                    <div className="flex items-center gap-2">
                        <input type="date" value={filters.from} onChange={e => setFilters(p => ({ ...p, from: e.target.value }))} />
                        <span className="text-slate-300 font-black">→</span>
                        <input type="date" value={filters.to} onChange={e => setFilters(p => ({ ...p, to: e.target.value }))} />
                    </div>
                </div>

                <div className={s.filterGroup}>
                    <label>Payment Status</label>
                    <select value={filters.paymentStatus} onChange={e => setFilters(p => ({ ...p, paymentStatus: e.target.value }))}>
                        <option value="">All Status</option>
                        <option value="Paid">Paid</option>
                        <option value="Unpaid">Unpaid</option>
                        <option value="Partially Paid">Partially Paid</option>
                    </select>
                </div>

                <div className={s.filterGroup}>
                    <label>Mode</label>
                    <select value={filters.expenseType} onChange={e => setFilters(p => ({ ...p, expenseType: e.target.value }))}>
                        <option value="">All Modes</option>
                        <option value="Cash">Cash</option>
                        <option value="Bank">Bank</option>
                        <option value="Credit">Credit (Bills)</option>
                    </select>
                </div>

                <Button onClick={fetchData} className="px-8 h-10 font-bold uppercase tracking-widest text-[10px] bg-red-600 hover:bg-red-700">
                    <Filter size={13} className="mr-2" /> Refresh
                </Button>

                <div className={s.stats}>
                    <div className={s.statItem}>
                        <span>Net Payable</span>
                        <span>₹{fmtCur(totals.net)}</span>
                    </div>
                    <div className={s.statItem}>
                        <span>Paid</span>
                        <span style={{ color: '#16a34a' }}>₹{fmtCur(totals.paid)}</span>
                    </div>
                    <div className={s.statItem}>
                        <span>Outstanding</span>
                        <span>₹{fmtCur(totals.net - totals.paid)}</span>
                    </div>
                </div>
            </div>

            <div className={s.tableContainer}>
                {loading ? <div className="p-32 text-center text-slate-300 font-black animate-pulse uppercase tracking-widest">Loading Expenses...</div> : (
                    <table className="w-full">
                        <thead>
                            <tr>
                                <th>Date</th>
                                <th>Voucher No.</th>
                                <th>Party / Supplier</th>
                                <th>Nature / Head</th>
                                <th className="text-right">Taxable</th>
                                <th className="text-right">GST</th>
                                <th className="text-right">Total</th>
                                <th>Type</th>
                                <th>Status</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.map(v => {
                                const sc = PAY_STATUS_COLORS[v.paymentStatus] || PAY_STATUS_COLORS['Paid'];
                                return (
                                    <tr key={v._id}>
                                        <td className="font-bold text-slate-400">{fmtDate(v.date)}</td>
                                        <td className={s.primaryId}>{v.voucherNo}</td>
                                        <td className={s.partyName}>{v.partyName || v.cashBankAccountName || "—"}</td>
                                        <td>
                                            <div className="font-bold text-[11px] text-slate-700">
                                                {v.items && v.items.length > 0 ? (v.items.length === 1 ? v.items[0].ledgerName : `${v.items[0].ledgerName} [+${v.items.length - 1}]`) : "—"}
                                            </div>
                                            <div className="text-[9px] text-slate-400 font-medium italic overflow-hidden whitespace-nowrap overflow-ellipsis max-w-[200px]">
                                                {v.narration}
                                            </div>
                                        </td>
                                        <td className={s.amount}>₹{fmtCur(v.totalTaxableAmount || 0)}</td>
                                        <td className={s.amount}>₹{fmtCur(v.totalTax || 0)}</td>
                                        <td className={`${s.amount} font-black text-slate-900`}>₹{fmtCur(v.grandTotal || v.totalAmount || 0)}</td>
                                        <td className="text-[10px] uppercase font-black text-slate-500">{v.expenseType || "Cash"}</td>
                                        <td>
                                            <span style={{ 
                                                padding: '2px 8px', borderRadius: '4px', fontSize: '9px', fontWeight: '900',
                                                background: sc.bg, color: sc.color, border: `1px solid ${sc.border}`,
                                                textTransform: 'uppercase', letterSpacing: '0.05em'
                                            }}>
                                                {v.paymentStatus}
                                            </span>
                                        </td>
                                        <td className="text-center">
                                            <button onClick={() => navigate(PATHS.ACCOUNTS.VOUCHER_LIST)} className="text-slate-300 hover:text-red-600 transition-colors">
                                                <Eye size={16} />
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                        <tfoot>
                            <tr className="bg-slate-900 text-white font-black">
                                <td colSpan={4} className="text-right uppercase tracking-widest text-[9px] opacity-60 px-6">Grand Total</td>
                                <td className="text-right px-3 tabular-nums font-mono opacity-80">₹{fmtCur(totals.taxable)}</td>
                                <td className="text-right px-3 tabular-nums font-mono opacity-80">₹{fmtCur(totals.tax)}</td>
                                <td className="text-right px-3 tabular-nums font-mono text-red-400 text-lg">₹{fmtCur(totals.net)}</td>
                                <td colSpan={3}></td>
                            </tr>
                        </tfoot>
                    </table>
                )}
                {!loading && data.length === 0 && <div className="p-32 text-center text-slate-300 font-black uppercase tracking-widest">No Expenses Found for this period</div>}
            </div>
        </div>
    );
}
