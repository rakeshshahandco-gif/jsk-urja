import React, { useState, useEffect, useCallback } from "react";
import { toast } from "react-hot-toast";
import { Search, RefreshCw, FileText } from "lucide-react";
import { apiClient } from "@/lib/apiClient";

const API = "/accounting/reports/audit-trail";

const ACTION_COLORS = {
    CREATE: { bg: "#dcfce7", color: "#166534" },
    POST: { bg: "#dbeafe", color: "#1e40af" },
    UPDATE: { bg: "#fef9c3", color: "#854d0e" },
    CANCEL: { bg: "#fee2e2", color: "#991b1b" },
    DELETE: { bg: "#fce7f3", color: "#9d174d" },
    NUMBER_CHANGE: { bg: "#ede9fe", color: "#5b21b6" },
};

const lbl = {
    fontSize: 11, fontWeight: 700, color: "#64748b",
    textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 4,
};
const inp = {
    padding: "8px 12px", background: "#fff", border: "1.5px solid #e2e8f0",
    borderRadius: 7, color: "#1e293b", fontSize: 13, outline: "none",
};

const RESOURCE_TYPES = ["Voucher", "SalesInvoice", "PurchaseInvoice", "PaymentEntry", "BillWiseAdjustment"];
const ACTIONS = ["CREATE", "UPDATE", "CANCEL", "DELETE", "POST", "NUMBER_CHANGE"];

const AccountingAuditPage = () => {
    const [logs, setLogs] = useState([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [selected, setSelected] = useState(null);
    const [filters, setFilters] = useState({ resourceType: "", financialYear: "", action: "" });

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const params = { page, limit: 50, ...filters };
            Object.keys(params).forEach(k => !params[k] && delete params[k]);
            const res = await apiClient.get(API, { params });
            setLogs(res.data?.data?.logs || []);
            setTotal(res.data?.data?.total || 0);
        } catch {
            toast.error("Failed to load audit trail");
        } finally {
            setLoading(false);
        }
    }, [page, filters]);

    useEffect(() => { load(); }, [load]);

    const handleFilter = (key, value) => {
        setFilters(prev => ({ ...prev, [key]: value }));
        setPage(1);
    };

    const fmt = (d) => d
        ? new Date(d).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
        : "-";

    return (
        <div style={{ maxWidth: 1200, margin: "32px auto", padding: "0 20px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
                <FileText size={26} color="#0f172a" />
                <div>
                    <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "#0f172a" }}>Accounting Audit Trail</h2>
                    <p style={{ margin: "3px 0 0", fontSize: 12, color: "#64748b" }}>
                        All accounting actions logged with user, timestamp, and before/after values
                    </p>
                </div>
                <button
                    onClick={load}
                    style={{ marginLeft: "auto", padding: "8px 14px", borderRadius: 7, background: "#f1f5f9", border: "1px solid #e2e8f0", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontWeight: 600, fontSize: 12, color: "#475569" }}
                >
                    <RefreshCw size={13} /> Refresh
                </button>
            </div>

            <div style={{ background: "#fff", border: "1.5px solid #e2e8f0", borderRadius: 12, padding: "16px 20px", marginBottom: 20 }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, alignItems: "end" }}>
                    <div>
                        <label style={lbl}>Document Type</label>
                        <select value={filters.resourceType} onChange={e => handleFilter("resourceType", e.target.value)} style={{ ...inp, width: "100%" }}>
                            <option value="">All Types</option>
                            {RESOURCE_TYPES.map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                    </div>
                    <div>
                        <label style={lbl}>Action</label>
                        <select value={filters.action} onChange={e => handleFilter("action", e.target.value)} style={{ ...inp, width: "100%" }}>
                            <option value="">All Actions</option>
                            {ACTIONS.map(a => <option key={a} value={a}>{a}</option>)}
                        </select>
                    </div>
                    <div>
                        <label style={lbl}>Financial Year</label>
                        <input
                            value={filters.financialYear}
                            onChange={e => handleFilter("financialYear", e.target.value)}
                            placeholder="e.g. 2024-2025"
                            style={{ ...inp, width: "100%" }}
                        />
                    </div>
                    <div style={{ fontSize: 12, color: "#64748b", paddingBottom: 8 }}>
                        Showing <strong>{logs.length}</strong> of <strong>{total}</strong> records
                    </div>
                </div>
            </div>

            <div style={{ background: "#fff", border: "1.5px solid #e2e8f0", borderRadius: 12, overflow: "hidden" }}>
                {loading ? (
                    <div style={{ padding: 48, textAlign: "center", color: "#94a3b8", fontSize: 13 }}>Loading audit trail...</div>
                ) : logs.length === 0 ? (
                    <div style={{ padding: 48, textAlign: "center" }}>
                        <Search size={32} color="#cbd5e1" style={{ marginBottom: 8 }} />
                        <p style={{ color: "#94a3b8", fontSize: 13, margin: 0 }}>No audit entries found.</p>
                    </div>
                ) : (
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                        <thead>
                            <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                                {["Timestamp", "Action", "Document Type", "Voucher/Ref No", "FY", "User", "Reason", "Details"].map(h => (
                                    <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", whiteSpace: "nowrap" }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {logs.map(log => {
                                const ac = ACTION_COLORS[log.action] || { bg: "#f1f5f9", color: "#475569" };
                                return (
                                    <tr key={log._id} style={{ borderTop: "1px solid #f1f5f9" }}>
                                        <td style={{ padding: "10px 14px", color: "#64748b", whiteSpace: "nowrap" }}>{fmt(log.createdAt)}</td>
                                        <td style={{ padding: "10px 14px" }}>
                                            <span style={{ padding: "3px 8px", borderRadius: 5, background: ac.bg, color: ac.color, fontWeight: 700, fontSize: 11 }}>
                                                {log.action}
                                            </span>
                                        </td>
                                        <td style={{ padding: "10px 14px", color: "#475569" }}>{log.resourceType}</td>
                                        <td style={{ padding: "10px 14px", fontWeight: 700, color: "#0f172a" }}>
                                            {log.voucherNo || (log.resourceId ? log.resourceId.toString().slice(-6) : "-")}
                                        </td>
                                        <td style={{ padding: "10px 14px", color: "#64748b" }}>{log.financialYear || "-"}</td>
                                        <td style={{ padding: "10px 14px", color: "#475569" }}>{log.userId?.name || "-"}</td>
                                        <td style={{ padding: "10px 14px", color: "#64748b", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                            {log.reason || "-"}
                                        </td>
                                        <td style={{ padding: "10px 14px" }}>
                                            {(log.oldValue || log.newValue) && (
                                                <button
                                                    onClick={() => setSelected(log)}
                                                    style={{ padding: "4px 10px", borderRadius: 6, background: "#f1f5f9", border: "1px solid #e2e8f0", cursor: "pointer", fontSize: 11, fontWeight: 600, color: "#475569" }}
                                                >
                                                    View
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
                {total > 50 && (
                    <div style={{ padding: "12px 20px", borderTop: "1px solid #f1f5f9", display: "flex", gap: 10, justifyContent: "flex-end" }}>
                        <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                            style={{ padding: "6px 14px", borderRadius: 6, background: "#f8fafc", border: "1px solid #e2e8f0", cursor: "pointer", fontWeight: 600, fontSize: 12, color: "#475569" }}>
                            Prev
                        </button>
                        <span style={{ padding: "6px 12px", fontSize: 12, color: "#64748b" }}>Page {page}</span>
                        <button onClick={() => setPage(p => p + 1)} disabled={page * 50 >= total}
                            style={{ padding: "6px 14px", borderRadius: 6, background: "#f8fafc", border: "1px solid #e2e8f0", cursor: "pointer", fontWeight: 600, fontSize: 12, color: "#475569" }}>
                            Next
                        </button>
                    </div>
                )}
            </div>

            {selected && (
                <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
                    <div style={{ background: "#fff", borderRadius: 14, padding: 28, width: 600, maxWidth: "90vw", maxHeight: "80vh", overflow: "auto" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>
                                {selected.action} - {selected.resourceType} {selected.voucherNo || ""}
                            </h3>
                            <button onClick={() => setSelected(null)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "#94a3b8" }}>x</button>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                            {selected.oldValue && (
                                <div>
                                    <p style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", marginBottom: 8 }}>Before</p>
                                    <pre style={{ background: "#fef2f2", borderRadius: 8, padding: 12, fontSize: 11, color: "#991b1b", overflow: "auto", maxHeight: 300, margin: 0 }}>
                                        {JSON.stringify(selected.oldValue, null, 2)}
                                    </pre>
                                </div>
                            )}
                            {selected.newValue && (
                                <div>
                                    <p style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", marginBottom: 8 }}>After</p>
                                    <pre style={{ background: "#f0fdf4", borderRadius: 8, padding: 12, fontSize: 11, color: "#166534", overflow: "auto", maxHeight: 300, margin: 0 }}>
                                        {JSON.stringify(selected.newValue, null, 2)}
                                    </pre>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AccountingAuditPage;