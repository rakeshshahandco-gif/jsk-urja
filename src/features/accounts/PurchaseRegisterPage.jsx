import { useState, useEffect } from "react";
import { Button, Input } from "@/components/ui";
import { FileText, Filter, Eye, Download } from "lucide-react";
import { getPurchaseRegister } from "@/services/accountApi";
import { toast } from "react-hot-toast";
import { useNavigate } from "react-router-dom";
import { PATHS } from "@/routes/paths";

const TABS = [
  { key: "register_inv", label: "Register (With Inventory)" },
  { key: "register_noinv", label: "Register (Without Inventory)" },
  { key: "gstr2", label: "GSTR-2 / ITC Register" },
  { key: "gstr3b", label: "GSTR-3B (ITC Summary)" },
];

const fmtCur = (n) => `₹${(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
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
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState("register_inv");
  const [filters, setFilters] = useState({
    from: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split("T")[0],
    to: new Date().toISOString().split("T")[0],
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await getPurchaseRegister(filters);
      setData(res);
    } catch {
      toast.error("Failed to fetch purchase register");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

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

  const th = { padding: "10px 14px", textAlign: "left", color: "#6b7280", fontWeight: 700, borderBottom: "2px solid #e5e7eb", fontSize: 11, textTransform: "uppercase", background: "#f9fafb", whiteSpace: "nowrap" };
  const td = { padding: "9px 14px", fontSize: 13, borderBottom: "1px solid #f3f4f6", color: "#374151" };
  const tdr = { ...td, textAlign: "right" };

  return (
    <div style={{ fontFamily: "'Inter',sans-serif", background: "#f8f9fa", minHeight: "100vh", color: "#1e293b" }}>
      {/* Header */}
      <div style={{ background: "#fff", borderBottom: "1px solid #e5e7eb", padding: "16px 28px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>📥 Purchase Register</h1>
          <p style={{ margin: "3px 0 0", color: "#9ca3af", fontSize: 13 }}>Periodical summary of all purchase invoices</p>
        </div>
        <button onClick={exportCSV}
          style={{ padding: "8px 16px", background: "#4f46e5", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
          <Download size={14} /> Export CSV
        </button>
      </div>

      {/* Tabs */}
      <div style={{ background: "#fff", borderBottom: "1px solid #e5e7eb", padding: "0 28px", display: "flex", gap: 0 }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={{ padding: "13px 20px", border: "none", borderBottom: tab === t.key ? "3px solid #4f46e5" : "3px solid transparent", background: "none", cursor: "pointer", fontWeight: tab === t.key ? 800 : 500, color: tab === t.key ? "#4f46e5" : "#6b7280", fontSize: 13, whiteSpace: "nowrap" }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div style={{ padding: "16px 28px", display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap", background: "#fff", borderBottom: "1px solid #f3f4f6" }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "#9ca3af", marginBottom: 4 }}>From Date</div>
          <input type="date" value={filters.from} onChange={e => setFilters(p => ({ ...p, from: e.target.value }))}
            style={{ padding: "7px 10px", border: "1px solid #e2e8f0", borderRadius: 7, fontSize: 13, outline: "none" }} />
        </div>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "#9ca3af", marginBottom: 4 }}>To Date</div>
          <input type="date" value={filters.to} onChange={e => setFilters(p => ({ ...p, to: e.target.value }))}
            style={{ padding: "7px 10px", border: "1px solid #e2e8f0", borderRadius: 7, fontSize: 13, outline: "none" }} />
        </div>
        <button onClick={fetchData} style={{ padding: "8px 18px", background: "#1e293b", color: "#fff", border: "none", borderRadius: 7, cursor: "pointer", fontWeight: 700, fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
          <Filter size={13} /> Apply
        </button>
        <div style={{ marginLeft: "auto", display: "flex", gap: 16, fontSize: 13 }}>
          <span style={{ color: "#9ca3af" }}>{data.length} invoice{data.length !== 1 ? "s" : ""}</span>
          <span style={{ fontWeight: 700, color: "#4f46e5" }}>Total: {fmtCur(totals.net)}</span>
        </div>
      </div>

      <div style={{ padding: "20px 28px" }}>

        {/* ────────────────────────────── REGISTER WITH INVENTORY ─ */}
        {tab === "register_inv" && (
          <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e5e7eb", overflow: "auto", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
            {loading ? <div style={{ padding: 60, textAlign: "center", color: "#9ca3af" }}>Loading...</div> : (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={th}>Date</th>
                    <th style={th}>Invoice No.</th>
                    <th style={th}>Supplier</th>
                    <th style={th}>GSTIN</th>
                    <th style={th}>Item</th>
                    <th style={{ ...th, textAlign: "right" }}>Qty</th>
                    <th style={{ ...th, textAlign: "right" }}>Rate</th>
                    <th style={{ ...th, textAlign: "right" }}>Taxable Amt</th>
                    <th style={{ ...th, textAlign: "right" }}>GST %</th>
                    <th style={{ ...th, textAlign: "right" }}>IGST</th>
                    <th style={{ ...th, textAlign: "right" }}>CGST</th>
                    <th style={{ ...th, textAlign: "right" }}>SGST</th>
                    <th style={{ ...th, textAlign: "right" }}>Net Amt</th>
                    <th style={th}></th>
                  </tr>
                </thead>
                <tbody>
                  {data.flatMap(inv =>
                    (inv.items || [{ itemName: "—", qty: 0, rate: 0, taxableAmount: 0, taxRate: 0 }]).map((it, idx) => {
                      const isIGST = inv.gstType === "IGST";
                      const taxable = it.taxableAmount || (it.qty * it.rate) || 0;
                      const igst = isIGST ? taxable * (it.taxRate || 0) / 100 : 0;
                      const cgst = !isIGST ? taxable * (it.taxRate || 0) / 200 : 0;
                      const sgst = !isIGST ? taxable * (it.taxRate || 0) / 200 : 0;
                      return (
                        <tr key={`${inv._id}-${idx}`} onMouseEnter={e => e.currentTarget.style.background = "#f8fafc"} onMouseLeave={e => e.currentTarget.style.background = ""}>
                          <td style={td}>{idx === 0 ? fmtDate(inv.invoiceDate) : ""}</td>
                          <td style={{ ...td, color: "#4f46e5", fontWeight: 700, fontFamily: "monospace" }}>{idx === 0 ? inv.invoiceNumber : ""}</td>
                          <td style={td}>{idx === 0 ? <div style={{ fontWeight: 600 }}>{inv.supplierId?.name || inv.supplierName || "—"}</div> : ""}</td>
                          <td style={{ ...td, fontSize: 11, color: "#9ca3af" }}>{idx === 0 ? (inv.supplierGstin || "—") : ""}</td>
                          <td style={td}><div style={{ fontWeight: 600, fontSize: 12 }}>{it.description || it.itemName}</div><div style={{ fontSize: 10, color: "#9ca3af" }}>{it.hsnCode ? `HSN: ${it.hsnCode}` : ""}</div></td>
                          <td style={{ ...tdr, fontWeight: 700 }}>{it.qty} {it.uom || ""}</td>
                          <td style={tdr}>{fmtCur(it.rate)}</td>
                          <td style={{ ...tdr, fontWeight: 600 }}>{fmtCur(taxable)}</td>
                          <td style={{ ...tdr, color: "#7c3aed", fontWeight: 700 }}>{it.taxRate || 0}%</td>
                          <td style={tdr}>{fmtCur(igst)}</td>
                          <td style={tdr}>{fmtCur(cgst)}</td>
                          <td style={tdr}>{fmtCur(sgst)}</td>
                          <td style={{ ...tdr, color: "#4f46e5", fontWeight: 700 }}>{idx === 0 ? fmtCur(inv.grandTotal) : ""}</td>
                          <td style={{ ...td, textAlign: "center" }}>{idx === 0 ? <button onClick={() => navigate(PATHS.PURCHASE.INVOICE_DETAIL(inv._id))} style={{ background: "none", border: "1px solid #e2e8f0", borderRadius: 5, padding: "3px 8px", cursor: "pointer", color: "#6b7280" }}><Eye size={12} /></button> : ""}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
                <tfoot>
                  <tr style={{ background: "#1e293b", color: "#fff" }}>
                    <td colSpan={7} style={{ padding: "12px 14px", textAlign: "right", fontSize: 11, fontWeight: 700, color: "#94a3b8" }}>Totals</td>
                    <td style={{ padding: "12px 14px", textAlign: "right", fontWeight: 800 }}>{fmtCur(totals.taxable)}</td>
                    <td></td>
                    <td style={{ padding: "12px 14px", textAlign: "right" }}>{fmtCur(totals.igst)}</td>
                    <td style={{ padding: "12px 14px", textAlign: "right" }}>{fmtCur(totals.cgst)}</td>
                    <td style={{ padding: "12px 14px", textAlign: "right" }}>{fmtCur(totals.sgst)}</td>
                    <td style={{ padding: "12px 14px", textAlign: "right", fontWeight: 800, color: "#a5b4fc" }}>{fmtCur(totals.net)}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            )}
            {!loading && data.length === 0 && <div style={{ padding: 60, textAlign: "center", color: "#9ca3af" }}><FileText size={36} style={{ opacity: 0.2, marginBottom: 8 }} /><br />No purchase invoices found</div>}
          </div>
        )}

        {/* ────────────────────────────── REGISTER WITHOUT INVENTORY ─ */}
        {tab === "register_noinv" && (
          <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e5e7eb", overflow: "auto", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
            {loading ? <div style={{ padding: 60, textAlign: "center", color: "#9ca3af" }}>Loading...</div> : (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={th}>#</th>
                    <th style={th}>Date</th>
                    <th style={th}>Invoice No.</th>
                    <th style={th}>Supplier</th>
                    <th style={th}>GSTIN</th>
                    <th style={th}>GST Type</th>
                    <th style={{ ...th, textAlign: "right" }}>Taxable Amt</th>
                    <th style={{ ...th, textAlign: "right" }}>IGST</th>
                    <th style={{ ...th, textAlign: "right" }}>CGST</th>
                    <th style={{ ...th, textAlign: "right" }}>SGST</th>
                    <th style={{ ...th, textAlign: "right" }}>Total Tax</th>
                    <th style={{ ...th, textAlign: "right" }}>Net Amount</th>
                    <th style={th}></th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((inv, i) => (
                    <tr key={inv._id} onMouseEnter={e => e.currentTarget.style.background = "#f8fafc"} onMouseLeave={e => e.currentTarget.style.background = ""}>
                      <td style={{ ...td, color: "#9ca3af", fontSize: 11 }}>{i + 1}</td>
                      <td style={td}>{fmtDate(inv.invoiceDate)}</td>
                      <td style={{ ...td, color: "#4f46e5", fontWeight: 700, fontFamily: "monospace" }}>{inv.invoiceNumber}</td>
                      <td style={td}><div style={{ fontWeight: 600 }}>{inv.supplierId?.name || inv.supplierName || "—"}</div></td>
                      <td style={{ ...td, fontSize: 11, color: "#9ca3af" }}>{inv.supplierGstin || "—"}</td>
                      <td style={td}><span style={{ padding: "2px 8px", borderRadius: 8, fontSize: 11, fontWeight: 700, background: inv.gstType === "IGST" ? "#eff6ff" : "#f0fdf4", color: inv.gstType === "IGST" ? "#2563eb" : "#16a34a" }}>{inv.gstType || "SGST"}</span></td>
                      <td style={{ ...tdr, fontWeight: 600 }}>{fmtCur(inv.totalTaxableAmount || inv.totalBeforeTax)}</td>
                      <td style={tdr}>{fmtCur(inv.totalIgst)}</td>
                      <td style={tdr}>{fmtCur(inv.totalCgst)}</td>
                      <td style={tdr}>{fmtCur(inv.totalSgst)}</td>
                      <td style={{ ...tdr, color: "#7c3aed" }}>{fmtCur(inv.totalTaxAmount || inv.totalGst)}</td>
                      <td style={{ ...tdr, color: "#4f46e5", fontWeight: 800 }}>{fmtCur(inv.grandTotal)}</td>
                      <td style={{ ...td, textAlign: "center" }}><button onClick={() => navigate(PATHS.PURCHASE.INVOICE_DETAIL(inv._id))} style={{ background: "none", border: "1px solid #e2e8f0", borderRadius: 5, padding: "3px 8px", cursor: "pointer", color: "#6b7280" }}><Eye size={12} /></button></td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ background: "#1e293b", color: "#fff" }}>
                    <td colSpan={6} style={{ padding: "12px 14px", textAlign: "right", fontSize: 11, fontWeight: 700, color: "#94a3b8" }}>Totals</td>
                    <td style={{ padding: "12px 14px", textAlign: "right", fontWeight: 800 }}>{fmtCur(totals.taxable)}</td>
                    <td style={{ padding: "12px 14px", textAlign: "right" }}>{fmtCur(totals.igst)}</td>
                    <td style={{ padding: "12px 14px", textAlign: "right" }}>{fmtCur(totals.cgst)}</td>
                    <td style={{ padding: "12px 14px", textAlign: "right" }}>{fmtCur(totals.sgst)}</td>
                    <td style={{ padding: "12px 14px", textAlign: "right", color: "#c4b5fd" }}>{fmtCur(totals.tax)}</td>
                    <td style={{ padding: "12px 14px", textAlign: "right", fontWeight: 800, color: "#a5b4fc" }}>{fmtCur(totals.net)}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            )}
            {!loading && data.length === 0 && <div style={{ padding: 60, textAlign: "center", color: "#9ca3af" }}><FileText size={36} style={{ opacity: 0.2, marginBottom: 8 }} /><br />No purchase invoices found</div>}
          </div>
        )}

        {/* ────────────────────────────── GSTR-2 / ITC REGISTER ─ */}
        {tab === "gstr2" && (
          <div>
            <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 10, padding: "12px 16px", marginBottom: 16, fontSize: 13, color: "#1d4ed8" }}>
              📋 <strong>GSTR-2 / ITC Register</strong> — B2B inward supplies with Input Tax Credit details. Use for GSTR-2A reconciliation and ITC claims.
            </div>
            <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e5e7eb", overflow: "auto", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
              {loading ? <div style={{ padding: 60, textAlign: "center", color: "#9ca3af" }}>Loading...</div> : (
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: "#1d4ed8" }}>
                      {["#", "GSTIN of Supplier", "Supplier Name", "Invoice No.", "Invoice Date", "Invoice Value", "Place of Supply", "Reverse Charge", "Rate %", "Taxable Value", "IGST (ITC)", "CGST (ITC)", "SGST (ITC)", "ITC Eligible"].map(h => (
                        <th key={h} style={{ ...th, background: "#1d4ed8", color: "#bfdbfe", textAlign: ["Invoice Value","Taxable Value","IGST (ITC)","CGST (ITC)","SGST (ITC)"].includes(h) ? "right" : "left" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.flatMap((inv, i) =>
                      (inv.items || [{}]).map((it, idx) => {
                        const isIGST = inv.gstType === "IGST";
                        const taxable = it.taxableAmount || (it.qty * it.rate) || 0;
                        const igst = isIGST ? taxable * (it.taxRate || 0) / 100 : 0;
                        const cgst = !isIGST ? taxable * (it.taxRate || 0) / 200 : 0;
                        const sgst = !isIGST ? taxable * (it.taxRate || 0) / 200 : 0;
                        return (
                          <tr key={`${inv._id}-${idx}`} onMouseEnter={e => e.currentTarget.style.background = "#eff6ff"} onMouseLeave={e => e.currentTarget.style.background = ""}>
                            <td style={{ ...td, color: "#9ca3af", fontSize: 11 }}>{idx === 0 ? i + 1 : ""}</td>
                            <td style={{ ...td, fontFamily: "monospace", fontSize: 12 }}>{idx === 0 ? (inv.supplierGstin || "—") : ""}</td>
                            <td style={{ ...td, fontWeight: 600 }}>{idx === 0 ? (inv.supplierId?.name || inv.supplierName || "—") : ""}</td>
                            <td style={{ ...td, color: "#4f46e5", fontWeight: 700, fontFamily: "monospace" }}>{idx === 0 ? inv.invoiceNumber : ""}</td>
                            <td style={td}>{idx === 0 ? fmtDate(inv.invoiceDate) : ""}</td>
                            <td style={{ ...tdr, fontWeight: 700 }}>{idx === 0 ? fmtCur(inv.grandTotal) : ""}</td>
                            <td style={td}>{idx === 0 ? (inv.placeOfSupply || "—") : ""}</td>
                            <td style={{ ...td, textAlign: "center" }}>{idx === 0 ? "N" : ""}</td>
                            <td style={{ ...td, textAlign: "right", color: "#7c3aed", fontWeight: 700 }}>{it.taxRate || 0}%</td>
                            <td style={{ ...tdr, fontWeight: 600 }}>{fmtCur(taxable)}</td>
                            <td style={{ ...tdr, color: "#16a34a" }}>{fmtCur(igst)}</td>
                            <td style={{ ...tdr, color: "#16a34a" }}>{fmtCur(cgst)}</td>
                            <td style={{ ...tdr, color: "#16a34a" }}>{fmtCur(sgst)}</td>
                            <td style={{ ...td, textAlign: "center" }}><span style={{ padding: "2px 8px", borderRadius: 8, fontSize: 11, fontWeight: 700, background: "#f0fdf4", color: "#16a34a" }}>✓ Yes</span></td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: "#1e293b", color: "#fff" }}>
                      <td colSpan={9} style={{ padding: "12px 14px", textAlign: "right", fontSize: 11, fontWeight: 700, color: "#94a3b8" }}>TOTAL ITC</td>
                      <td style={{ padding: "12px 14px", textAlign: "right", fontWeight: 800 }}>{fmtCur(totals.taxable)}</td>
                      <td style={{ padding: "12px 14px", textAlign: "right", color: "#4ade80" }}>{fmtCur(totals.igst)}</td>
                      <td style={{ padding: "12px 14px", textAlign: "right", color: "#4ade80" }}>{fmtCur(totals.cgst)}</td>
                      <td style={{ padding: "12px 14px", textAlign: "right", color: "#4ade80" }}>{fmtCur(totals.sgst)}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              )}
              {!loading && data.length === 0 && <div style={{ padding: 60, textAlign: "center", color: "#9ca3af" }}>No purchase invoices found</div>}
            </div>
          </div>
        )}

        {/* ────────────────────────────── GSTR-3B ITC SUMMARY ─ */}
        {tab === "gstr3b" && (
          <div>
            <div style={{ background: "#fef3c7", border: "1px solid #fcd34d", borderRadius: 10, padding: "12px 16px", marginBottom: 16, fontSize: 13, color: "#92400e" }}>
              📋 <strong>GSTR-3B (ITC)</strong> — Input Tax Credit summary grouped by GST rate slab. Use for Table 4(A)(5) of GSTR-3B.
            </div>

            {/* ITC Summary Tiles */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14, marginBottom: 20 }}>
              {[
                { label: "Total Invoices", value: data.length, color: "#4f46e5", bg: "#f5f3ff" },
                { label: "Taxable Value", value: fmtCur(totals.taxable), color: "#0d9488", bg: "#f0fdfa" },
                { label: "ITC on IGST", value: fmtCur(totals.igst), color: "#7c3aed", bg: "#f5f3ff" },
                { label: "ITC on CGST", value: fmtCur(totals.cgst), color: "#dc2626", bg: "#fef2f2" },
                { label: "ITC on SGST", value: fmtCur(totals.sgst), color: "#d97706", bg: "#fffbeb" },
                { label: "Total ITC Claimable", value: fmtCur(totals.tax), color: "#16a34a", bg: "#f0fdf4" },
              ].map(tile => (
                <div key={tile.label} style={{ background: tile.bg, borderRadius: 10, padding: "16px 18px", border: `1px solid ${tile.color}22` }}>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: tile.color, marginBottom: 6, letterSpacing: 0.5 }}>{tile.label}</div>
                  <div style={{ fontSize: 20, fontWeight: 900, color: tile.color }}>{tile.value}</div>
                </div>
              ))}
            </div>

            {/* Rate-wise ITC Breakup */}
            <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e5e7eb", overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.06)", marginBottom: 20 }}>
              <div style={{ padding: "14px 18px", borderBottom: "1px solid #f3f4f6", fontWeight: 800, fontSize: 14 }}>Rate-wise ITC Breakup (Table 4(A)(5))</div>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    {["GST Rate Slab", "Taxable Value", "IGST (ITC)", "CGST (ITC)", "SGST (ITC)", "Total ITC"].map(h => (
                      <th key={h} style={{ ...th, textAlign: h === "GST Rate Slab" ? "left" : "right" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={6} style={{ padding: 40, textAlign: "center", color: "#9ca3af" }}>Loading...</td></tr>
                  ) : gstr3bITCGroups().map(([slab, vals]) => (
                    <tr key={slab} onMouseEnter={e => e.currentTarget.style.background = "#fef9c3"} onMouseLeave={e => e.currentTarget.style.background = ""}>
                      <td style={td}><span style={{ padding: "3px 10px", borderRadius: 8, background: "#fef3c7", color: "#92400e", fontWeight: 800, fontSize: 12 }}>{slab}</span></td>
                      <td style={{ ...tdr, fontWeight: 700 }}>{fmtCur(vals.taxable)}</td>
                      <td style={{ ...tdr, color: "#16a34a" }}>{fmtCur(vals.igst)}</td>
                      <td style={{ ...tdr, color: "#16a34a" }}>{fmtCur(vals.cgst)}</td>
                      <td style={{ ...tdr, color: "#16a34a" }}>{fmtCur(vals.sgst)}</td>
                      <td style={{ ...tdr, fontWeight: 800, color: "#16a34a" }}>{fmtCur(vals.igst + vals.cgst + vals.sgst)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ background: "#1e293b", color: "#fff" }}>
                    <td style={{ padding: "12px 14px", fontWeight: 700, fontSize: 12 }}>TOTAL ITC</td>
                    <td style={{ padding: "12px 14px", textAlign: "right", fontWeight: 800 }}>{fmtCur(totals.taxable)}</td>
                    <td style={{ padding: "12px 14px", textAlign: "right", color: "#4ade80" }}>{fmtCur(totals.igst)}</td>
                    <td style={{ padding: "12px 14px", textAlign: "right", color: "#4ade80" }}>{fmtCur(totals.cgst)}</td>
                    <td style={{ padding: "12px 14px", textAlign: "right", color: "#4ade80" }}>{fmtCur(totals.sgst)}</td>
                    <td style={{ padding: "12px 14px", textAlign: "right", fontWeight: 800, color: "#4ade80" }}>{fmtCur(totals.tax)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
