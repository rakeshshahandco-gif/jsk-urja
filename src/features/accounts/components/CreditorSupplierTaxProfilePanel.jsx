import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ExternalLink, Loader2, Link2 } from 'lucide-react';
import {
    ensureSupplierForLedger,
    getSuppliersByLedgerId,
    updateSupplier,
} from '@/services/purchaseApi';
import { useCompany } from '@/contexts/CompanyContext';
import { PATHS } from '@/routes/paths';
import { toast } from 'react-hot-toast';

const RCM_CATEGORY_CODES = ['RENT', 'GTA', 'COURIER', 'LEGAL', 'SECURITY', 'GENERAL', 'OTHER'];

const GST_STATUS_REQUIRES_GSTIN = new Set(['Registered Regular', 'Composition', 'SEZ']);
const GST_STATUS_HIDE_GSTIN = new Set(['Unregistered', 'Overseas', 'Exempt Entity', 'Not Applicable']);

const label = {
    fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase',
    letterSpacing: '0.04em', marginBottom: 4, display: 'block',
};
const input = {
    width: '100%', border: '1.5px solid #e5e7eb', borderRadius: 8, padding: '8px 12px',
    fontSize: 13, color: '#111827', outline: 'none', background: '#fff', boxSizing: 'border-box',
};
const select = { ...input, background: '#fff' };
const grid3 = { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 };
const sectionTitle = {
    display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 800,
    color: '#1d4ed8', textTransform: 'uppercase', letterSpacing: '0.06em',
    borderBottom: '2px solid #dbeafe', paddingBottom: 8, marginBottom: 12,
};

function profileCompleteness(s) {
    if (!s) return 'Not Linked';
    const hasGst = !!String(s.gstRegistrationStatus || '').trim();
    const hasRcm = !!String(s.defaultRcmTreatment || '').trim()
        || (Array.isArray(s.defaultRcmCategories) && s.defaultRcmCategories.length > 0);
    if (hasGst && hasRcm) return 'Supplier Profile Complete';
    if (hasGst || hasRcm) return 'Supplier Profile Incomplete';
    return 'Linked to Supplier';
}

function mapStatusToLedgerRegistration(status) {
    if (status === 'Composition') return 'Composition';
    if (status === 'Unregistered' || status === 'Not Applicable' || status === 'Exempt Entity' || status === 'Overseas') {
        return 'Unregistered';
    }
    if (status === 'Registered Regular' || status === 'SEZ') return 'Regular';
    return '';
}

/**
 * Compact Supplier GST/RCM panel for Sundry Creditor ledgers.
 * Source of truth = Supplier Master only (never a second AccountLedger tax profile).
 */
export default function CreditorSupplierTaxProfilePanel({
    ledgerId,
    ledgerName,
    onMirrorToLedger,
}) {
    const { selectedCompany } = useCompany();
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [supplier, setSupplier] = useState(null);
    const [ambiguous, setAmbiguous] = useState(false);
    const [matchCount, setMatchCount] = useState(0);
    const [draft, setDraft] = useState(null);
    const [clearedGstinUi, setClearedGstinUi] = useState(false);

    const status = draft?.gstRegistrationStatus || '';
    const showGstin = GST_STATUS_REQUIRES_GSTIN.has(status);
    const hideGstin = !status || GST_STATUS_HIDE_GSTIN.has(status);
    const cats = Array.isArray(draft?.defaultRcmCategories) ? draft.defaultRcmCategories : [];
    const showRent = cats.includes('RENT') || !!draft?.defaultPropertyType;
    const showTransport = !!draft?.transportServiceSupplier
        || cats.includes('GTA')
        || cats.includes('COURIER');

    const completeness = useMemo(() => profileCompleteness(supplier), [supplier]);

    const load = useCallback(async () => {
        if (!ledgerId) {
            setSupplier(null);
            setDraft(null);
            setAmbiguous(false);
            setMatchCount(0);
            return;
        }
        setLoading(true);
        try {
            const data = await getSuppliersByLedgerId(ledgerId);
            setMatchCount(data.matchCount || 0);
            setAmbiguous(!!data.ambiguous);
            if (data.ambiguous) {
                setSupplier(null);
                setDraft(null);
                return;
            }
            const s = data.suppliers?.[0] || null;
            setSupplier(s);
            setDraft(s ? { ...s } : null);
            setClearedGstinUi(false);
            if (s && onMirrorToLedger) {
                onMirrorToLedger({
                    registrationType: mapStatusToLedgerRegistration(s.gstRegistrationStatus) || undefined,
                    gstin: GST_STATUS_HIDE_GSTIN.has(s.gstRegistrationStatus) ? '' : (s.gstNumber || undefined),
                    state: s.state || undefined,
                    pan: s.panNumber || undefined,
                });
            }
        } catch {
            toast.error('Failed to load Supplier Tax Profile');
        } finally {
            setLoading(false);
        }
    }, [ledgerId, onMirrorToLedger]);

    useEffect(() => { load(); }, [load]);

    const setField = (key, value) => {
        setDraft((prev) => {
            if (!prev) return prev;
            const next = { ...prev, [key]: value };
            if (key === 'gstRegistrationStatus' && GST_STATUS_HIDE_GSTIN.has(value)) {
                // Clear only unsaved UI GSTIN; keep historical on save unless explicitly blanked
                if (!String(prev.gstNumber || '').trim() || clearedGstinUi) {
                    next.gstNumber = '';
                } else if (window.confirm('Hide GSTIN for this registration status. Clear the displayed GSTIN value in this form? (Saved GSTIN is only cleared if you Save.)')) {
                    next.gstNumber = '';
                    setClearedGstinUi(true);
                }
            }
            if (key === 'defaultRcmCategories' && Array.isArray(value) && value.includes('RENT') && !next.defaultPropertyType) {
                // no auto legal conclusion
            }
            return next;
        });
    };

    const toggleCategory = (code) => {
        const cur = Array.isArray(draft?.defaultRcmCategories) ? [...draft.defaultRcmCategories] : [];
        const next = cur.includes(code) ? cur.filter((c) => c !== code) : [...cur, code];
        setField('defaultRcmCategories', next);
    };

    const handleSyncOrCreate = async () => {
        if (!ledgerId) {
            toast.error('Save the ledger first, then create / open Supplier Tax Profile.');
            return;
        }
        if (!window.confirm(
            supplier
                ? 'Reload / open the linked Supplier Tax Profile for this ledger?'
                : 'No linked Supplier exists. Create Supplier Tax Profile for this ledger? (Links by ledgerId — not by name.)',
        )) return;
        setSyncing(true);
        try {
            const data = await ensureSupplierForLedger({
                ledgerId,
                companyId: selectedCompany?._id || null,
                supplierName: ledgerName,
            });
            setSupplier(data.supplier);
            setDraft({ ...data.supplier });
            setAmbiguous(false);
            setMatchCount(1);
            toast.success(data.created ? 'Supplier Tax Profile created and linked' : 'Linked Supplier Tax Profile loaded');
            if (onMirrorToLedger && data.supplier) {
                onMirrorToLedger({
                    registrationType: mapStatusToLedgerRegistration(data.supplier.gstRegistrationStatus) || undefined,
                    gstin: GST_STATUS_HIDE_GSTIN.has(data.supplier.gstRegistrationStatus)
                        ? ''
                        : (data.supplier.gstNumber || undefined),
                });
            }
        } catch (err) {
            const msg = err?.response?.data?.message || err.message || 'Sync failed';
            const payload = err?.response?.data?.data;
            if (err?.response?.status === 409 || payload?.resolution === 'ambiguous') {
                setAmbiguous(true);
                setMatchCount(payload?.matchCount || 0);
                toast.error(msg);
            } else {
                toast.error(msg);
            }
        } finally {
            setSyncing(false);
        }
    };

    const handleSaveProfile = async () => {
        if (!draft?._id) {
            toast.error('Create / link Supplier Tax Profile first');
            return;
        }
        if (GST_STATUS_REQUIRES_GSTIN.has(draft.gstRegistrationStatus)) {
            const g = String(draft.gstNumber || '').trim();
            if (!g || g.length < 15) {
                toast.error('GSTIN is required for this GST Registration Status');
                return;
            }
        }
        setSaving(true);
        try {
            const payload = {
                supplierName: draft.supplierName || ledgerName,
                gstRegistrationStatus: draft.gstRegistrationStatus || '',
                gstNumber: GST_STATUS_HIDE_GSTIN.has(draft.gstRegistrationStatus) ? '' : (draft.gstNumber || ''),
                supplierChargesGst: draft.supplierChargesGst || '',
                defaultPlaceOfSupply: draft.defaultPlaceOfSupply || '',
                defaultRcmTreatment: draft.defaultRcmTreatment || '',
                defaultRcmCategories: Array.isArray(draft.defaultRcmCategories) ? draft.defaultRcmCategories : [],
                defaultPropertyType: draft.defaultPropertyType || '',
                transportServiceSupplier: !!draft.transportServiceSupplier,
                transportSupplierType: draft.transportSupplierType || '',
                consignmentNoteNormallyIssued: draft.consignmentNoteNormallyIssued || '',
                transportGstPaymentOption: draft.transportGstPaymentOption || '',
                defaultTransportRcmCategory: draft.defaultTransportRcmCategory || '',
                state: draft.state || '',
                panNumber: draft.panNumber || '',
                ledgerId,
                companyId: selectedCompany?._id || draft.companyId || null,
            };
            const updated = await updateSupplier(draft._id, payload);
            setSupplier(updated);
            setDraft({ ...updated });
            toast.success('Supplier Tax Profile saved (defaults only — does not post RCM)');
            if (onMirrorToLedger) {
                onMirrorToLedger({
                    registrationType: mapStatusToLedgerRegistration(updated.gstRegistrationStatus) || undefined,
                    gstin: GST_STATUS_HIDE_GSTIN.has(updated.gstRegistrationStatus) ? '' : (updated.gstNumber || ''),
                    state: updated.state || undefined,
                    pan: updated.panNumber || undefined,
                });
            }
        } catch (err) {
            toast.error(err?.response?.data?.message || 'Failed to save Supplier Tax Profile');
        } finally {
            setSaving(false);
        }
    };

    if (!ledgerId) {
        return (
            <div style={{ marginBottom: 20, padding: 14, borderRadius: 10, border: '1px solid #fde68a', background: '#fffbeb' }}>
                <div style={sectionTitle}><Link2 size={13} /> Supplier / Creditor Tax Profile</div>
                <p style={{ fontSize: 12, color: '#92400e', margin: 0, lineHeight: 1.45 }}>
                    Save this Sundry Creditor ledger first, then use <strong>Create / Open Supplier Tax Profile</strong>.
                    GST/RCM defaults live in Supplier Master (single source of truth) — not as a second ledger tax profile.
                </p>
            </div>
        );
    }

    return (
        <div
            style={{ marginBottom: 20, padding: 14, borderRadius: 10, border: '1px solid #bfdbfe', background: '#f8fbff' }}
            data-jsk-ui-component="creditor-supplier-tax-profile"
        >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start', marginBottom: 10 }}>
                <div>
                    <div style={sectionTitle}><Link2 size={13} /> Supplier / Creditor GST &amp; RCM Profile</div>
                    <div style={{ fontSize: 12, color: '#1e40af', fontWeight: 700 }}>
                        Status: {ambiguous ? 'Review Required — multiple suppliers' : completeness}
                    </div>
                    <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
                        Source of truth: Supplier Master · Defaults only · Never auto-posts RCM · Link by ledgerId (never name-only)
                    </div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button
                        type="button"
                        onClick={handleSyncOrCreate}
                        disabled={syncing || loading}
                        style={{
                            padding: '8px 12px', borderRadius: 8, border: '1.5px solid #86efac',
                            background: '#f0fdf4', color: '#166534', fontWeight: 700, fontSize: 12, cursor: 'pointer',
                        }}
                    >
                        {syncing ? <Loader2 size={12} className="animate-spin" /> : null}
                        {supplier ? 'Reload Supplier Profile' : 'Create / Open Supplier Tax Profile'}
                    </button>
                    {supplier?._id ? (
                        <a
                            href={`${PATHS.PURCHASE.SUPPLIERS}?edit=${supplier._id}`}
                            target="_blank"
                            rel="noreferrer"
                            style={{
                                padding: '8px 12px', borderRadius: 8, border: '1.5px solid #93c5fd',
                                background: '#eff6ff', color: '#1d4ed8', fontWeight: 700, fontSize: 12,
                                textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4,
                            }}
                        >
                            Open Supplier Master <ExternalLink size={12} />
                        </a>
                    ) : null}
                </div>
            </div>

            {loading ? <div style={{ fontSize: 12, color: '#64748b' }}>Loading linked supplier…</div> : null}
            {ambiguous ? (
                <div style={{ fontSize: 12, color: '#b45309', marginBottom: 8 }}>
                    Multiple suppliers ({matchCount}) link to this ledger. Do not auto-pick. Resolve in Supplier Master.
                </div>
            ) : null}

            {draft?._id ? (
                <>
                    <div style={{ ...grid3, marginBottom: 12 }}>
                        <div>
                            <label style={label}>GST Registration Status</label>
                            <select
                                value={draft.gstRegistrationStatus || ''}
                                onChange={(e) => setField('gstRegistrationStatus', e.target.value)}
                                style={select}
                            >
                                <option value="">— Select —</option>
                                {['Registered Regular', 'Composition', 'Unregistered', 'SEZ', 'Overseas', 'Exempt Entity', 'Not Applicable'].map((v) => (
                                    <option key={v} value={v}>{v}</option>
                                ))}
                            </select>
                        </div>
                        {showGstin && !hideGstin ? (
                            <div>
                                <label style={label}>GSTIN *</label>
                                <input
                                    value={draft.gstNumber || ''}
                                    onChange={(e) => setField('gstNumber', e.target.value.toUpperCase())}
                                    style={{ ...input, fontFamily: 'monospace' }}
                                    placeholder="22AAAAA0000A1Z5"
                                    maxLength={15}
                                />
                            </div>
                        ) : (
                            <div>
                                <label style={label}>GSTIN</label>
                                <input
                                    value=""
                                    disabled
                                    style={{ ...input, background: '#f1f5f9', color: '#94a3b8' }}
                                    placeholder="Hidden — not required for this status"
                                />
                                <span style={{ fontSize: 10, color: '#b45309' }}>
                                    Blank GSTIN alone does not create RCM. Do not invent a GSTIN.
                                </span>
                            </div>
                        )}
                        <div>
                            <label style={label}>Supplier Charges GST</label>
                            <select
                                value={draft.supplierChargesGst || ''}
                                onChange={(e) => setField('supplierChargesGst', e.target.value)}
                                style={select}
                            >
                                <option value="">— Select —</option>
                                {['Forward Charge', 'Reverse Charge', 'Transaction-wise', 'Not Applicable'].map((v) => (
                                    <option key={v} value={v}>{v}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label style={label}>Default Place of Supply</label>
                            <input
                                value={draft.defaultPlaceOfSupply || ''}
                                onChange={(e) => setField('defaultPlaceOfSupply', e.target.value)}
                                style={input}
                            />
                        </div>
                        <div>
                            <label style={label}>Default RCM Treatment</label>
                            <select
                                value={draft.defaultRcmTreatment || ''}
                                onChange={(e) => setField('defaultRcmTreatment', e.target.value)}
                                style={select}
                            >
                                <option value="">— Select —</option>
                                {['Not Applicable', 'RCM May Apply', 'Default RCM Supplier', 'Transaction-wise Review'].map((v) => (
                                    <option key={v} value={v}>{v}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div style={{ marginBottom: 12 }}>
                        <label style={label}>Default RCM Categories (canonical codes)</label>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                            {RCM_CATEGORY_CODES.map((code) => (
                                <label key={code} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
                                    <input
                                        type="checkbox"
                                        checked={cats.includes(code)}
                                        onChange={() => toggleCategory(code)}
                                    />
                                    {code}
                                </label>
                            ))}
                        </div>
                        <span style={{ fontSize: 10, color: '#64748b' }}>
                            Labels are codes; approved rule titles come from RCM Rule Master at evaluation.
                        </span>
                    </div>

                    {(showRent || cats.includes('RENT')) && (
                        <div style={{ marginBottom: 12, padding: 10, borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff' }}>
                            <div style={{ ...sectionTitle, fontSize: 11, marginBottom: 10 }}>Rent / Property Profile</div>
                            <div style={grid3}>
                                <div>
                                    <label style={label}>Default Property Type</label>
                                    <select
                                        value={draft.defaultPropertyType || ''}
                                        onChange={(e) => setField('defaultPropertyType', e.target.value)}
                                        style={select}
                                    >
                                        <option value="">— Select —</option>
                                        {['Commercial', 'Residential', 'Mixed', 'Other', 'Transaction-wise'].map((v) => (
                                            <option key={v} value={v}>{v}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label style={label}>Default RCM Category</label>
                                    <input value="RENT" disabled style={{ ...input, background: '#f8fafc' }} />
                                </div>
                            </div>
                        </div>
                    )}

                    <div style={{ marginBottom: 12 }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                            <input
                                type="checkbox"
                                checked={!!draft.transportServiceSupplier}
                                onChange={(e) => setField('transportServiceSupplier', e.target.checked)}
                            />
                            Transport Service Supplier
                        </label>
                    </div>

                    {showTransport && (
                        <div style={{ marginBottom: 12, padding: 10, borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff' }}>
                            <div style={{ ...sectionTitle, fontSize: 11, marginBottom: 10 }}>Transport / GTA Profile</div>
                            <div style={grid3}>
                                <div>
                                    <label style={label}>Transport Supplier Type</label>
                                    <select
                                        value={draft.transportSupplierType || ''}
                                        onChange={(e) => setField('transportSupplierType', e.target.value)}
                                        style={select}
                                    >
                                        <option value="">— Select —</option>
                                        {[
                                            'GTA — Issues Consignment Note',
                                            'Courier Agency',
                                            'Local Transporter — No Consignment Note',
                                            'Vehicle Owner / Vehicle Hire',
                                            'Parcel Service',
                                            'Freight Forwarder',
                                            'Other',
                                        ].map((v) => (
                                            <option key={v} value={v}>{v}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label style={label}>Consignment Note Normally Issued</label>
                                    <select
                                        value={draft.consignmentNoteNormallyIssued || ''}
                                        onChange={(e) => setField('consignmentNoteNormallyIssued', e.target.value)}
                                        style={select}
                                    >
                                        <option value="">— Select —</option>
                                        {['Yes', 'No', 'Transaction-wise'].map((v) => (
                                            <option key={v} value={v}>{v}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label style={label}>GST Payment Option</label>
                                    <select
                                        value={draft.transportGstPaymentOption || ''}
                                        onChange={(e) => setField('transportGstPaymentOption', e.target.value)}
                                        style={select}
                                    >
                                        <option value="">— Select —</option>
                                        {[
                                            'Recipient Pays under RCM',
                                            'Supplier Pays under Forward Charge',
                                            'Exempt / Not Applicable',
                                            'Transaction-wise',
                                            'Unknown / Review Required',
                                        ].map((v) => (
                                            <option key={v} value={v}>{v}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label style={label}>Default Transport RCM Category</label>
                                    <select
                                        value={draft.defaultTransportRcmCategory || ''}
                                        onChange={(e) => setField('defaultTransportRcmCategory', e.target.value)}
                                        style={select}
                                    >
                                        <option value="">— Select —</option>
                                        {['GTA', 'COURIER', 'OTHER', 'None'].map((v) => (
                                            <option key={v} value={v}>{v}</option>
                                        ))}
                                    </select>
                                    <span style={{ fontSize: 10, color: '#64748b' }}>
                                        Courier / local transport must not auto-become GTA RCM.
                                    </span>
                                </div>
                            </div>
                        </div>
                    )}

                    <button
                        type="button"
                        onClick={handleSaveProfile}
                        disabled={saving}
                        style={{
                            padding: '10px 16px', borderRadius: 8, border: 'none',
                            background: '#1d4ed8', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer',
                        }}
                    >
                        {saving ? 'Saving…' : 'Save Supplier Tax Profile'}
                    </button>
                </>
            ) : (
                !loading && !ambiguous ? (
                    <p style={{ fontSize: 12, color: '#64748b', margin: 0 }}>
                        No Supplier linked yet. Click <strong>Create / Open Supplier Tax Profile</strong>.
                    </p>
                ) : null
            )}
        </div>
    );
}

export { GST_STATUS_HIDE_GSTIN, GST_STATUS_REQUIRES_GSTIN, mapStatusToLedgerRegistration };
