import React, { useEffect, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  getSalesOrderById,
  cancelSalesOrder,
  restoreSalesOrder,
  generateProductionSheet,
} from "@/services/salesApi";
import { sendOrder as sendOrderApi } from "@/services/communicationApi";
import { getCompanyProfile } from "@/services/settingsApi";
import { useAuth } from "@/hooks/useAuth";
import { PATHS } from "@/routes/paths";
import toast from "react-hot-toast";
import CommunicationModal from "@/components/communication/CommunicationModal";
import { Mail, MessageSquare, Send } from "lucide-react";
import { BrandedLoader } from "@/components/ui";
import SalesOrderPrintDocument from "@/features/sales/print/SalesOrderPrintDocument";
import { getActivePrintFormat } from "@/services/printFormatApi";
import CreateTaxInvoiceFromSoModal from "@/features/sales/components/CreateTaxInvoiceFromSoModal";

const STATUS_COLORS = {
  Draft: { color: "#64748b", bg: "#f1f5f9", border: "#e2e8f0" },
  Confirmed: { color: "#2563eb", bg: "#eff6ff", border: "#93c5fd" },
  Dispatched: { color: "#d97706", bg: "#fffbeb", border: "#fcd34d" },
  Invoiced: { color: "#059669", bg: "#f0fdf4", border: "#6ee7b7" },
  "Partially Invoiced": { color: "#7c3aed", bg: "#f5f3ff", border: "#c4b5fd" },
  Closed: { color: "#16a34a", bg: "#f0fdf4", border: "#86efac" },
  Cancelled: { color: "#dc2626", bg: "#fef2f2", border: "#fca5a5" },
};
const th = {
  padding: "9px 14px",
  textAlign: "left",
  color: "#6b7280",
  fontWeight: 600,
  borderBottom: "2px solid #e5e7eb",
  fontSize: 12,
  textTransform: "uppercase",
  background: "#f9fafb",
};
const td = {
  padding: "10px 14px",
  fontSize: 13,
  borderBottom: "1px solid #f3f4f6",
  color: "#374151",
};

export default function SalesOrderDetailPage() {
  const { user } = useAuth();
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const stayForPrintView = searchParams.get("view") === "print";
  const [so, setSO] = useState(null);
  const [company, setCompany] = useState({});
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [isCommModalOpen, setIsCommModalOpen] = useState(false);
  const [activePrintFormat, setActivePrintFormat] = useState(null);
  const [showCreateInvoiceModal, setShowCreateInvoiceModal] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      getSalesOrderById(id),
      getCompanyProfile().catch(() => ({ data: {} })),
      getActivePrintFormat("Sales Order").catch(() => null),
    ])
      .then(([soRes, companyRes, formatRes]) => {
        setSO(soRes);
        setCompany(companyRes?.data || {});
        // API may return null; also accept bare format object
        const fmt = formatRes && formatRes._id ? formatRes : (formatRes?.data?._id ? formatRes.data : formatRes);
        setActivePrintFormat(fmt && fmt.layout ? fmt : null);
        if (typeof window !== "undefined" && window.localStorage?.getItem("debugSoPrint") === "1") {
          // eslint-disable-next-line no-console
          console.log("[SO Print] active format", fmt ? { id: fmt._id, name: fmt.name, status: fmt.status, isDefault: fmt.isDefault, blocks: Object.keys(fmt.layout?.blocks || {}).length } : null);
        }
      })
      .catch(() => toast.error("Failed to load"))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!so || loading || stayForPrintView) return;
    // Only Draft is editable. Confirmed/etc must stay on detail — otherwise
    // detail→edit→"cannot be edited"→detail loops and spams toasts.
    if (so.status === "Draft" && !so.invoiceId) {
      navigate(`/sales/orders/${id}/edit`, { replace: true });
    }
  }, [so, loading, stayForPrintView, id, navigate]);

  const fmt = (d) =>
    d ? new Date(d).toLocaleDateString('en-GB', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric'
        }) : "—";
  const fmtCur = (n) => `₹${(n || 0).toLocaleString("en-IN")}`;

  const handleGeneratePS = async () => {
    setGenerating(true);
    try {
      const res = await generateProductionSheet(id);
      toast.success(res.message || "Production sheet generated!");
      navigate(PATHS.SALES.PRODUCTION_SHEET(res.data._id));
    } catch (e) {
      toast.error(e.response?.data?.message || "Failed");
    } finally {
      setGenerating(false);
    }
  };


  const handleCancel = async () => {
    if (!window.confirm("Cancel this Sales Order?")) return;
    setCancelling(true);
    try {
      await cancelSalesOrder(id);
      toast.success("Cancelled");
      load();
    } catch (e) {
      toast.error(e.response?.data?.message || "Failed");
    } finally {
      setCancelling(false);
    }
  };

  const handleRestore = async () => {
    if (!window.confirm("Are you sure you want to restore this cancelled order? Status will be set back to Confirmed.")) return;
    try {
      await restoreSalesOrder(id);
      toast.success("Sales Order restored successfully");
      load();
    } catch (e) {
      toast.error(e.response?.data?.message || "Failed to restore");
    }
  };

  const handleSendComm = async (commData) => {
    const payload = { ...commData, id, type: "Sales Order" };
    toast.promise(sendOrderApi(payload), {
      loading: `Sending ${commData.channel}...`,
      success: `✅ ${commData.channel} sent successfully!`,
      error: (err) =>
        err.response?.data?.message || `Failed to send ${commData.channel}.`,
    }).then(() => {
      // Close modal only on success
      setIsCommModalOpen(false);
    }).catch(() => {
      // Stay open on error so user can retry
    });
  };

  /** Print outside app-shell so sidebar/flex never squeezes A4 (fixes Render left-squeeze). */
  const handlePrint = useCallback(() => {
    document.body.classList.add("so-printing");
    const cleanup = () => {
      document.body.classList.remove("so-printing");
      window.removeEventListener("afterprint", cleanup);
    };
    window.addEventListener("afterprint", cleanup);
    window.setTimeout(() => {
      window.print();
      window.setTimeout(cleanup, 2000);
    }, 50);
  }, []);

  if (loading)
    return <BrandedLoader size={120} />;
  if (!so)
    return (
      <div
        style={{
          padding: 60,
          textAlign: "center",
          color: "#dc2626",
          background: "#f8f9fa",
          minHeight: "100vh",
          fontFamily: "'Inter',sans-serif",
        }}
      >
        Sales Order not found.
      </div>
    );

  const sc = STATUS_COLORS[so.status] || STATUS_COLORS.Draft;
  const notCancelled = so.status !== "Cancelled";
  const isDraft = so.status === "Draft";
  const billingState = so.billingState || {
    hasActiveInvoices: so.status === "Partially Invoiced" || so.status === "Invoiced",
    anyInvoiced: so.status === "Partially Invoiced" || so.status === "Invoiced",
    fullyInvoiced: so.status === "Invoiced",
    lines: [],
    activeInvoices: [],
  };
  const billingLineById = new Map(
    (billingState.lines || []).map((line) => [String(line.lineId), line]),
  );
  const activeInvoices = billingState.activeInvoices || [];
  const isInvoiceLocked = billingState.fullyInvoiced;
  const gstApplicable = so.gstApplicable !== false;

  return (
    <div
      style={{
        fontFamily: "'Inter',sans-serif",
        background: "#f8f9fa",
        minHeight: "100vh",
        color: "#1e293b",
      }}
    >
      {/* PRINT ONLY — portaled to body so app-shell flex/sidebar cannot shrink A4 */}
      {typeof document !== "undefined"
        && createPortal(
          <div className="so-print-portal" data-so-print-portal="1">
            <SalesOrderPrintDocument
              so={so}
              company={company}
              user={user}
              printFormat={activePrintFormat}
              mode="print"
              visible={false}
              className="print-only"
            />
          </div>,
          document.body,
        )}

      {/* Application Section (Screen Only) */}
      <div className="no-print">
        {/* Application Header */}
        <div
          data-no-print
          style={{
            background: "#fff",
            borderBottom: "1px solid #e5e7eb",
            padding: "14px 28px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
          }}
        >
          <button
            onClick={() => navigate(PATHS.SALES.ORDERS)}
            style={{
              background: "none",
              border: "none",
              color: "#9ca3af",
              fontSize: 13,
              cursor: "pointer",
              padding: 0,
              marginBottom: 8,
            }}
          >
            ← Sales Orders
          </button>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 12,
            }}
          >
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <h2 style={{ margin: 0, fontSize: "20pt", fontWeight: 900 }}>
                  {so.seriesId?.isEstimate ? "ESTIMATE" : "SALES ORDER"}
                </h2>
                <span
                  style={{
                    padding: "3px 12px",
                    borderRadius: 20,
                    fontSize: 12,
                    fontWeight: 700,
                    background: sc.bg,
                    color: sc.color,
                    border: `1px solid ${sc.border}`,
                  }}
                >
                  {so.status}
                </span>
                <span
                  style={{
                    padding: "3px 12px",
                    borderRadius: 20,
                    fontSize: 12,
                    fontWeight: 600,
                    background:
                      so.paymentType === "Cash" ? "#f0fdf4" : "#fffbeb",
                    color: so.paymentType === "Cash" ? "#16a34a" : "#d97706",
                    border: `1px solid ${so.paymentType === "Cash" ? "#86efac" : "#fcd34d"}`,
                  }}
                >
                  {so.paymentType}
                </span>
              </div>
              <div style={{ color: "#9ca3af", fontSize: 13, marginTop: 4 }}>
                <strong style={{ color: "#374151" }}>
                  {so.customerCode || "—"}
                </strong>{" "}
                · {so.customerName} · <span style={{ color: so.orderCategory === 'Replacement' ? '#dc2626' : 'inherit', fontWeight: so.orderCategory === 'Replacement' ? 700 : 'normal' }}>{so.orderCategory}</span>
              </div>
              {so.orderCategory === 'Replacement' && so.warrantyDetails && (
                <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', padding: '8px 12px', borderRadius: 8, marginTop: 8, fontSize: 13, color: '#991b1b' }}>
                  <strong>Warranty Details:</strong> {so.warrantyDetails}
                </div>
              )}
              <div style={{ color: "#9ca3af", fontSize: 13, marginTop: 2 }}>
                Date: {fmt(so.soDate)} · Delivery: {fmt(so.deliveryDate)}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                onClick={() => setIsCommModalOpen(true)}
                style={{
                  padding: "9px 16px",
                  background: "#25d366",
                  color: "#fff",
                  border: "none",
                  borderRadius: 8,
                  cursor: "pointer",
                  fontWeight: 700,
                  fontSize: 13,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  boxShadow: "0 2px 8px rgba(37,211,102,0.3)",
                }}
              >
                <MessageSquare size={16} /> Send WhatsApp
              </button>
              <button
                onClick={() => setIsCommModalOpen(true)}
                style={{
                  padding: "9px 16px",
                  background: "#ea4335",
                  color: "#fff",
                  border: "none",
                  borderRadius: 8,
                  cursor: "pointer",
                  fontWeight: 700,
                  fontSize: 13,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  boxShadow: "0 2px 8px rgba(234,67,53,0.3)",
                }}
              >
                <Mail size={16} /> Send Email
              </button>
              {notCancelled && !so.productionSheetId && (
                <button
                  onClick={handleGeneratePS}
                  disabled={generating}
                  style={{
                    padding: "9px 16px",
                    background: "#7c3aed",
                    color: "#fff",
                    border: "none",
                    borderRadius: 8,
                    cursor: "pointer",
                    fontWeight: 700,
                    fontSize: 13,
                  }}
                >
                  🖨️{" "}
                  {generating ? "Generating..." : "Generate Production Sheet"}
                </button>
              )}
              {so.productionSheetId && (
                <button
                  onClick={() =>
                    navigate(PATHS.SALES.PRODUCTION_SHEET(so.productionSheetId))
                  }
                  style={{
                    padding: "9px 16px",
                    background: "#f1f5f9",
                    border: "1px solid #7c3aed",
                    borderRadius: 8,
                    cursor: "pointer",
                    fontWeight: 700,
                    fontSize: 13,
                    color: "#7c3aed",
                  }}
                >
                  📋 View Production Sheet
                </button>
              )}
              {(so.status === "Draft" || so.status === "Confirmed" || so.status === "Partially Invoiced" || so.status === "Dispatched") && !isInvoiceLocked && (
                <button
                  onClick={() => setShowCreateInvoiceModal(true)}
                  style={{
                    padding: "9px 16px",
                    background: "#0d9488",
                    color: "#fff",
                    border: "none",
                    borderRadius: 8,
                    cursor: "pointer",
                    fontWeight: 700,
                    fontSize: 13,
                    boxShadow: "0 2px 8px rgba(13,148,136,0.3)",
                  }}
                >
                  🧾 Create Tax Invoice
                </button>
              )}
              <button
                onClick={handlePrint}
                style={{
                  padding: "9px 14px",
                  background: "#f1f5f9",
                  color: "#374151",
                  border: "1px solid #e2e8f0",
                  borderRadius: 8,
                  cursor: "pointer",
                  fontWeight: 600,
                  fontSize: 13,
                }}
              >
                🖨️ Print
              </button>
              {isDraft && (user?.roleName === "admin" || user?.roleName === "superadmin") && (
                <button
                  onClick={handleCancel}
                  disabled={cancelling}
                  style={{
                    padding: "9px 14px",
                    background: "#fef2f2",
                    color: "#dc2626",
                    border: "1px solid #fca5a5",
                    borderRadius: 8,
                    cursor: "pointer",
                    fontWeight: 600,
                    fontSize: 13,
                  }}
                >
                  ✕ Cancel
                </button>
              )}
              {so.status === "Cancelled" && (user?.roleName === "admin" || user?.roleName === "superadmin") && (
                <button
                  onClick={handleRestore}
                  style={{
                    padding: "9px 16px",
                    background: "#0ea5e9",
                    color: "#fff",
                    border: "none",
                    borderRadius: 8,
                    cursor: "pointer",
                    fontWeight: 700,
                    fontSize: 13,
                    boxShadow: "0 2px 8px rgba(14,165,233,0.3)",
                  }}
                >
                  ↺ Restore Order
                </button>
              )}
            </div>
          </div>
        </div>

        <div style={{ padding: "24px 28px" }}>
          {billingState.anyInvoiced && (
            <div
              style={{
                background: isInvoiceLocked ? "#fef2f2" : "#fff7ed",
                border: `1px solid ${isInvoiceLocked ? "#fca5a5" : "#fdba74"}`,
                color: isInvoiceLocked ? "#991b1b" : "#9a3412",
                borderRadius: 10,
                padding: "14px 16px",
                marginBottom: 18,
              }}
            >
              <div style={{ fontWeight: 800, fontSize: 14 }}>
                {isInvoiceLocked
                  ? `This Sales Order is locked because Tax Invoice ${activeInvoices[0]?.invoiceNumber || ""} has been created.`
                  : "This Sales Order is partially invoiced. Only safe remaining-quantity and non-financial details may be updated."}
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10 }}>
                {activeInvoices.map((invoice) => (
                  <button
                    key={invoice._id}
                    onClick={() => navigate(PATHS.SALES.INVOICE_DETAIL(invoice._id))}
                    style={{
                      padding: "7px 10px",
                      background: "#fff",
                      color: "#334155",
                      border: "1px solid #cbd5e1",
                      borderRadius: 7,
                      cursor: "pointer",
                      fontSize: 12,
                      fontWeight: 700,
                    }}
                  >
                    View {invoice.invoiceNumber || "Tax Invoice"} · {fmt(invoice.invoiceDate)}
                  </button>
                ))}
              </div>
            </div>
          )}
          {/* Summary Cards */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))",
              gap: 12,
              marginBottom: 24,
            }}
          >
            {[
              [
                "Grand Total",
                fmtCur(so.roundedTotal || so.grandTotal),
                "#16a34a",
              ],
              ["Total Items", `${so.items?.length || 0} items`, "#2563eb"],
              gstApplicable ? ["GST Type", so.gstType || "—", "#6b7280"] : null,
              ["Customer PO", so.customerPO || "—", "#6b7280"],
            ]
              .filter(Boolean)
              .map(([k, v, c]) => (
                <div
                  key={k}
                  style={{
                    background: "#fff",
                    border: "1px solid #e5e7eb",
                    borderRadius: 10,
                    padding: 16,
                    boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
                  }}
                >
                  <div
                    style={{
                      fontSize: 11,
                      color: "#9ca3af",
                      fontWeight: 600,
                      textTransform: "uppercase",
                    }}
                  >
                    {k}
                  </div>
                  <div
                    style={{
                      fontSize: 18,
                      fontWeight: 700,
                      color: c,
                      marginTop: 4,
                    }}
                  >
                    {v}
                  </div>
                </div>
              ))}
            <div
              style={{
                background: "#fff",
                border: "1px solid #e5e7eb",
                borderRadius: 10,
                padding: 16,
                boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  color: "#9ca3af",
                  fontWeight: 600,
                  textTransform: "uppercase",
                }}
              >
                Sticker / Label
              </div>
              <div
                style={{
                  fontSize: 18,
                  fontWeight: 700,
                  color: "#7c3aed",
                  marginTop: 4,
                }}
              >
                {so.stickerType || "—"}
              </div>
            </div>
          </div>

          {/* Customer Info */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 16,
              marginBottom: 20,
            }}
          >
            {[
              ["Billing Address", so.billingAddress],
              ["Shipping Address", so.shippingAddress],
            ].map(([title, addr]) => (
              <div
                key={title}
                style={{
                  background: "#fff",
                  border: "1px solid #e5e7eb",
                  borderRadius: 10,
                  padding: 16,
                  boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    color: "#9ca3af",
                    fontWeight: 600,
                    textTransform: "uppercase",
                    marginBottom: 6,
                  }}
                >
                  {title}
                </div>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: "#1e293b",
                    marginBottom: 4,
                  }}
                >
                  {so.customerName}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: "#6b7280",
                    fontWeight: 600,
                    marginBottom: 4,
                  }}
                >
                  Customer Code: {so.customerCode || "—"}
                </div>
                {gstApplicable && so.customerGstin && (
                  <div style={{ fontSize: 12, color: "#6b7280" }}>
                    GSTIN: {so.customerGstin}
                  </div>
                )}
                {addr && (
                  <div
                    style={{
                      fontSize: 12,
                      color: "#6b7280",
                      marginTop: 4,
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    {addr}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Items Table */}
          <div
            style={{
              background: "#fff",
              border: "1px solid #e5e7eb",
              borderRadius: 12,
              overflow: "hidden",
              boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
              marginBottom: 20,
            }}
          >
            <div
              style={{
                padding: "14px 20px",
                borderBottom: "1px solid #f3f4f6",
              }}
            >
              <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>
                Order Items
              </h2>
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {[
                    "Sr",
                    "Item Code",
                    "Description",
                    "Additional Notes",
                    "HSN",
                    "UOM",
                    "Qty",
                    "Rate",
                    gstApplicable ? "GST%" : null,
                    "Amount",
                  ]
                    .filter(Boolean)
                    .map((h) => (
                      <th key={h} style={th}>
                        {h}
                      </th>
                    ))}
                </tr>
              </thead>
              <tbody>
                {(so.items || []).map((item, i) => {
                  const lineBilling = billingLineById.get(String(item._id || ""));
                  return (
                  <tr
                    key={i}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.background = "#f8f9fa")
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.background = "transparent")
                    }
                  >
                    <td style={{ ...td, color: "#9ca3af" }}>{i + 1}</td>
                    <td style={td}>{item.itemCode || "—"}</td>
                    <td style={td}>
                      <div style={{ fontWeight: 500, color: "#1e293b" }}>
                        {item.description || item.itemName}
                      </div>
                    </td>
                    <td style={{ ...td, fontSize: 11, color: "#6b7280" }}>
                      {item.additionalNotes || "—"}
                    </td>
                    <td style={{ ...td, color: "#6b7280" }}>
                      {item.hsnCode || "—"}
                    </td>
                    <td style={td}>{item.uom}</td>
                    <td style={{ ...td, color: "#2563eb", fontWeight: 600 }}>
                      <div>{item.qty}</div>
                      {lineBilling?.invoicedQty > 0 && (
                        <div style={{ fontSize: 10, color: "#7c3aed", marginTop: 3, whiteSpace: "nowrap" }}>
                          Invoiced {lineBilling.invoicedQty} · Balance {lineBilling.remainingQty}
                        </div>
                      )}
                    </td>
                    <td style={td}>₹{item.rate}</td>
                    {gstApplicable && (
                      <td style={{ ...td, color: "#6b7280" }}>
                        {item.gstRate}%
                      </td>
                    )}
                    <td style={{ ...td, color: "#16a34a", fontWeight: 700 }}>
                      ₹
                      {(
                        item.amount ||
                        item.qty * item.rate ||
                        0
                      ).toLocaleString("en-IN")}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
            {/* Totals Footer */}
            <div
              className="p-footer"
              style={{
                padding: "16px 20px",
                display: "flex",
                justifyContent: "flex-end",
                borderTop: "1px solid #f3f4f6",
              }}
            >
              <div style={{ minWidth: 280 }}>
                {[
                  ["Total Item Amount", fmtCur(so.totalAmount)],
                  ...(Number(so.freightAmount || 0) > 0
                    ? [["Freight (Taxable)", fmtCur(so.freightAmount)]]
                    : []),
                  ["Total Taxable Amount", fmtCur(so.totalTaxableAmount ?? ((Number(so.totalAmount) || 0) + (Number(so.freightAmount) || 0)))],
                  ...(gstApplicable
                    ? so.gstType === "IGST"
                      ? [["IGST", fmtCur(so.totalIgst || so.totalGst)]]
                      : [
                          ["CGST", fmtCur(so.totalCgst)],
                          ["SGST", fmtCur(so.totalSgst)],
                          ["Total Tax", fmtCur(so.totalGst)],
                        ]
                    : []),
                  ["Round Off", fmtCur(so.roundOff)],
                ]
                  .filter(([, v]) => v !== "₹0")
                  .map(([k, v]) => (
                    <div
                      key={k}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        marginBottom: 6,
                        fontSize: 13,
                        color: "#6b7280",
                      }}
                    >
                      <span>{k}</span>
                      <span>{v}</span>
                    </div>
                  ))}
                <div
                  style={{
                    borderTop: "1px solid #e5e7eb",
                    paddingTop: 8,
                    display: "flex",
                    justifyContent: "space-between",
                    fontWeight: 800,
                    fontSize: 18,
                    color: "#16a34a",
                  }}
                >
                  <span>Grand Total</span>
                  <span>{fmtCur(so.roundedTotal || so.grandTotal)}</span>
                </div>
                <div
                  style={{
                    marginTop: 6,
                    fontSize: 11,
                    color: "#9ca3af",
                    fontStyle: "italic",
                    textTransform: "capitalize",
                  }}
                >
                  {so.amountInWords}
                </div>
              </div>
            </div>
          </div>

          {/* Remarks */}
          {so.remarks && (
            <div
              style={{
                background: "#fff",
                border: "1px solid #e5e7eb",
                borderRadius: 10,
                padding: 16,
                boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  color: "#9ca3af",
                  fontWeight: 600,
                  textTransform: "uppercase",
                  marginBottom: 6,
                }}
              >
                Remarks
              </div>
              <div style={{ fontSize: 13, color: "#374151" }}>{so.remarks}</div>
            </div>
          )}
        </div>
      </div>

      {/* Sales Order print — body portal; hide everything else under @media print */}
      <style>{`
                .so-print-portal {
                    display: none;
                }
                @media print {
                    @page { size: A4 portrait; margin: 0 !important; }
                    html, body {
                        margin: 0 !important;
                        padding: 0 !important;
                        width: 100% !important;
                        height: auto !important;
                        overflow: visible !important;
                        background: #fff !important;
                        -webkit-print-color-adjust: exact;
                        print-color-adjust: exact;
                        zoom: 1 !important;
                        transform: none !important;
                    }
                    /* Hide entire SPA chrome; only body-level print portal remains */
                    body.so-printing > *:not(.so-print-portal),
                    body > #root,
                    body > *:not(.so-print-portal):not(script):not(style) {
                        display: none !important;
                    }
                    body > .so-print-portal,
                    .so-print-portal {
                        display: block !important;
                        position: static !important;
                        left: 0 !important;
                        top: 0 !important;
                        width: 210mm !important;
                        max-width: 210mm !important;
                        margin: 0 !important;
                        padding: 0 !important;
                        background: #fff !important;
                        visibility: visible !important;
                    }
                    .so-print-portal .so-print-root.print-only,
                    .so-print-portal .so-print-root {
                        display: block !important;
                        position: static !important;
                        width: 210mm !important;
                        min-width: 210mm !important;
                        max-width: 210mm !important;
                        margin: 0 !important;
                        padding: 0 !important;
                        box-sizing: border-box !important;
                        transform: none !important;
                        zoom: 1 !important;
                        background: #fff !important;
                        box-shadow: none !important;
                        visibility: visible !important;
                    }
                    .so-print-portal .so-print-root .print-content {
                        width: 210mm !important;
                        max-width: 210mm !important;
                        height: 297mm !important;
                        min-height: 297mm !important;
                        max-height: 297mm !important;
                        margin: 0 !important;
                        box-sizing: border-box !important;
                        background: #fff !important;
                        overflow: hidden !important;
                        transform: none !important;
                        zoom: 1 !important;
                        page-break-after: always;
                        break-after: page;
                    }
                    .so-print-portal .so-print-root .print-content:last-child {
                        page-break-after: auto !important;
                        break-after: auto !important;
                    }
                    .so-print-portal .so-print-root .print-content.pf-block-layout-root {
                        display: block !important;
                        position: relative !important;
                        flex-direction: unset !important;
                    }
                    .so-print-portal .so-print-root .print-content:not(.pf-block-layout-root) {
                        display: flex !important;
                        flex-direction: column !important;
                        padding: 10mm !important;
                    }
                    .so-print-portal .so-print-root [data-pf-block] {
                        overflow: visible !important;
                    }
                    .so-print-portal .so-print-root .print-items-table {
                        width: 100% !important;
                        table-layout: fixed !important;
                    }
                    .so-print-portal .so-print-root .print-items-table th,
                    .so-print-portal .so-print-root .print-items-table td {
                        word-wrap: break-word;
                        overflow-wrap: break-word;
                    }
                    .so-print-portal .so-print-root .print-items-table [data-pf-col="sr"],
                    .so-print-portal .so-print-root .print-items-table [data-pf-col="hsn"],
                    .so-print-portal .so-print-root .print-items-table [data-pf-col="qty"],
                    .so-print-portal .so-print-root .print-items-table [data-pf-col="rate"],
                    .so-print-portal .so-print-root .print-items-table [data-pf-col="amount"] {
                        white-space: nowrap !important;
                        overflow-wrap: normal !important;
                        word-break: keep-all !important;
                        word-wrap: normal !important;
                    }
                }
            `}</style>

      <CommunicationModal
        isOpen={isCommModalOpen}
        onClose={() => setIsCommModalOpen(false)}
        onSend={handleSendComm}
        type="Sales Order"
        data={{
          recipientName: so.customerName,
          email: so.customerEmail,
          phone: so.customerPhone,
          customerId: so.customerId,
          number: so.soNumber,
          id: id,
          items: so.items,
          total: so.roundedTotal || so.grandTotal,
        }}
      />

      <CreateTaxInvoiceFromSoModal
        open={showCreateInvoiceModal}
        so={so}
        onClose={() => setShowCreateInvoiceModal(false)}
      />
    </div>
  );
}
