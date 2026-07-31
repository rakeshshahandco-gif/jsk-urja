import React, { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { dataExtractorApi } from "@/services/dataExtractorApi";
import { useAuth } from "@/hooks/useAuth";

const btn = { padding: "6px 10px", borderRadius: 6, border: "1px solid #cbd5e1", background: "#fff", cursor: "pointer", fontSize: 12 };
const btnPrimary = { ...btn, background: "#1d4ed8", color: "#fff", border: "none" };
const field = { padding: 6, borderRadius: 6, border: "1px solid #e2e8f0", fontSize: 12, minWidth: 160 };
const card = { border: "1px solid #e2e8f0", borderRadius: 8, padding: 12, marginBottom: 10, background: "#fff" };

function can(hasPermission, key) {
  try { return hasPermission?.(key) === true; } catch { return false; }
}

export default function DataExtractorMarketingIntelligencePage() {
  const { hasPermission } = useAuth() || {};
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState(null);
  const [recipients, setRecipients] = useState([]);
  const [stats, setStats] = useState(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    name: "",
    campaignType: "PRODUCT_INTRODUCTION",
    channelDraftType: "EMAIL_DRAFT",
    city: "",
  });

  const load = useCallback(async () => {
    if (!can(hasPermission, "data_extractor.marketing_intelligence.view")) return;
    try {
      const data = await dataExtractorApi.listMarketingCampaigns({ limit: 50 });
      setItems(data?.items || []);
    } catch (e) {
      toast.error(e?.response?.data?.message || e.message || "Failed to load campaigns");
    }
  }, [hasPermission]);

  useEffect(() => { load(); }, [load]);

  async function createDraft() {
    if (!can(hasPermission, "data_extractor.marketing_intelligence.create")) {
      toast.error("Missing create permission");
      return;
    }
    setBusy(true);
    try {
      const data = await dataExtractorApi.createMarketingCampaign({
        name: form.name || "Untitled Campaign Draft",
        campaignType: form.campaignType,
        channelDraftType: form.channelDraftType,
        audienceFilters: form.city ? { city: form.city } : {},
      });
      toast.success("Campaign Draft created (not sent)");
      setSelected(data?.campaign || data);
      await load();
    } catch (e) {
      toast.error(e?.response?.data?.message || e.message || "Create failed");
    } finally {
      setBusy(false);
    }
  }

  async function buildAudience(id) {
    if (!can(hasPermission, "data_extractor.marketing_intelligence.build_audience")) {
      toast.error("Missing build_audience permission");
      return;
    }
    setBusy(true);
    try {
      const data = await dataExtractorApi.buildMarketingAudience(id, { confirmLargeAudience: true });
      setStats(data?.stats || null);
      setSelected(data?.campaign || selected);
      const rec = await dataExtractorApi.getMarketingRecipients(id, { limit: 50 });
      setRecipients(rec?.items || []);
      toast.success("Audience prepared (draft only)");
    } catch (e) {
      toast.error(e?.response?.data?.message || e.message || "Build failed");
    } finally {
      setBusy(false);
    }
  }

  async function generateMessage(id) {
    if (!can(hasPermission, "data_extractor.marketing_intelligence.generate_message")) {
      toast.error("Missing generate_message permission");
      return;
    }
    setBusy(true);
    try {
      const data = await dataExtractorApi.generateMarketingMessage(id, {});
      setSelected(data?.campaign || selected);
      toast.success("Message Draft generated — NOT SENT");
    } catch (e) {
      toast.error(e?.response?.data?.message || e.message || "Message draft failed");
    } finally {
      setBusy(false);
    }
  }

  async function approveAndHandoff(id) {
    if (!can(hasPermission, "data_extractor.marketing_intelligence.prepare_handoff")) {
      toast.error("Missing prepare_handoff permission");
      return;
    }
    setBusy(true);
    try {
      await dataExtractorApi.reviewMarketingCampaign(id, {
        approveAudience: true,
        approveRecipients: true,
        approveMessage: true,
        approveContent: true,
      });
      await dataExtractorApi.finalApproveMarketingCampaign(id, {});
      const data = await dataExtractorApi.prepareMarketingHandoff(id, {});
      setSelected(data?.campaign || selected);
      toast.success("Handoff package prepared (non-executable). No email/WhatsApp sent.");
    } catch (e) {
      toast.error(e?.response?.data?.message || e.message || "Handoff failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ padding: 16, maxWidth: 1100 }}>
      <h2 style={{ margin: "0 0 6px" }}>Marketing Intelligence</h2>
      <p style={{ color: "#64748b", fontSize: 13, marginTop: 0 }}>
        Draft-first audience, message and handoff preparation. There is no Send, Execute or Start Campaign action.
      </p>
      <div style={{ ...card, background: "#fff7ed", borderColor: "#fed7aa" }}>
        <strong>Safety:</strong> Phase 16 never calls Email, WhatsApp, Bulk Messaging, or any communication API.
        Safe-mode suggestions reduce risk but cannot guarantee WhatsApp will not restrict a number.
      </div>

      <div style={card}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Create Campaign Draft</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          <input style={field} placeholder="Campaign name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <select style={field} value={form.campaignType} onChange={(e) => setForm({ ...form, campaignType: e.target.value })}>
            <option value="PRODUCT_INTRODUCTION">Product introduction</option>
            <option value="PRODUCT_CATALOGUE">Product catalogue</option>
            <option value="PRODUCT_DATASHEET">Product datasheet</option>
            <option value="OEM_OUTREACH">OEM outreach</option>
            <option value="MANUAL_CUSTOM">Manual custom</option>
          </select>
          <select style={field} value={form.channelDraftType} onChange={(e) => setForm({ ...form, channelDraftType: e.target.value })}>
            <option value="EMAIL_DRAFT">Email draft</option>
            <option value="WHATSAPP_DRAFT">WhatsApp draft</option>
            <option value="EMAIL_AND_WHATSAPP_DRAFT">Email + WhatsApp draft</option>
            <option value="EXPORT_ONLY">Export only</option>
            <option value="MANUAL_CALL_LIST">Manual call list</option>
          </select>
          <input style={field} placeholder="City filter" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
          <button type="button" style={btnPrimary} disabled={busy} onClick={createDraft}>Create Draft</button>
        </div>
      </div>

      <div style={card}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Campaign Drafts</div>
        {!items.length && <div style={{ color: "#94a3b8", fontSize: 12 }}>No drafts yet.</div>}
        {items.map((c) => (
          <div key={c._id} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #f1f5f9" }}>
            <button type="button" style={btn} onClick={() => setSelected(c)}>{c.name}</button>
            <span style={{ fontSize: 12, color: "#64748b" }}>{c.campaignType} · {c.channelDraftType} · {c.status}</span>
            <button type="button" style={btn} disabled={busy} onClick={() => buildAudience(c._id)}>Build audience</button>
            <button type="button" style={btn} disabled={busy} onClick={() => generateMessage(c._id)}>Generate message draft</button>
            <button type="button" style={btn} disabled={busy} onClick={() => approveAndHandoff(c._id)}>Approve + prepare handoff</button>
          </div>
        ))}
      </div>

      {stats && (
        <div style={card}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Audience stats (draft stage)</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(140px,1fr))", gap: 8, fontSize: 12 }}>
            {Object.entries(stats).map(([k, v]) => (
              <div key={k}><div style={{ color: "#94a3b8" }}>{k}</div><strong>{String(v)}</strong></div>
            ))}
          </div>
        </div>
      )}

      {selected && (
        <div style={card}>
          <div style={{ fontWeight: 600 }}>Selected: {selected.name}</div>
          <div style={{ fontSize: 12, color: "#64748b" }}>Status {selected.status} · Handoff {selected.handoffStatus} · Message NOT_SENT={String(selected.messageNotSent !== false)}</div>
          {selected.messageDraft?.body && (
            <pre style={{ whiteSpace: "pre-wrap", background: "#f8fafc", padding: 10, borderRadius: 6, fontSize: 12 }}>{selected.messageDraft.subject ? selected.messageDraft.subject + "\n\n" : ""}{selected.messageDraft.body}</pre>
          )}
          {selected.handoffPackage && (
            <div style={{ fontSize: 12, marginTop: 8 }}>
              Handoff executable={String(selected.handoffPackage.executable)} · recipients={selected.handoffPackage.approvedRecipientCount}
            </div>
          )}
        </div>
      )}

      {!!recipients.length && (
        <div style={card}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Recipients preview</div>
          <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th align="left">Company</th>
                <th align="left">Contact</th>
                <th align="left">Eligibility</th>
                <th align="left">Included</th>
              </tr>
            </thead>
            <tbody>
              {recipients.map((r) => (
                <tr key={r._id}>
                  <td>{r.companyName || "—"}</td>
                  <td>{r.contactName || r.email || r.phone || "(hidden/aggregate)"}</td>
                  <td>{r.eligibilityStatus}</td>
                  <td>{String(r.included)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}