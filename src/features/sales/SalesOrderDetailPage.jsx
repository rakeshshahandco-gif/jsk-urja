import React, { useEffect, useState, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
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
  const [so, setSO] = useState(null);
  const [company, setCompany] = useState({});
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [isCommModalOpen, setIsCommModalOpen] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      getSalesOrderById(id),
      getCompanyProfile().catch(() => ({ data: {} })),
    ])
      .then(([soRes, companyRes]) => {
        setSO(soRes);
        setCompany(companyRes?.data || {});
      })
      .catch(() => toast.error("Failed to load"))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

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
  const isIGST = so.gstType === "IGST";
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
      {/* PRINT ONLY LAYOUT */}
      <div className="print-only" style={{ display: "none", width: "210mm", padding: 0 }}>
        {(() => {
          const items = so.items || [];
          const itemsPerPageFirst = 7;
          const itemsPerPageOthers = 15;
          const pages = [];
          if (items.length <= itemsPerPageFirst) {
              pages.push(items);
          } else {
              pages.push(items.slice(0, itemsPerPageFirst));
              let remaining = items.slice(itemsPerPageFirst);
              while (remaining.length > 0) {
                  pages.push(remaining.slice(0, itemsPerPageOthers));
                  remaining = remaining.slice(itemsPerPageOthers);
              }
          }
          return pages.map((pageItems, pageIdx) => {
             const isFirstPage = pageIdx === 0;
             const isLastPage = pageIdx === pages.length - 1;
             const totalPages = pages.length;
             return (
               <div key={pageIdx} className="print-content" style={{ 
                 pageBreakAfter: isLastPage ? 'auto' : 'always', position: 'relative',
                 padding: "10mm", minHeight: "270mm", display: "flex", flexDirection: "column", background: "#fff", boxSizing: "border-box" 
               }}>
                 <div style={{ position: 'absolute', bottom: '5mm', right: '10mm', fontSize: '8pt', color: '#666' }}>
                     Page {pageIdx + 1} of {totalPages}
                 </div>
                 {isFirstPage ? (
                 <>
          {/* Header Section */}
          <div
            className="p-header"
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              marginBottom: "20px",
            }}
          >
            <div
              style={{ display: "flex", gap: "20px", alignItems: "flex-start" }}
            >
                <img
                  src="/logo.jpeg"
                  alt="Logo"
                  style={{
                    maxHeight: "80px",
                    maxWidth: "120px",
                    objectFit: "contain",
                  }}
                />
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    fontSize: "20pt",
                    fontWeight: 900,
                    color: "#000",
                    marginBottom: "2px",
                    lineHeight: 1.1,
                  }}
                >
                  {company.companyName || "JSK URJA"}
                </div>
                <div
                  style={{
                    fontSize: "9pt",
                    color: "#000",
                    lineHeight: "1.3",
                    maxWidth: "450px",
                  }}
                >
                  {company.address}
                  <br />
                  {company.city || company.state
                    ? `${company.city} ${company.state}, India. Postal Code: ${company.pincode}. State Code: ${company.stateCode || ""}`
                    : ""}
                  <br />
                  {(company.phone || company.email) &&
                    `Phone: ${company.phone || ""} Email: ${company.email || ""}`}
                  <br />
                  {gstApplicable && company.gstNumber && (
                    <strong>GSTIN: {company.gstNumber}</strong>
                  )}
                </div>
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <h1
                style={{
                  margin: "0 0 2px 0",
                  fontSize: "16pt",
                  fontWeight: 900,
                  textTransform: "uppercase",
                  color: "#64748b",
                }}
              >
                {so.seriesId?.isEstimate ? "ESTIMATE" : "SALES ORDER"}
              </h1>
              {!gstApplicable && (
                <div
                  style={{
                    fontSize: "10pt",
                    fontWeight: 700,
                    marginBottom: "4px",
                  }}
                >
                  (NON-GST)
                </div>
              )}
              <div
                style={{ fontSize: "14pt", fontWeight: 700, color: "#334155" }}
              >
                {so.soNumber}
              </div>
            </div>
          </div>

          <div
            style={{ borderBottom: "1.5px solid #000", marginBottom: "20px" }}
          ></div>

          {/* Info Block (Parties & Order Details) */}
          <div
            className="p-summary"
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: "40px",
              marginBottom: "20px",
            }}
          >
            <div style={{ flex: 1 }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <tbody>
                  <tr>
                    <td
                      style={{
                        width: "120px",
                        fontSize: "11pt",
                        fontWeight: 800,
                        padding: "4px 0",
                        verticalAlign: "top",
                      }}
                    >
                      Customer Name:
                    </td>
                    <td
                      style={{
                        fontSize: "11pt",
                        fontWeight: 800,
                        padding: "4px 0",
                        textTransform: "uppercase",
                      }}
                    >
                      {so.customerName
                        ? so.customerName.replace(
                            new RegExp(`\\s*\\(${so.customerGstin}\\)$`),
                            "",
                          )
                        : ""}
                    </td>
                  </tr>
                  <tr>
                    <td
                      style={{
                        fontSize: "10pt",
                        fontWeight: 800,
                        padding: "8px 0 4px 0",
                        verticalAlign: "top",
                      }}
                    >
                      Address:
                    </td>
                    <td
                      style={{
                        fontSize: "10pt",
                        padding: "8px 0 4px 0",
                        lineHeight: 1.4,
                        color: "#333",
                      }}
                    >
                      {so.billingAddress || so.shippingAddress || "—"}
                    </td>
                  </tr>
                  {(so.customerState || so.customerStateCode) && (
                    <tr>
                      <td
                        style={{
                          fontSize: "10pt",
                          fontWeight: 800,
                          padding: "4px 0",
                          verticalAlign: "top",
                        }}
                      >
                        State:
                      </td>
                      <td
                        style={{
                          fontSize: "10pt",
                          padding: "4px 0",
                          color: "#333",
                        }}
                      >
                        {so.customerState || ""}{" "}
                        {so.customerStateCode
                          ? `(${so.customerStateCode})`
                          : ""}
                      </td>
                    </tr>
                  )}
                  {so.customerPhone && (
                    <tr>
                      <td
                        style={{
                          fontSize: "10pt",
                          fontWeight: 800,
                          padding: "4px 0",
                          verticalAlign: "top",
                        }}
                      >
                        Contact No:
                      </td>
                      <td
                        style={{
                          fontSize: "10pt",
                          padding: "4px 0",
                          color: "#333",
                        }}
                      >
                        {so.customerPhone}
                      </td>
                    </tr>
                  )}
                  {so.customerEmail && (
                    <tr>
                      <td
                        style={{
                          fontSize: "10pt",
                          fontWeight: 800,
                          padding: "4px 0",
                          verticalAlign: "top",
                        }}
                      >
                        Email ID:
                      </td>
                      <td
                        style={{
                          fontSize: "10pt",
                          padding: "4px 0",
                          color: "#333",
                        }}
                      >
                        {so.customerEmail}
                      </td>
                    </tr>
                  )}
                  {gstApplicable && so.customerGstin && (
                    <tr>
                      <td
                        style={{
                          fontSize: "10pt",
                          fontWeight: 800,
                          padding: "4px 0",
                          verticalAlign: "top",
                        }}
                      >
                        GST No:
                      </td>
                      <td
                        style={{
                          fontSize: "10pt",
                          padding: "4px 0",
                          color: "#333",
                        }}
                      >
                        {so.customerGstin}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div style={{ width: "300px" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <tbody>
                  <tr>
                    <td
                      style={{
                        fontSize: "10pt",
                        fontWeight: 800,
                        padding: "4px 0",
                        width: "140px",
                      }}
                    >
                      Date:
                    </td>
                    <td style={{ fontSize: "10pt", padding: "4px 0" }}>
                      {fmt(so.soDate)}
                    </td>
                  </tr>
                    <tr>
                    <td
                      style={{
                        fontSize: "10pt",
                        fontWeight: 800,
                        padding: "4px 0",
                      }}
                    >
                      Order Category:
                    </td>
                    <td style={{ fontSize: "10pt", padding: "4px 0" }}>
                      {so.orderCategory || "Order"}
                    </td>
                  </tr>
                  {so.orderCategory === 'Replacement' && so.warrantyDetails && (
                    <tr>
                      <td
                        style={{
                          fontSize: "10pt",
                          fontWeight: 800,
                          padding: "4px 0",
                          verticalAlign: "top",
                          color: "#dc2626"
                        }}
                      >
                        Warranty Details:
                      </td>
                      <td style={{ fontSize: "10pt", padding: "4px 0", color: "#dc2626", fontWeight: 700 }}>
                        {so.warrantyDetails}
                      </td>
                    </tr>
                  )}
                  <tr>
                    <td
                      style={{
                        fontSize: "10pt",
                        fontWeight: 800,
                        padding: "4px 0",
                      }}
                    >
                      Delivery Date:
                    </td>
                    <td style={{ fontSize: "10pt", padding: "4px 0" }}>
                      {fmt(so.deliveryDate)}
                    </td>
                  </tr>
                  <tr>
                    <td
                      style={{
                        fontSize: "10pt",
                        fontWeight: 800,
                        padding: "4px 0",
                        verticalAlign: "top",
                      }}
                    >
                      Customer&apos;s
                      <br />
                      Purchase Order:
                    </td>
                    <td
                      style={{
                        fontSize: "10pt",
                        padding: "4px 0",
                        verticalAlign: "top",
                      }}
                    >
                      {so.customerPO || "VERBAL"}
                    </td>
                  </tr>
                  <tr>
                    <td
                      style={{
                        fontSize: "10pt",
                        fontWeight: 800,
                        padding: "4px 0",
                      }}
                    >
                      Customer&apos;s
                      <br />
                      PO Date:
                    </td>
                    <td style={{ fontSize: "10pt", padding: "4px 0" }}>
                      {fmt(so.customerPODate || so.soDate)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          </>
          ) : (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', borderBottom: '1px solid #000', paddingBottom: '5px' }}>
                <div style={{ fontSize: '14pt', fontWeight: 900, textTransform: 'uppercase' }}>{company.companyName || "JSK URJA"}</div>
                <div style={{ textAlign: 'right', fontSize: '9pt' }}>
                    <strong>Order No:</strong> {so.soNumber} | <strong>Date:</strong> {fmt(so.soDate)}
                </div>
            </div>
          )}

          {/* Items Table */}
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: "11px",
              marginBottom: "auto",
              border: "1px solid #000",
            }}
          >
            <thead style={{ background: "#f5f5f5", color: "#000" }}>
              <tr>
                <th
                  style={{
                    border: "1px solid #000",
                    padding: "8px 6px",
                    textAlign: "center",
                    width: "30px",
                    fontWeight: 800,
                  }}
                >
                  SR
                </th>
                <th
                  style={{
                    border: "1px solid #000",
                    padding: "8px 6px",
                    textAlign: "left",
                    width: "85px",
                    fontWeight: 800,
                  }}
                >
                  ITEM CODE
                </th>
                <th
                  style={{
                    border: "1px solid #000",
                    padding: "8px 6px",
                    textAlign: "left",
                    fontWeight: 800,
                  }}
                >
                  DESCRIPTION
                </th>
                <th
                  style={{
                    border: "1px solid #000",
                    padding: "8px 6px",
                    textAlign: "left",
                    width: "100px",
                    fontWeight: 800,
                  }}
                >
                  ADDITIONAL NOTES
                </th>
                <th
                  style={{
                    border: "1px solid #000",
                    padding: "8px 6px",
                    textAlign: "center",
                    width: "60px",
                    fontWeight: 800,
                  }}
                >
                  HSN
                </th>
                <th
                  style={{
                    border: "1px solid #000",
                    padding: "8px 6px",
                    textAlign: "center",
                    width: "60px",
                    fontWeight: 800,
                  }}
                >
                  QTY
                </th>
                <th
                  style={{
                    border: "1px solid #000",
                    padding: "8px 6px",
                    textAlign: "right",
                    width: "80px",
                    fontWeight: 800,
                  }}
                >
                  RATE
                </th>
                <th
                  style={{
                    border: "1px solid #000",
                    padding: "8px 6px",
                    textAlign: "right",
                    width: "100px",
                    fontWeight: 800,
                  }}
                >
                  AMOUNT
                </th>
                <th
                  style={{
                    border: "1px solid #000",
                    padding: "8px 6px",
                    width: "auto",
                  }}
                ></th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map((item, i) => {
                const srNo = (pageIdx === 0 ? 0 : itemsPerPageFirst + (pageIdx - 1) * itemsPerPageOthers) + i + 1;
                return (
                <tr key={i}>
                  <td
                    style={{
                      border: "1px solid #000",
                      padding: "6px",
                      textAlign: "center",
                      verticalAlign: "top",
                    }}
                  >
                    {srNo}
                  </td>
                  <td
                    style={{
                      border: "1px solid #000",
                      padding: "6px",
                      verticalAlign: "top",
                      textTransform: "uppercase",
                    }}
                  >
                    {item.itemCode || "—"}
                  </td>
                  <td
                    style={{
                      border: "1px solid #000",
                      padding: "6px",
                      verticalAlign: "top",
                      fontWeight: "bold",
                      textTransform: "uppercase",
                    }}
                  >
                    {item.description || item.itemName}
                  </td>
                  <td
                    style={{
                      border: "1px solid #000",
                      padding: "6px",
                      verticalAlign: "top",
                      fontSize: "9px",
                    }}
                  >
                    {item.additionalNotes || "—"}
                  </td>
                  <td
                    style={{
                      border: "1px solid #000",
                      padding: "6px",
                      verticalAlign: "top",
                      textAlign: "center",
                      fontSize: "9px",
                    }}
                  >
                    {item.hsnCode || "—"}
                  </td>
                  <td
                    style={{
                      border: "1px solid #000",
                      padding: "6px",
                      verticalAlign: "top",
                      textAlign: "center",
                      fontWeight: "bold",
                    }}
                  >
                    {item.qty} {item.uom}
                  </td>
                  <td
                    style={{
                      border: "1px solid #000",
                      padding: "6px",
                      textAlign: "right",
                      verticalAlign: "top",
                    }}
                  >
                    ₹ {Number(item.rate || 0).toFixed(2)}
                  </td>
                  <td
                    style={{
                      border: "1px solid #000",
                      padding: "6px",
                      textAlign: "right",
                      verticalAlign: "top",
                      fontWeight: "bold",
                    }}
                  >
                    ₹{" "}
                    {Number(item.amount || item.qty * item.rate || 0).toFixed(
                      2,
                    )}
                  </td>
                  <td style={{ border: "1px solid #000", padding: "6px" }}></td>
                </tr>
                );
              })}
              {!isLastPage && (
                  <tr>
                      <td colSpan="9" style={{ border: '1px solid #000', padding: '8px', textAlign: 'right', fontStyle: 'italic', fontSize: '9pt', background: '#fafafa' }}>
                          Continued on next page...
                      </td>
                  </tr>
              )}
            </tbody>
            {isLastPage && (
            <tbody style={{ borderTop: "2px solid #000" }}>
              <tr style={{ background: "#f5f5f5" }}>
                <td
                  colSpan="5"
                  style={{
                    border: "1px solid #000",
                    padding: "6px",
                    fontWeight: "bold",
                  }}
                >
                  <div
                    style={{ display: "flex", justifyContent: "flex-start" }}
                  >
                    Total Quantity:
                  </div>
                </td>
                <td
                  style={{
                    border: "1px solid #000",
                    padding: "6px",
                    textAlign: "center",
                    fontWeight: "bold",
                  }}
                >
                  {so.items?.reduce(
                    (sum, item) => sum + (Number(item.qty) || 0),
                    0,
                  )}
                </td>
                <td
                  style={{
                    border: "1px solid #000",
                    padding: "6px",
                    textAlign: "left",
                    fontWeight: "bold",
                  }}
                >
                  Total Taxable
                </td>
                <td
                  style={{
                    border: "1px solid #000",
                    padding: "6px",
                    textAlign: "right",
                    fontWeight: "bold",
                  }}
                >
                  ₹ {Number(so.totalAmount || 0).toFixed(2)}
                </td>
                <td style={{ border: "1px solid #000", padding: "6px" }}></td>
              </tr>
              {so.freightAmount > 0 && (
                <tr>
                  <td colSpan="6" style={{ border: "none" }}></td>
                  <td
                    style={{
                      border: "1px solid #000",
                      padding: "6px",
                      fontWeight: "bold",
                    }}
                  >
                    Freight
                  </td>
                  <td
                    style={{
                      border: "1px solid #000",
                      padding: "6px",
                      textAlign: "right",
                    }}
                  >
                    ₹ {Number(so.freightAmount || 0).toFixed(2)}
                  </td>
                  <td style={{ border: "1px solid #000", padding: "6px" }}></td>
                </tr>
              )}

              {gstApplicable && (
                <tr>
                  <td colSpan="6" style={{ border: "none" }}></td>
                  <td
                    style={{
                      border: "1px solid #000",
                      padding: "6px",
                      fontWeight: "bold",
                    }}
                  >
                    Taxable Amount
                  </td>
                  <td
                    style={{
                      border: "1px solid #000",
                      padding: "6px",
                      textAlign: "right",
                      fontWeight: "bold",
                    }}
                  >
                    ₹{" "}
                    {Number(
                      (so.totalAmount || 0) + (so.freightAmount || 0),
                    ).toFixed(2)}
                  </td>
                  <td style={{ border: "1px solid #000", padding: "6px" }}></td>
                </tr>
              )}

              {gstApplicable && (
                <>
                  {isIGST ? (
                    <tr>
                      <td colSpan="6" style={{ border: "none" }}></td>
                      <td
                        style={{
                          border: "1px solid #000",
                          padding: "6px",
                          fontWeight: "bold",
                        }}
                      >
                        IGST @ {so.items?.[0]?.taxPercent || 18}%
                      </td>
                      <td
                        style={{
                          border: "1px solid #000",
                          padding: "6px",
                          textAlign: "right",
                        }}
                      >
                        ₹ {Number(so.totalIgst || so.totalGst || 0).toFixed(2)}
                      </td>
                      <td
                        style={{ border: "1px solid #000", padding: "6px" }}
                      ></td>
                    </tr>
                  ) : (
                    <>
                      <tr>
                        <td colSpan="6" style={{ border: "none" }}></td>
                        <td
                          style={{
                            border: "1px solid #000",
                            padding: "6px",
                            fontWeight: "bold",
                          }}
                        >
                          CGST @ {(so.items?.[0]?.taxPercent || 18) / 2}%
                        </td>
                        <td
                          style={{
                            border: "1px solid #000",
                            padding: "6px",
                            textAlign: "right",
                          }}
                        >
                          ₹{" "}
                          {Number(so.totalCgst || so.totalGst / 2 || 0).toFixed(
                            2,
                          )}
                        </td>
                        <td
                          style={{ border: "1px solid #000", padding: "6px" }}
                        ></td>
                      </tr>
                      <tr>
                        <td colSpan="6" style={{ border: "none" }}></td>
                        <td
                          style={{
                            border: "1px solid #000",
                            padding: "6px",
                            fontWeight: "bold",
                          }}
                        >
                          SGST @ {(so.items?.[0]?.taxPercent || 18) / 2}%
                        </td>
                        <td
                          style={{
                            border: "1px solid #000",
                            padding: "6px",
                            textAlign: "right",
                          }}
                        >
                          ₹{" "}
                          {Number(so.totalSgst || so.totalGst / 2 || 0).toFixed(
                            2,
                          )}
                        </td>
                        <td
                          style={{ border: "1px solid #000", padding: "6px" }}
                        ></td>
                      </tr>
                    </>
                  )}
                </>
              )}

              {so.roundOff !== 0 && (
                <tr>
                  <td colSpan="6" style={{ border: "none" }}></td>
                  <td
                    style={{
                      border: "1px solid #000",
                      padding: "6px",
                      fontWeight: "bold",
                    }}
                  >
                    Round Off
                  </td>
                  <td
                    style={{
                      border: "1px solid #000",
                      padding: "6px",
                      textAlign: "right",
                    }}
                  >
                    {Number(so.roundOff || 0).toFixed(2)}
                  </td>
                  <td style={{ border: "1px solid #000", padding: "6px" }}></td>
                </tr>
              )}
              <tr style={{ background: "#f5f5f5" }}>
                <td colSpan="6" style={{ border: "none" }}></td>
                <td
                  style={{
                    border: "1px solid #000",
                    padding: "6px",
                    fontWeight: "bold",
                    fontSize: "14px",
                  }}
                >
                  Rounded Total:
                </td>
                <td
                  style={{
                    border: "1px solid #000",
                    padding: "6px",
                    textAlign: "right",
                    fontWeight: "bold",
                    fontSize: "14px",
                  }}
                >
                  ₹ {Number(so.roundedTotal || so.grandTotal || 0).toFixed(2)}
                </td>
                <td style={{ border: "1px solid #000", padding: "6px" }}></td>
              </tr>
              <tr>
                <td colSpan="6" style={{ border: "none" }}></td>
                <td
                  style={{
                    border: "1px solid #000",
                    padding: "6px",
                    fontWeight: "bold",
                  }}
                >
                  In Words:
                </td>
                <td
                  colSpan="2"
                  style={{
                    border: "1px solid #000",
                    padding: "6px",
                    fontSize: "9px",
                    fontStyle: "italic",
                    textTransform: "capitalize",
                  }}
                >
                  {so.amountInWords}
                </td>
              </tr>
            </tbody>
            )}
          </table>

          {isLastPage && (
          <>
          <div
            style={{
              marginTop: "14px",
              border: "1px solid #000",
              padding: "8px 10px",
            }}
          >
            <div
              style={{
                fontSize: "8pt",
                fontWeight: 900,
                textTransform: "uppercase",
                color: "#555",
                marginBottom: "4px",
              }}
            >
              Remarks:
            </div>
            <div
              style={{
                fontSize: "9pt",
                color: "#333",
                whiteSpace: "pre-wrap",
                fontStyle: so.remarks ? "normal" : "italic",
              }}
            >
              {so.remarks || "—"}
            </div>
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-end",
              marginTop: "30px",
            }}
          >
            {/* Footer Bank Details */}
            <div style={{ fontSize: "9px" }}>
              <b style={{ textTransform: "uppercase" }}>
                COMPANY BANK DETAILS:
              </b>
              <br />
              <table style={{ borderCollapse: "collapse", marginTop: "4px" }}>
                <tbody>
                  <tr>
                    <td
                      style={{
                        width: "80px",
                        paddingBottom: "3px",
                        color: "#6b7280",
                      }}
                    >
                      Bank Name
                    </td>
                    <td style={{ paddingBottom: "3px" }}>
                      : <b>BANK OF BARODA</b>
                    </td>
                  </tr>
                  <tr>
                    <td style={{ paddingBottom: "3px", color: "#6b7280" }}>
                      A/c No.
                    </td>
                    <td style={{ paddingBottom: "3px" }}>
                      : <b>20260200001544</b>
                    </td>
                  </tr>
                  <tr>
                    <td style={{ paddingBottom: "3px", color: "#6b7280" }}>
                      Branch & IFS Code
                    </td>
                    <td style={{ paddingBottom: "3px" }}>
                      : <b>SHIMPOLI & BARB0SHIBOR</b>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div
              style={{ textAlign: "center", fontSize: "8pt", color: "#666" }}
            >
              This is a computer generated order and does not require a physical
              signature.
            </div>

            {/* Authorized Signatory Box */}
            <div
              style={{
                border: "1px solid #000",
                width: "220px",
                display: "flex",
                flexDirection: "column",
                height: "100px",
              }}
            >
              <div
                style={{
                  background: "#f5f5f5",
                  padding: "5px",
                  fontSize: "9px",
                  fontWeight: 800,
                  textAlign: "center",
                  borderBottom: "1px solid #000",
                }}
              >
                For {company.companyName || "JSK URJA"}
              </div>
              <div
                style={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "flex-end",
                  alignItems: "center",
                  paddingBottom: "8px",
                }}
              >
                <div
                  style={{
                    fontSize: "10px",
                    fontWeight: 800,
                    textTransform: "uppercase",
                  }}
                >
                  {so.createdBy?.name || user?.name || "Authorized User"}
                </div>
                {(so.createdBy?.mobile || user?.mobile) && (
                  <div style={{ fontSize: "9px", color: "#333" }}>
                    Mob: {so.createdBy?.mobile || user?.mobile}
                  </div>
                )}
                <div
                  style={{
                    width: "160px",
                    borderTop: "1px solid #000",
                    marginTop: "4px",
                    paddingTop: "2px",
                    fontSize: "9px",
                    fontWeight: 800,
                    textAlign: "center",
                  }}
                >
                  AUTHORIZED SIGNATORY
                </div>
              </div>
            </div>
          </div>
          </>
          )}
        </div>
             );
          });
        })()}
      </div>

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
              {(so.status === "Confirmed" || so.status === "Partially Invoiced" || so.status === "Dispatched") && so.status !== "Invoiced" && (
                <button
                  onClick={() =>
                    navigate(`${PATHS.SALES.NEW_INVOICE}?soId=${id}`)
                  }
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
                  🧾 Create Invoice
                </button>
              )}
              <button
                onClick={() => window.print()}
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
              {notCancelled && (
                <button
                  onClick={() => navigate(`/sales/orders/${id}/edit`)}
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
                  ✏️ Edit
                </button>
              )}
              {notCancelled && (user?.roleName === "admin" || user?.roleName === "superadmin") && (
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
                {(so.items || []).map((item, i) => (
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
                      {item.qty}
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
                ))}
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
                  ["Total Taxable Amount", fmtCur(so.totalAmount)],
                  ...(gstApplicable
                    ? so.gstType === "CGST / SGST"
                      ? [
                          ["CGST", fmtCur(so.totalCgst)],
                          ["SGST", fmtCur(so.totalSgst)],
                          ["Total Tax", fmtCur(so.totalGst)],
                        ]
                      : [[so.gstType || "IGST", fmtCur(so.totalGst)]]
                    : []),
                  ["Freight", fmtCur(so.freightAmount)],
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

      {/* Print Styles */}
      <style>{`
                @media print {
                    .no-print { display: none !important; }
                    .print-only { display: block !important; padding: 0 !important; }
                    @page { size: A4; margin: 0; }
                    body { background: #fff !important; }
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
    </div>
  );
}
