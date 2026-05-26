import React, { useState, useEffect } from "react";
import { toast } from "react-hot-toast";
import { Lock, Unlock, ShieldCheck, Save } from "lucide-react";
import { apiClient } from "@/lib/apiClient";

const lbl = { fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 5 };
const inp = { padding: "9px 12px", background: "#fff", border: "1.5px solid #e2e8f0", borderRadius: 7, color: "#1e293b", fontSize: 13, outline: "none", width: "100%", boxSizing: "border-box" };

const API = "/security/locks";
const SETTINGS_API = "/security/settings";

const PeriodLockPage = () => {
    const [locks, setLocks] = useState([]);
    const [settings, setSettings] = useState({});
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [overrideModal, setOverrideModal] = useState(null);

    const getFY = () => {
        const now = new Date();
        const y = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
        return y + "-" + (y + 1);
    };

    const [newLock, setNewLock] = useState({
        financialYear: getFY(),
        booksLockedTill: "",
        gstLockedTill: "",
        tdsLockedTill: "",
        remarks: "",
    });
    const [override, setOverride] = useState({ unlockedTill: "", unlockReason: "" });

    const load = async () => {
        setLoading(true);
        try {
            const [locksRes, settingsRes] = await Promise.all([
                apiClient.get(API),
                apiClient.get(SETTINGS_API),
            ]);
            setLocks(locksRes.data?.data || []);
            setSettings(settingsRes.data?.data || {});
        } catch {
            toast.error("Failed to load settings");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, []);

    const handleSaveLock = async () => {
        if (!newLock.financialYear) return toast.error("Financial year is required");
        setSaving(true);
        try {
            await apiClient.put(API, newLock);
            toast.success("Period lock saved for FY " + newLock.financialYear);
            load();
        } catch (err) {
            toast.error(err.response?.data?.message || "Failed to save");
        } finally {
            setSaving(false);
        }
    };

    const handleOverride = async () => {
        if (!overrideModal) return;
        if (!override.unlockedTill) return toast.error("Select the override end date");
        if (!override.unlockReason.trim()) return toast.error("Override reason is required");
        setSaving(true);
        try {
            await apiClient.post(API + "/override", { financialYear: overrideModal.financialYear, ...override });
            toast.success("Temporary override applied");
            setOverrideModal(null);
            setOverride({ unlockedTill: "", unlockReason: "" });
            load();
        } catch (err) {
            toast.error(err.response?.data?.message || "Failed to override");
        } finally {
            setSaving(false);
        }
    };

    const handlePatchSettings = async (key, value) => {
        try {
            await apiClient.patch(SETTINGS_API, { [key]: value });
            setSettings(prev => ({ ...prev, [key]: value }));
            toast.success("Settings updated");
        } catch {
            toast.error("Failed to update settings");
        }
    };

    const fmt = (d) => d ? new Date(d).toLocaleDateString("en-IN") : "-";

    return (
        <div style={{ maxWidth: 960, margin: "32px auto", padding: "0 20px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 28 }}>
                <ShieldCheck size={28} color="#0f172a" />
                <div>
                    <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "#0f172a" }}>Period Lock Settings</h2>
                    <p style={{ margin: "3px 0 0", fontSize: 12, color: "#64748b" }}>
                        Lock accounting periods to prevent backdated entries. Admins can override temporarily with a reason.
                    </p>
                </div>
            </div>

            <div style={{ background: "#fff", border: "1.5px solid #e2e8f0", borderRadius: 12, padding: 24, marginBottom: 24 }}>
                <h3 style={{ margin: "0 0 18px", fontSize: 14, fontWeight: 700, color: "#1e293b" }}>Global Voucher Settings</h3>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
                    <div>
                        <label style={lbl}>Default Posting Mode</label>
                        <select
                            value={settings.defaultPostingMode || "provisional"}
                            onChange={e => handlePatchSettings("defaultPostingMode", e.target.value)}
                            style={inp}
                        >
                            <option value="provisional">Provisional (requires approval before posting)</option>
                            <option value="final">Final (posted immediately on save)</option>
                        </select>
                    </div>
                    <div>
                        <label style={lbl}>Approval Workflow</label>
                        <select
                            value={String(settings.enableApprovalWorkflow !== false)}
                            onChange={e => handlePatchSettings("enableApprovalWorkflow", e.target.value === "true")}
                            style={inp}
                        >
                            <option value="true">Enabled</option>
                            <option value="false">Disabled</option>
                        </select>
                    </div>
                </div>
            </div>

            <div style={{ background: "#fff", border: "1.5px solid #e2e8f0", borderRadius: 12, padding: 24, marginBottom: 24 }}>
                <h3 style={{ margin: "0 0 18px", fontSize: 14, fontWeight: 700, color: "#1e293b" }}>
                    Set / Update Period Lock
                </h3>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 14, marginBottom: 14 }}>
                    <div>
                        <label style={lbl}>Financial Year</label>
                        <input value={newLock.financialYear} onChange={e => setNewLock(p => ({ ...p, financialYear: e.target.value }))}
                            placeholder="e.g. 2024-2025" style={inp} />
                    </div>
                    <div>
                        <label style={lbl}>Books Locked Till</label>
                        <input type="date" value={newLock.booksLockedTill} onChange={e => setNewLock(p => ({ ...p, booksLockedTill: e.target.value }))} style={inp} />
                    </div>
                    <div>
                        <label style={lbl}>GST Locked Till</label>
                        <input type="date" value={newLock.gstLockedTill} onChange={e => setNewLock(p => ({ ...p, gstLockedTill: e.target.value }))} style={inp} />
                    </div>
                    <div>
                        <label style={lbl}>TDS Locked Till</label>
                        <input type="date" value={newLock.tdsLockedTill} onChange={e => setNewLock(p => ({ ...p, tdsLockedTill: e.target.value }))} style={inp} />
                    </div>
                </div>
                <div style={{ display: "flex", gap: 14, alignItems: "flex-end" }}>
                    <div style={{ flex: 1 }}>
                        <label style={lbl}>Remarks</label>
                        <input value={newLock.remarks} onChange={e => setNewLock(p => ({ ...p, remarks: e.target.value }))}
                            placeholder="Reason for locking..." style={inp} />
                    </div>
                    <button onClick={handleSaveLock} disabled={saving}
                        style={{ padding: "9px 22px", borderRadius: 8, background: "#0f172a", color: "#fff", border: "none", cursor: saving ? "not-allowed" : "pointer", fontWeight: 700, display: "flex", alignItems: "center", gap: 8, whiteSpace: "nowrap" }}>
                        <Save size={15} /> {saving ? "Saving..." : "Save Lock"}
                    </button>
                </div>
            </div>

            <div style={{ background: "#fff", border: "1.5px solid #e2e8f0", borderRadius: 12, overflow: "hidden" }}>
                <div style={{ padding: "16px 20px", borderBottom: "1px solid #f1f5f9" }}>
                    <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#1e293b" }}>Current Period Locks</h3>
                </div>
                {loading ? (
                    <div style={{ padding: 32, textAlign: "center", color: "#94a3b8" }}>Loading...</div>
                ) : locks.length === 0 ? (
                    <div style={{ padding: 32, textAlign: "center", color: "#94a3b8", fontSize: 13 }}>
                        No period locks configured yet.
                    </div>
                ) : (
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                        <thead>
                            <tr style={{ background: "#f8fafc" }}>
                                {["FY", "Books Locked Till", "GST Locked Till", "TDS Locked Till", "Override Till", "Remarks", ""].map(h => (
                                    <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {locks.map(lock => {
                                const hasOverride = lock.unlockedTill && new Date(lock.unlockedTill) > new Date();
                                return (
                                    <tr key={lock._id} style={{ borderTop: "1px solid #f1f5f9" }}>
                                        <td style={{ padding: "10px 14px", fontWeight: 700, color: "#0f172a" }}>{lock.financialYear}</td>
                                        <td style={{ padding: "10px 14px" }}>{fmt(lock.booksLockedTill)}</td>
                                        <td style={{ padding: "10px 14px" }}>{fmt(lock.gstLockedTill)}</td>
                                        <td style={{ padding: "10px 14px" }}>{fmt(lock.tdsLockedTill)}</td>
                                        <td style={{ padding: "10px 14px", color: hasOverride ? "#16a34a" : "#94a3b8", fontWeight: hasOverride ? 700 : 400 }}>
                                            {hasOverride ? fmt(lock.unlockedTill) : "-"}
                                        </td>
                                        <td style={{ padding: "10px 14px", color: "#64748b", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                            {lock.remarks || "-"}
                                        </td>
                                        <td style={{ padding: "10px 14px" }}>
                                            <button
                                                onClick={() => { setOverrideModal(lock); setOverride({ unlockedTill: "", unlockReason: "" }); }}
                                                style={{ padding: "5px 12px", borderRadius: 6, background: "#fef3c7", color: "#92400e", border: "1px solid #fcd34d", cursor: "pointer", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", gap: 5 }}
                                            >
                                                <Unlock size={12} /> Override
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>

            {overrideModal && (
                <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
                    <div style={{ background: "#fff", borderRadius: 14, padding: 28, width: 440, maxWidth: "90vw" }}>
                        <h3 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 700 }}>
                            Temporary Override - FY {overrideModal.financialYear}
                        </h3>
                        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                            <div>
                                <label style={lbl}>Override Until</label>
                                <input type="date" value={override.unlockedTill} onChange={e => setOverride(p => ({ ...p, unlockedTill: e.target.value }))} style={inp} />
                            </div>
                            <div>
                                <label style={lbl}>Reason (mandatory)</label>
                                <input value={override.unlockReason} onChange={e => setOverride(p => ({ ...p, unlockReason: e.target.value }))}
                                    placeholder="e.g. Auditor correction for Q3 entry" style={inp} />
                            </div>
                        </div>
                        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 20 }}>
                            <button onClick={() => setOverrideModal(null)}
                                style={{ padding: "8px 18px", borderRadius: 7, background: "#f1f5f9", color: "#64748b", border: "none", cursor: "pointer", fontWeight: 600 }}>
                                Cancel
                            </button>
                            <button onClick={handleOverride} disabled={saving}
                                style={{ padding: "8px 18px", borderRadius: 7, background: "#f59e0b", color: "#fff", border: "none", cursor: "pointer", fontWeight: 700 }}>
                                Apply Override
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PeriodLockPage;