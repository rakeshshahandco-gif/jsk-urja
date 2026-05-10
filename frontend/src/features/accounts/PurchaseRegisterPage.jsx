import { useState, useEffect } from "react";
import { Button } from "@/components/ui";
import { Filter, Eye, Download } from "lucide-react";
import { getPurchaseRegister } from "@/services/accountApi";
import { toast } from "react-hot-toast";
import { useNavigate } from "react-router-dom";
import { PATHS } from "@/routes/paths";
import { useFYDateRange } from "@/contexts/FinancialYearContext";
import FYBadge from "@/components/ui/FYBadge";
import s from "./PurchaseRegisterPage.module.scss";

const TABS = [
  { key: "register_inv", label: "Register (With Inventory)" },
  { key: "register_noinv", label: "Register (Without Inventory)" },
  { key: "gstr2", label: "GSTR-2 / ITC Register" },
  { key: "gstr3b", label: "GSTR-3B (ITC Summary)" },
];

const fmtCur = (n) => (n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 });
const fmtDate = (d) => d ? new Date(d).toLocaleDateString("en-IN") : "—";

const getGstSlab = (rate) => {
  if (!rate || rate === 0) return "Exempt / NIL";
  if (rate <= 5) return "5%";
  if (rate <= 12) return "12%";
  if (rate <= 18) return "18%";
  return "28%";
};

export default function PurchaseRegisterPage() {
  const navigate = useNavigate();
  const fyDateRange = useFYDateRange();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState("register_inv");
  const [filters, setFilters] = useState({
    from: fyDateRange.startDate,
    to: fyDateRange.endDate,
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await getPurchaseRegister(filters);
      setData(Array.isArray(res) ? res : (res?.data || []));
    } catch {
      toast.error("Failed to fetch purchase register");
    } finally {
      setLoading(false);
    }
  };

  // Auto-reset when FY changes
  useEffect(() => {
    setFilters({ from: fyDateRange.startDate, to: fyDateRange.endDate });
  }, [fyDateRange.startDate, fyDateRange.endDate]);

  useEffect(() => { fetchData(); }, [filters.from, filters.to]);

  const totals = data.reduce((acc, inv) => {
    acc.taxable += inv.totalTaxableAmount || inv.totalBeforeTax || 0;
    acc.tax += inv.totalTaxAmount || inv.totalGst || 0;
    acc.igst += inv.totalIgst || 0;
    acc.cgst += inv.totalCgst || 0;
    acc.sgst += inv.totalSgst || 0;
    acc.net += inv.grandTotal || 0;
    return acc;
  }, { taxable: 0, tax: 0, igst: 0, cgst: 0, sgst: 0, net: 0 });

  const exportCSV = () => {
    if (!data.length) return toast.error("No data to export");
    let rows = [];
    if (tab === "gstr2") {
      rows = [
        ["GSTIN of Supplier", "Supplier Name", "Invoice No.", "Invoice Date", "Invoice Value", "Place of Supply", "Taxable Value", "IGST", "CGST", "SGST", "ITC Eligible?"],
        ...data.map(inv => [
          inv.supplierGstin || "",
          inv.supplierId?.name || inv.supplierName || "",
          inv.invoiceNumber,
          fmtDate(inv.invoiceDate),
          inv.grandTotal,
          inv.placeOfSupply || "",
          inv.totalTaxableAmount || inv.totalBeforeTax || 0,
          inv.totalIgst || 0,
          inv.totalCgst || 0,
          inv.totalSgst || 0,
          "Yes",
        ])
      ];
    } else {
      rows = [
        ["Date", "Invoice No.", "Supplier", "GSTIN", "Taxable Amt", "IGST", "CGST", "SGST", "Total Tax", "Net Amount"],
        ...data.map(inv => [
          fmtDate(inv.invoiceDate),
          inv.invoiceNumber,
          inv.supplierId?.name || inv.supplierName || "",
          inv.supplierGstin || "",
          inv.totalTaxableAmount || inv.totalBeforeTax || 0,
          inv.totalIgst || 0,
          inv.totalCgst || 0,
          inv.totalSgst || 0,
          inv.totalTaxAmount || inv.totalGst || 0,
          inv.grandTotal || 0,
        ])
      ];
    }
    const csv = rows.map(r => r.map(c => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `purchase_register_${tab}_${filters.from}_${filters.to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const gstr3bITCGroups = () => {
    const slabs = {};
    data.forEach(inv => {
      const isIGST = inv.gstType === "IGST";
      (inv.items || []).forEach(it => {
        const slab = getGstSlab(it.taxRate);
        if (!slabs[slab]) slabs[slab] = { rate: it.taxRate || 0, taxable: 0, igst: 0, cgst: 0, sgst: 0 };
        const taxable = it.taxableAmount || (it.qty * it.rate) || 0;
        slabs[slab].taxable += taxable;
        if (isIGST) slabs[slab].igst += taxable * (it.taxRate || 0) / 100;
        else {
          slabs[slab].cgst += taxable * (it.taxRate || 0) / 200;
          slabs[slab].sgst += taxable * (it.taxRate || 0) / 200;
        }
      });
    });
    return Object.entries(slabs).sort((a, b) => a[1].rate - b[1].rate);
  };

  return (
    <div className={s.pageContainer}>
      {/* Header */}
      <div className={s.headerSection}>
        <div>
          <h1 className={s.title}>📥 Purchase Register</h1>
          <p className={s.subtitle}>Periodical summary of all purchase invoices and ITC details</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <FYBadge />
          <button onClick={exportCSV} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2.5 rounded-lg font-black uppercase text-[10px] tracking-widest transition-all shadow-md">
            <Download size={14} /> Export CSV
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className={s.tabs}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`${s.tabButton} ${tab === t.key ? s.active : ""}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className={s.filterPanel}>
        <div className={s.filterGroup}>
          <label>Audit Period</label>
          <div className="flex items-center gap-3">
            <input type="date" value={filters.from} onChange={e => setFilters(p => ({ ...p, from: e.target.value }))} />
            <span className="text-slate-300 font-black">→</span>
            <input type="date" value={filters.to} onChange={e => setFilters(p => ({ ...p, to: e.target.value }))} />
          </div>
        </div>
        <Button onClick={fetchData} className="px-8 h-10 font-bold uppercase tracking-widest text-[10px]">
          <Filter size={13} className="mr-2" /> Refresh Log
        </Button>
        <div className={s.stats}>
          <div className={s.statItem}>
            <span>Bills</span>
            <span>{data.length}</span>
          </div>
          <div className={s.statItem}>
            <span>Taxable</span>
            <span>₹{fmtCur(totals.taxable)}</span>
          </div>
          <div className={s.statItem}>
            <span>Grand Total</span>
            <span>₹{fmtCur(totals.net)}</span>
          </div>
        </div>
      </div>

      <div className="space-y-6">
        {/* ────────────────────────────── REGISTER VIEWS ────────────────────────────── */}
        {(tab === "register_inv" || tab === "register_noinv") && (
          <div className={s.tableContainer}>
            {loading ? <div className="p-32 text-center text-slate-300 font-black animate-pulse uppercase tracking-widest">Generating Register...</div> : (
              <table className="w-full">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Invoice No.</th>
                    <th>Supplier</th>
                    <th>GSTIN</th>
                    {tab === "register_inv" && <th>Item Details</th>}
                    {tab === "register_inv" && <th className="text-right">Qty</th>}
                    <th className="text-right">Taxable Amt</th>
                    <th className="text-right">IGST</th>
                    <th className="text-right">CGST</th>
                    <th className="text-right">SGST</th>
                    <th className="text-right">Net Value</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {data.flatMap(inv => {
                    const lineItems = tab === "register_inv" 
                      ? (inv.items || [{ itemName: "—", qty: 0, rate: 0, taxableAmount: 0, taxRate: 0 }])
                      : [{ totalTaxableAmount: inv.totalTaxableAmount || inv.totalBeforeTax }];
                    
                    return lineItems.map((it, idx) => {
                      const isIGST = inv.gstType === "IGST";
                      const taxable = tab === "register_inv" ? (it.taxableAmount || (it.qty * it.rate) || 0) : (inv.totalTaxableAmount || inv.totalBeforeTax);
                      const igst = isIGST ? (taxable * (it.taxRate || inv.totalTaxRate || 0)) / 100 : 0;
                      const cgst = !isIGST ? (taxable * (it.taxRate || inv.totalTaxRate || 0)) / 200 : 0;
                      const sgst = !isIGST ? (taxable * (it.taxRate || inv.totalTaxRate || 0)) / 200 : 0;
                      
                      return (
                        <tr key={`${inv._id}-${idx}`}>
                          <td className="font-bold text-slate-400">{idx === 0 ? fmtDate(inv.invoiceDate) : ""}</td>
                          <td className={s.primaryId}>{idx === 0 ? inv.invoiceNumber : ""}</td>
                          <td className={s.supplierName}>{idx === 0 ? (inv.supplierId?.name || inv.supplierName) : ""}</td>
                          <td className="text-[10px] uppercase font-bold text-slate-400">{idx === 0 ? (inv.supplierGstin || "URP") : ""}</td>
                          {tab === "register_inv" && (
                            <td>
                              <div className="font-bold text-[11px] text-slate-700">{it.description || it.itemName}</div>
                              <div className="text-[9px] text-slate-400 font-bold uppercase">{it.hsnCode && `HSN: ${it.hsnCode}`}</div>
                            </td>
                          )}
                          {tab === "register_inv" && <td className="text-right font-black tabular-nums">{it.qty} {it.uom}</td>}
                          <td className={s.amount}>₹{fmtCur(taxable)}</td>
                          <td className={`${s.amount} text-blue-600`}>₹{fmtCur(idx === 0 && tab === "register_noinv" ? inv.totalIgst : igst)}</td>
                          <td className={`${s.amount} text-emerald-600`}>₹{fmtCur(idx === 0 && tab === "register_noinv" ? inv.totalCgst : cgst)}</td>
                          <td className={`${s.amount} text-orange-600`}>₹{fmtCur(idx === 0 && tab === "register_noinv" ? inv.totalSgst : sgst)}</td>
                          <td className={`${s.amount} font-black text-slate-900 border-l border-slate-50`}>{idx === 0 ? `₹${fmtCur(inv.grandTotal)}` : ""}</td>
                          <td className="text-center">{idx === 0 ? <button onClick={() => navigate(PATHS.PURCHASE.INVOICE_DETAIL(inv._id))} className="text-slate-300 hover:text-indigo-600 transition-colors"><Eye size={16} /></button> : ""}</td>
                        </tr>
                      );
                    });
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-900 text-white font-black">
                    <td colSpan={tab === "register_inv" ? 6 : 4} className="text-right uppercase tracking-widest text-[9px] opacity-60 px-6">Summary Totals</td>
                    <td className="text-right px-3 tabular-nums font-mono">₹{fmtCur(totals.taxable)}</td>
                    <td className="text-right px-3 tabular-nums font-mono">₹{fmtCur(totals.igst)}</td>
                    <td className="text-right px-3 tabular-nums font-mono">₹{fmtCur(totals.cgst)}</td>
                    <td className="text-right px-3 tabular-nums font-mono">₹{fmtCur(totals.sgst)}</td>
                    <td className="text-right px-3 tabular-nums font-mono text-indigo-400 text-lg">₹{fmtCur(totals.net)}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            )}
            {!loading && data.length === 0 && <div className="p-32 text-center text-slate-300 font-black uppercase tracking-widest">No Records Found</div>}
          </div>
        )}

        {/* ────────────────────────────── ITC SUMMARY ────────────────────────────── */}
        {tab === "gstr3b" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-4">
              <h3 className="font-black uppercase text-[10px] tracking-widest text-slate-400 px-2">ITC Eligible Breakup (Rate-wise)</h3>
              <div className={s.tableContainer}>
                <table className="w-full">
                  <thead>
                    <tr>
                      <th>GST Slab</th>
                      <th className="text-right">Taxable Value</th>
                      <th className="text-right">Integrated Tax</th>
                      <th className="text-right">Central Tax</th>
                      <th className="text-right">State Tax</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gstr3bITCGroups().map(([slab, v]) => (
                      <tr key={slab}>
                        <td className="font-black text-indigo-600">{slab}</td>
                        <td className={s.amount}>₹{fmtCur(v.taxable)}</td>
                        <td className={s.amount}>₹{fmtCur(v.igst)}</td>
                        <td className={s.amount}>₹{fmtCur(v.cgst)}</td>
                        <td className={s.amount}>₹{fmtCur(v.sgst)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
               <div className={s.summaryTile}>
                  <span className={s.tileLabel}>Net ITC Claimable</span>
                  <span className={s.tileValue}>₹{fmtCur(totals.tax)}</span>
               </div>
               <div className={s.summaryTile} style={{ borderLeft: '4px solid #4f46e5' }}>
                  <span className={s.tileLabel}>IGST Component</span>
                  <span className={s.tileValue}>₹{fmtCur(totals.igst)}</span>
               </div>
               <div className={s.summaryTile} style={{ borderLeft: '4px solid #10b981' }}>
                  <span className={s.tileLabel}>CGST Component</span>
                  <span className={s.tileValue}>₹{fmtCur(totals.cgst)}</span>
               </div>
               <div className={s.summaryTile} style={{ borderLeft: '4px solid #f59e0b' }}>
                  <span className={s.tileLabel}>SGST Component</span>
                  <span className={s.tileValue}>₹{fmtCur(totals.sgst)}</span>
               </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
