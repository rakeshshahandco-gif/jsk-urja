import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Input } from "@/components/ui";
import { BookOpen, Filter, ArrowRight } from "lucide-react";
import { getDayBook } from "@/services/accountApi";
import { toast } from "react-hot-toast";
import s from "./DayBookPage.module.scss";

const DayBookPage = () => {
  const navigate = useNavigate();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    from: new Date().toISOString().split("T")[0],
    to: new Date().toISOString().split("T")[0],
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await getDayBook(filters);
      setData(Array.isArray(res) ? res : (res?.data || []));
    } catch (error) {
      toast.error("Failed to fetch day book");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const getVchClass = (nature) => {
    switch (nature) {
      case "Receipt": return s.receipt;
      case "Payment": return s.payment;
      case "Expense": return s.expense;
      case "Journal": return s.journal;
      case "Contra": return s.contra;
      default: return s.default;
    }
  };

  const fmtCur = (n) => (n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 });

  return (
    <div className={s.pageContainer}>
      <div className={s.headerSection}>
        <div>
          <h1 className={s.title}>
            <BookOpen /> Day Book
          </h1>
          <p className={s.subtitle}>
            Comprehensive daily transaction log across all financial activities
          </p>
        </div>
      </div>

      <div className={s.filterPanel}>
        <div className={s.filterGroup}>
          <label>Audit Period</label>
          <div className={s.dateRange}>
            <Input
              type="date"
              className={s.dateInput}
              value={filters.from}
              onChange={(e) => setFilters((prev) => ({ ...prev, from: e.target.value }))}
            />
            <ArrowRight className="w-4 h-4 text-slate-300 font-bold" />
            <Input
              type="date"
              className={s.dateInput}
              value={filters.to}
              onChange={(e) => setFilters((prev) => ({ ...prev, to: e.target.value }))}
            />
          </div>
        </div>
        <Button onClick={fetchData} className="h-10 px-6 font-bold uppercase tracking-wider text-xs">
          <Filter className="w-4 h-4 mr-2" /> Refresh Log
        </Button>
      </div>

      <div className={s.tableContainer}>
        <table className="w-full text-left border-collapse">
          <thead>
            <tr>
              <th>Date</th>
              <th>Voucher Type</th>
              <th>Serial No.</th>
              <th>Particulars / Ledger</th>
              <th className="text-right">Debit (₹)</th>
              <th className="text-right">Credit (₹)</th>
            </tr>
          </thead>
          <tbody>
            {!loading && data.map((vch) => (
              <tr key={vch._id} className="hover:bg-slate-50/50 transition-colors">
                <td className="font-bold text-slate-500 tabular-nums">
                  {new Date(vch.date).toLocaleDateString('en-GB')}
                </td>
                <td>
                  <span className={`${s.vchBadge} ${getVchClass(vch.nature)}`}>
                    {vch.voucherTypeName || vch.nature}
                  </span>
                </td>
                <td className={s.voucherNo}>
                  #{vch.voucherNo}
                </td>
                <td>
                  <div className={s.particulars}>
                    <div className={s.partyName}>
                      {vch.partyName || vch.items[0]?.ledgerName}
                    </div>
                    <div className={s.narration}>
                      {vch.narration || 'No Narration Provided'}
                    </div>
                  </div>
                </td>
                <td className="text-right">
                  <span className={s.amount}>
                    {vch.nature === "Receipt" ? fmtCur(vch.totalAmount) : "—"}
                  </span>
                </td>
                <td className="text-right">
                  <span className={s.amount}>
                    {vch.nature === "Payment" || vch.nature === "Expense" ? fmtCur(vch.totalAmount) : "—"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        
        {!loading && data.length === 0 && (
          <div className={s.emptyState}>
            <div className={s.emptyIcon}>
              <BookOpen className="w-8 h-8" />
            </div>
            <h3>Journal Empty</h3>
            <p className="text-sm">No transactions matched your current filters.</p>
          </div>
        )}
        
        {loading && (
           <div className="p-20 text-center text-slate-400 font-bold animate-pulse">
             SYNCHRONIZING DAY BOOK...
           </div>
        )}
      </div>
    </div>
  );
};

export default DayBookPage;
