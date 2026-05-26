import React, { useState, useEffect, useMemo } from 'react';
import { 
    BookOpen, ShieldCheck, Landmark, MapPin, CreditCard, Loader2, Percent,
} from 'lucide-react';
import { getSuppliers } from '@/services/purchaseApi';
import { fetchGeocodeAddress } from '@/services/locationApi';
import { tdsComplianceApi } from '@/services/tdsComplianceApi';
import { toast } from 'react-hot-toast';

const s = {
    label: { fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4, display: 'block' },
    input: { width: '100%', border: '1.5px solid #e5e7eb', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: '#111827', outline: 'none', background: '#fff', boxSizing: 'border-box' },
    select: { width: '100%', border: '1.5px solid #e5e7eb', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: '#111827', background: '#fff', boxSizing: 'border-box' },
    sectionTitle: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 800, color: '#1d4ed8', textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '2px solid #dbeafe', paddingBottom: 8, marginBottom: 14 },
};

const TDS_SECTION_OPTIONS = ['194C', '194J', '194H', '194I', '194IB', '194A', '194Q', '194M', '194R', '194S', '194O', '195', 'OTHER'];

/** Indian income-tax PAN: 5 letters + 4 digits + 1 letter */
const PAN_FORMAT_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

/** PAN embedded in GSTIN is positions 3–12 (0-based slice 2..12). Shorter values fall back to first 10 chars. */
function panSuggestFromGstin(gstin) {
    const g = String(gstin || '')
        .trim()
        .toUpperCase()
        .replace(/\s/g, '');
    if (g.length < 10) return '';
    if (g.length >= 12) return g.slice(2, 12);
    return g.slice(0, 10);
}

/** Matches backend `DEDUCTEE_CONSTITUTION` — optional ledger override; blank = use Supplier Master. */
const DEDUCTEE_CONSTITUTION_OPTIONS = [
    '',
    'Individual',
    'HUF',
    'Partnership Firm',
    'LLP',
    'Private Limited Company',
    'Public Limited Company',
    'Proprietorship',
    'Trust',
    'Society',
    'Others',
];

export const EMPTY = {
    name: '', printName: '', alias: '', underGroup: '', expenseCategory: 'Variable', openingBalance: 0, drCr: 'Dr', creditPeriod: 0, isBillWise: false, gstApplicable: false, gstRate: 0, hsnCode: '', gstin: '', pan: '', registrationType: 'Regular', mobile: '', email: '', address: '', city: '', state: '', pincode: '', bankName: '', accountNo: '', ifsc: '',
    tdsApplicable: false, tdsSection: '', tdsRateSource: 'auto', tdsDefaultRate: 0, tdsThresholdOverride: 0, tdsPanMandatory: false,
    tdsPanAssumedAvailable: true, tdsPanStatus: '', tdsDeductOn: 'with_gst', tdsDeducteeConstitution: '',
    tdsDeductorType: 'Others', tdsLowerDeductionPercent: 0, tdsLowerDeductionValidFrom: '', tdsLowerDeductionValidTo: '',
    tdsStartDate: '', msmeApplicable: false, tdsIgnoreThreshold: false,
};

const LedgerForm = ({ initial = EMPTY, groups = [], onSave, onCancel, loading }) => {
    const [form, setForm] = useState({ ...EMPTY, ...initial, underGroup: initial.underGroup?._id || initial.underGroup || '' });
    const [isFetchingPin, setIsFetchingPin] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);

    const [tdsMasterRow, setTdsMasterRow] = useState(null);

    // Derived Nature of the selected group
    const selectedGroup = useMemo(() => groups.find(g => g._id === form.underGroup), [groups, form.underGroup]);
    const nature = selectedGroup?.nature; // 'Assets', 'Liabilities', 'Income', 'Expenses'
    const isPnL = nature === 'Income' || nature === 'Expenses';
    const showTdsBlock =
        nature === 'Expenses' ||
        selectedGroup?.name === 'Sundry Creditors' ||
        form.type === 'Supplier';

    /** Balance-sheet ledgers + ledgers that may need TDS / party PAN (expenses, creditors, supplier). */
    const showTaxDetails = !isPnL || showTdsBlock;

    useEffect(() => {
        let cancelled = false;
        const sec = String(form.tdsSection || '').trim();
        if (!form.tdsApplicable || !sec) {
            setTdsMasterRow(null);
            return;
        }
        (async () => {
            try {
                const row = await tdsComplianceApi.getMasterSection(sec);
                if (!cancelled) setTdsMasterRow(row);
            } catch {
                if (!cancelled) setTdsMasterRow(null);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [form.tdsApplicable, form.tdsSection]);

    // Auto-sync behavior for P&L accounts
    useEffect(() => {
        if (nature === 'Expenses') {
            setForm(prev => ({ ...prev, drCr: 'Dr', openingBalance: 0, creditPeriod: 0, isBillWise: false }));
        } else if (nature === 'Income') {
            setForm(prev => ({ ...prev, drCr: 'Cr', openingBalance: 0, creditPeriod: 0, isBillWise: false }));
        }
    }, [nature]);

    useEffect(() => {
        if (!form.gstApplicable || !form.gstin) return;
        const suggested = panSuggestFromGstin(form.gstin);
        if (!suggested || !PAN_FORMAT_RE.test(suggested)) return;
        setForm((prev) => {
            if (String(prev.pan || '').trim()) return prev;
            return { ...prev, pan: suggested };
        });
    }, [form.gstApplicable, form.gstin]);

    const handleSyncSupplier = async () => {
        if (!form.name || !form.name.trim()) {
            toast.error('Please enter a Ledger Name first');
            return;
        }
        setIsSyncing(true);
        try {
            const res = await getSuppliers({ search: form.name.trim(), limit: 1 });
            const matchingSup = res.suppliers?.find(s => 
                s.supplierName.toLowerCase().trim() === form.name.toLowerCase().trim()
            );

            if (!matchingSup) {
                toast.error('No matching supplier found in Supplier Master with this name');
                return;
            }

            setForm(prev => ({
                ...prev,
                gstin: matchingSup.gstNumber || prev.gstin,
                pan: matchingSup.panNumber || prev.pan,
                mobile: matchingSup.phone || prev.mobile,
                email: matchingSup.email || prev.email,
                contactPerson: matchingSup.contactPerson || prev.contactPerson,
                address: matchingSup.address || prev.address,
                city: matchingSup.city || prev.city,
                state: matchingSup.state || prev.state,
                pincode: matchingSup.pincode || prev.pincode,
                bankName: matchingSup.bankName || prev.bankName,
                accountNo: matchingSup.bankAccountNo || prev.accountNo,
                ifsc: matchingSup.bankIfsc || prev.ifsc,
                openingBalance: matchingSup.openingBalance || prev.openingBalance,
                drCr: matchingSup.openingBalanceDrCr || prev.drCr,
                gstApplicable: matchingSup.gstNumber ? true : prev.gstApplicable,
                tdsDeducteeConstitution: matchingSup.deducteeConstitution || prev.tdsDeducteeConstitution || '',
            }));
            toast.success('Details synced from Supplier Master!');
        } catch (err) {
            toast.error('Failed to sync with Supplier Master');
        } finally {
            setIsSyncing(false);
        }
    };

    const handleFetchPin = async () => {
        if (!form.address || !form.address.trim()) {
            toast.error('Please enter an address first');
            return;
        }
        setIsFetchingPin(true);
        try {
            const data = await fetchGeocodeAddress(form.address);
            let updatedPin = false;
            
            setForm(prev => {
                const newForm = { ...prev };
                if (data.postalCode && (!newForm.pincode || !newForm.pincode.trim())) {
                    newForm.pincode = data.postalCode;
                    updatedPin = true;
                }
                if (data.city && (!newForm.city || !newForm.city.trim())) {
                    newForm.city = data.city.toUpperCase();
                }
                if (data.state && (!newForm.state || !newForm.state.trim())) {
                    newForm.state = data.state.toUpperCase();
                }
                return newForm;
            });

            if (updatedPin) {
                toast.success('PIN code fetched successfully!');
            } else if (!data.postalCode) {
                toast('PIN code not found from Google for this address.', { icon: 'ℹ️' });
            } else {
                toast('Address data fetched. Existing fields were not overwritten.', { icon: 'ℹ️' });
            }
        } catch (error) {
            toast.error(error?.response?.data?.message || error.message || 'Failed to fetch PIN from Google');
        } finally {
            setIsFetchingPin(false);
        }
    };

    const set = (name, value) => setForm(p => ({ ...p, [name]: value }));
    const change = e => {
        const { name, value, type, checked } = e.target;
        if (name === 'pan') {
            set(name, String(value).toUpperCase());
            return;
        }
        if (name === 'gstin') {
            set(name, String(value).toUpperCase());
            return;
        }
        set(name, type === 'checkbox' ? checked : value);
    };

    const handleSaveClick = () => {
        const panRaw = String(form.pan || '').trim().toUpperCase();
        if (panRaw && !PAN_FORMAT_RE.test(panRaw)) {
            toast.error('Invalid PAN format.');
            return;
        }
        onSave({ ...form, pan: panRaw });
    };

    const grid2 = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 };
    const grid3 = { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 };
    const mb = { marginBottom: 14 };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            <div style={{ maxHeight: '62vh', overflowY: 'auto', padding: '2px 4px 12px' }}>
                {/* Basic */}
                <div style={{ marginBottom: 20 }}>
                    <div style={s.sectionTitle}><BookOpen size={13} /> Basic Details</div>
                    <div style={{ ...grid2, ...mb }}>
                        <div>
                            <label style={s.label}>Ledger Name *</label>
                            <div style={{ display: 'flex', gap: 6 }}>
                                <input name="name" value={form.name} onChange={change} style={s.input} placeholder="e.g. ABC Trading Co." />
                                {groups.find(g => g._id === form.underGroup)?.name === 'Sundry Creditors' && (
                                    <button 
                                        type="button" 
                                        onClick={handleSyncSupplier}
                                        disabled={isSyncing}
                                        title="Sync details from Supplier Master"
                                        style={{ padding: '0 10px', height: '33px', background: '#f0fdf4', border: '1.5px solid #bbf7d0', borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', color: '#166534', fontSize: 11, fontWeight: 700, gap: 4, whiteSpace: 'nowrap' }}
                                    >
                                        {isSyncing ? <Loader2 size={12} className="animate-spin" /> : <span>Sync Master</span>}
                                    </button>
                                )}
                            </div>
                        </div>
                        <div><label style={s.label}>Under Group *</label>
                            <select name="underGroup" value={form.underGroup} onChange={change} style={s.select}>
                                <option value="">— Select Group —</option>
                                {groups.map(g => <option key={g._id} value={g._id}>{g.name}</option>)}
                            </select>
                        </div>
                    </div>

                    {nature === 'Expenses' && (
                        <div style={{ ...mb, background: '#f8fafc', padding: '12px', borderRadius: 10, border: '1px solid #e2e8f0' }}>
                            <label style={s.label}>Expense Category (Fixed vs Variable)</label>
                            <div style={{ display: 'flex', gap: 12, marginTop: 6 }}>
                                {['Fixed', 'Variable'].map(cat => (
                                    <label key={cat} style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10, padding: '10px 15px', background: form.expenseCategory === cat ? '#eff6ff' : '#fff', border: `1.5px solid ${form.expenseCategory === cat ? '#3b82f6' : '#e5e7eb'}`, borderRadius: 8, cursor: 'pointer', transition: 'all 0.2s', boxShadow: form.expenseCategory === cat ? '0 2px 4px rgba(59,130,246,0.1)' : 'none' }}>
                                        <input 
                                            type="radio" 
                                            name="expenseCategory" 
                                            value={cat} 
                                            checked={form.expenseCategory === cat} 
                                            onChange={change} 
                                            style={{ cursor: 'pointer', width: 16, height: 16 }}
                                        />
                                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                                            <span style={{ fontSize: 13, fontWeight: 700, color: form.expenseCategory === cat ? '#1e40af' : '#374151' }}>{cat} Expense</span>
                                            <span style={{ fontSize: 10, color: form.expenseCategory === cat ? '#60a5fa' : '#94a3b8' }}>
                                                {cat === 'Fixed' ? 'Rent, Salary, etc.' : 'Materials, Commission, etc.'}
                                            </span>
                                        </div>
                                    </label>
                                ))}
                            </div>
                        </div>
                    )}
                    <div style={{ ...grid2, ...mb }}>
                        <div><label style={s.label}>Print Name</label><input name="printName" value={form.printName} onChange={change} style={s.input} placeholder="Same as name if blank" /></div>
                        <div><label style={s.label}>Alias</label><input name="alias" value={form.alias} onChange={change} style={s.input} /></div>
                    </div>
                </div>

                {/* Balances: Hidden for P&L accounts as per user request */}
                {!isPnL && (
                    <div style={{ marginBottom: 20 }}>
                        <div style={s.sectionTitle}><CreditCard size={13} /> Balances & Behaviour</div>
                        <div style={{ ...grid3, ...mb }}>
                            <div><label style={s.label}>Opening Balance (₹)</label><input type="number" name="openingBalance" value={form.openingBalance} onChange={change} style={s.input} /></div>
                            <div><label style={s.label}>Dr / Cr</label>
                                <select name="drCr" value={form.drCr} onChange={change} style={s.select}>
                                    <option value="Dr">Dr</option>
                                    <option value="Cr">Cr</option>
                                </select>
                            </div>
                            <div><label style={s.label}>Credit Period (Days)</label><input type="number" name="creditPeriod" value={form.creditPeriod} onChange={change} style={s.input} /></div>
                        </div>
                        <div style={{ display: 'flex', gap: 24, ...mb }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', color: '#374151' }}>
                                <input type="checkbox" name="isBillWise" checked={form.isBillWise} onChange={change} style={{ accentColor: '#2563eb' }} />
                                Maintain Bill-wise?
                            </label>
                        </div>
                    </div>
                )}

                {showTaxDetails && (
                    <div style={{ marginBottom: 20 }}>
                        <div style={s.sectionTitle}><ShieldCheck size={13} /> Tax Details</div>
                        <div style={{ ...grid2, ...mb }}>
                            <div>
                                <label style={s.label}>PAN No</label>
                                <input
                                    name="pan"
                                    value={form.pan}
                                    onChange={change}
                                    style={s.input}
                                    placeholder="e.g. ABCDE1234F"
                                    maxLength={10}
                                />
                            </div>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', color: '#374151', alignSelf: 'end', paddingBottom: 4 }}>
                                <input type="checkbox" name="gstApplicable" checked={form.gstApplicable} onChange={change} style={{ accentColor: '#2563eb' }} />
                                GST Applicable
                            </label>
                        </div>
                        {form.gstApplicable && !isPnL && (
                            <>
                                <div style={{ ...grid3, ...mb }}>
                                    <div><label style={s.label}>GSTIN</label><input name="gstin" value={form.gstin} onChange={change} style={s.input} placeholder="22AAAAA0000A1Z5" /></div>
                                    <div>
                                        <label style={s.label}>GST Registration Type</label>
                                        <select name="registrationType" value={form.registrationType} onChange={change} style={s.select}>
                                            {['Regular', 'Composition', 'Unregistered', 'Consumer'].map((v) => (
                                                <option key={v} value={v}>
                                                    {v}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label style={s.label}>GST State</label>
                                        <input name="state" value={form.state} onChange={change} style={s.input} placeholder="e.g. MAHARASHTRA" />
                                    </div>
                                </div>
                                <div style={mb}>
                                    <label style={s.label}>HSN/SAC Code</label>
                                    <input name="hsnCode" value={form.hsnCode} onChange={change} style={s.input} />
                                </div>
                            </>
                        )}
                        {form.gstApplicable && isPnL && (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'flex-end', ...mb }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <label style={{ ...s.label, marginBottom: 0 }}>GST Rate (%)</label>
                                    <input
                                        type="number"
                                        name="gstRate"
                                        value={form.gstRate}
                                        onChange={change}
                                        style={{ ...s.input, width: 80, padding: '4px 8px' }}
                                        placeholder="e.g. 18"
                                    />
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <label style={{ ...s.label, marginBottom: 0 }}>HSN/SAC</label>
                                    <input
                                        name="hsnCode"
                                        value={form.hsnCode}
                                        onChange={change}
                                        style={{ ...s.input, width: 100, padding: '4px 8px' }}
                                        placeholder="Code"
                                    />
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {showTdsBlock && (
                    <div style={{ marginBottom: 20, background: '#faf5ff', border: '1px solid #e9d5ff', borderRadius: 10, padding: '14px 16px' }}>
                        <div style={s.sectionTitle}><Percent size={13} /> TDS (Income Tax)</div>
                        <p style={{ fontSize: 12, color: '#6b21a8', marginTop: -6, marginBottom: 12 }}>
                            Used when this ledger is linked to a supplier. With <strong>Auto</strong>, rate comes from TDS Master using section + deductee constitution (and PAN rules). Custom aggregate threshold 0 uses the section default from TDS Master.
                        </p>
                        {form.tdsApplicable && !String(form.pan || '').trim() && (
                            <p style={{ fontSize: 12, color: '#b45309', marginBottom: 12, lineHeight: 1.45 }}>
                                PAN is required for normal TDS deduction. If PAN is not available, higher TDS rate may apply.
                            </p>
                        )}
                        <div style={{ ...grid3, ...mb }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', color: '#374151', alignSelf: 'end', paddingBottom: 4 }}>
                                <input type="checkbox" name="tdsApplicable" checked={!!form.tdsApplicable} onChange={change} style={{ accentColor: '#7c3aed' }} />
                                TDS applicable
                            </label>
                            <div>
                                <label style={s.label}>TDS section *</label>
                                <select name="tdsSection" value={form.tdsSection || ''} onChange={change} style={s.select}>
                                    <option value="">— Select —</option>
                                    {TDS_SECTION_OPTIONS.map((code) => (
                                        <option key={code} value={code}>{code}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                        {form.tdsApplicable && !String(form.tdsSection || '').trim() && (
                            <p style={{ fontSize: 12, color: '#b45309', marginBottom: 10 }}>Select a section before saving — TDS Applicable requires a section.</p>
                        )}
                        {form.tdsApplicable && String(form.tdsSection || '').trim() && (
                            <p style={{ fontSize: 12, color: '#5b21b6', marginBottom: 10, lineHeight: 1.5 }}>
                                <strong>TDS Payable ledger</strong> (from TDS Master, section {form.tdsSection}):{' '}
                                {tdsMasterRow?.tdsPayableLedgerId && typeof tdsMasterRow.tdsPayableLedgerId === 'object'
                                    ? tdsMasterRow.tdsPayableLedgerId.name
                                    : tdsMasterRow?.tdsPayableLedgerId
                                      ? String(tdsMasterRow.tdsPayableLedgerId)
                                      : (
                                          <span style={{ color: '#b45309' }}>
                                              Not mapped — use Accounts → TDS Compliance → Section rates → Create/Map.
                                          </span>
                                      )}
                            </p>
                        )}
                        <div style={{ ...mb, marginTop: 12 }}>
                            <label style={s.label}>TDS rate source</label>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginTop: 6 }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', color: '#374151' }}>
                                    <input type="radio" name="tdsRateSource" value="auto" checked={(form.tdsRateSource || 'auto') === 'auto'} onChange={change} style={{ accentColor: '#7c3aed' }} />
                                    Auto from TDS Master
                                </label>
                                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', color: '#374151' }}>
                                    <input type="radio" name="tdsRateSource" value="manual" checked={(form.tdsRateSource || 'auto') === 'manual'} onChange={change} style={{ accentColor: '#7c3aed' }} />
                                    Manual override
                                </label>
                            </div>
                        </div>
                        <div style={{ ...mb }}>
                            <label style={s.label}>Manual TDS rate (%)</label>
                            <input
                                type="number"
                                name="tdsDefaultRate"
                                min={0}
                                max={100}
                                step="0.01"
                                value={form.tdsDefaultRate ?? ''}
                                onChange={change}
                                disabled={(form.tdsRateSource || 'auto') !== 'manual'}
                                style={{ ...s.input, maxWidth: 280, opacity: (form.tdsRateSource || 'auto') !== 'manual' ? 0.55 : 1 }}
                                title="Used only when Manual override is selected."
                            />
                        </div>
                        <div style={mb}>
                            <label style={s.label} title="If value is 0, system uses section default threshold from TDS Master.">Custom aggregate threshold override (₹)</label>
                            <input type="number" name="tdsThresholdOverride" min={0} step="1" value={form.tdsThresholdOverride ?? 0} onChange={change} style={{ ...s.input, maxWidth: 320 }} placeholder="0 = section default (FY aggregate only)" />
                            <span style={{ fontSize: 10, color: '#6b21a8', display: 'block', marginTop: 4 }}>
                                If value is 0, system uses section default aggregate threshold from TDS Master. Does not change section, rate, PAN logic, or single-bill limits.
                            </span>
                        </div>
                        <div style={{ ...mb, marginTop: 12 }}>
                            <label style={s.label}>Deduct TDS on</label>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginTop: 6 }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', color: '#374151' }}>
                                    <input type="radio" name="tdsDeductOn" value="taxable" checked={(form.tdsDeductOn || 'with_gst') === 'taxable'} onChange={change} style={{ accentColor: '#7c3aed' }} />
                                    Taxable value
                                </label>
                                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', color: '#374151' }}>
                                    <input type="radio" name="tdsDeductOn" value="with_gst" checked={(form.tdsDeductOn || 'with_gst') === 'with_gst'} onChange={change} style={{ accentColor: '#7c3aed' }} />
                                    Value including GST
                                </label>
                            </div>
                        </div>
                        <div style={{ ...mb }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', color: '#374151' }}>
                                <input type="checkbox" name="tdsPanAssumedAvailable" checked={form.tdsPanAssumedAvailable !== false} onChange={change} style={{ accentColor: '#7c3aed' }} />
                                PAN available (unchecked: treat as no PAN — higher rate per 206AA vs TDS Master)
                            </label>
                        </div>
                        <div style={{ ...mb }}>
                            <label style={s.label}>Deductee type / constitution (ledger override)</label>
                            <select name="tdsDeducteeConstitution" value={form.tdsDeducteeConstitution || ''} onChange={change} style={s.select}>
                                {DEDUCTEE_CONSTITUTION_OPTIONS.map((opt) => (
                                    <option key={opt || 'supplier'} value={opt}>{opt ? opt : '— Use Supplier Master —'}</option>
                                ))}
                            </select>
                        </div>
                        <div style={{ ...grid3, ...mb, marginTop: 12 }}>
                            <div>
                                <label style={s.label}>PAN status</label>
                                <select name="tdsPanStatus" value={form.tdsPanStatus || ''} onChange={change} style={s.select}>
                                    <option value="">— Auto from PAN —</option>
                                    <option value="Valid">Valid</option>
                                    <option value="Invalid">Invalid</option>
                                    <option value="NotAvailable">Not available</option>
                                </select>
                            </div>
                            <div>
                                <label style={s.label}>TDS start date</label>
                                <input type="date" name="tdsStartDate" value={form.tdsStartDate ? String(form.tdsStartDate).slice(0, 10) : ''} onChange={change} style={s.input} />
                            </div>
                            <div style={{ alignSelf: 'end' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                                    <input type="checkbox" name="msmeApplicable" checked={!!form.msmeApplicable} onChange={change} style={{ accentColor: '#7c3aed' }} />
                                    MSME applicable
                                </label>
                            </div>
                        </div>
                        <div style={{ ...grid3, ...mb }}>
                            <div>
                                <label style={s.label}>Lower TDS cert. %</label>
                                <input type="number" name="tdsLowerDeductionPercent" min={0} max={100} step="0.01" value={form.tdsLowerDeductionPercent ?? 0} onChange={change} style={s.input} />
                            </div>
                            <div>
                                <label style={s.label}>LDC valid from</label>
                                <input type="date" name="tdsLowerDeductionValidFrom" value={form.tdsLowerDeductionValidFrom ? String(form.tdsLowerDeductionValidFrom).slice(0, 10) : ''} onChange={change} style={s.input} />
                            </div>
                            <div>
                                <label style={s.label}>LDC valid to</label>
                                <input type="date" name="tdsLowerDeductionValidTo" value={form.tdsLowerDeductionValidTo ? String(form.tdsLowerDeductionValidTo).slice(0, 10) : ''} onChange={change} style={s.input} />
                            </div>
                        </div>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', color: '#374151', marginTop: 8 }}>
                            <input type="checkbox" name="tdsPanMandatory" checked={!!form.tdsPanMandatory} onChange={change} style={{ accentColor: '#7c3aed' }} />
                            PAN mandatory (block payment TDS when PAN missing)
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', color: '#374151', marginTop: 8 }}>
                            <input type="checkbox" name="tdsIgnoreThreshold" checked={!!form.tdsIgnoreThreshold} onChange={change} style={{ accentColor: '#7c3aed' }} />
                            Ignore threshold (always evaluate TDS when applicable)
                        </label>
                    </div>
                )}

                {/* Address & Contact: Hidden for P&L accounts */}
                {!isPnL && (
                    <div style={{ marginBottom: 20 }}>
                        <div style={s.sectionTitle}><MapPin size={13} /> Address & Contact</div>
                        <div style={{ ...grid2, ...mb }}>
                            <div><label style={s.label}>Mobile</label><input name="mobile" value={form.mobile} onChange={change} style={s.input} /></div>
                            <div><label style={s.label}>Email</label><input type="email" name="email" value={form.email} onChange={change} style={s.input} /></div>
                        </div>
                        <div style={mb}><label style={s.label}>Address</label><input name="address" value={form.address} onChange={change} style={s.input} /></div>
                        <div style={{ ...grid3, ...mb }}>
                            <div><label style={s.label}>City</label><input name="city" value={form.city} onChange={change} style={s.input} /></div>
                            <div><label style={s.label}>State</label><input name="state" value={form.state} onChange={change} style={s.input} /></div>
                            <div>
                                <label style={s.label}>Pincode</label>
                                <div style={{ display: 'flex', gap: 6 }}>
                                    <input name="pincode" value={form.pincode} onChange={change} style={{ ...s.input, flex: 1 }} />
                                    <button 
                                        type="button" 
                                        onClick={handleFetchPin}
                                        disabled={isFetchingPin}
                                        title="Fetch PIN from Google"
                                        style={{ padding: '0 10px', height: '33px', background: '#fff', border: '1.5px solid #e5e7eb', borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', color: '#374151' }}
                                    >
                                        {isFetchingPin ? <Loader2 size={14} className="animate-spin" /> : <MapPin size={14} />}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Bank: Hidden for P&L accounts */}
                {!isPnL && (
                    <div style={{ marginBottom: 8 }}>
                        <div style={s.sectionTitle}><Landmark size={13} /> Bank Details</div>
                        <div style={{ ...grid3 }}>
                            <div><label style={s.label}>Bank Name</label><input name="bankName" value={form.bankName} onChange={change} style={s.input} /></div>
                            <div><label style={s.label}>Account No</label><input name="accountNo" value={form.accountNo} onChange={change} style={s.input} /></div>
                            <div><label style={s.label}>IFSC Code</label><input name="ifsc" value={form.ifsc} onChange={change} style={s.input} /></div>
                        </div>
                    </div>
                )}
            </div>

            {/* Footer */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, paddingTop: 14, borderTop: '1px solid #f1f5f9', marginTop: 4 }}>
                <button type="button" onClick={onCancel} style={{ padding: '9px 20px', borderRadius: 8, border: '1.5px solid #e5e7eb', background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#374151' }}>Cancel</button>
                <button type="button" onClick={handleSaveClick} disabled={loading} style={{ padding: '9px 22px', borderRadius: 8, background: loading ? '#93c5fd' : '#2563eb', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>
                    {loading ? 'Saving...' : initial._id ? 'Update Ledger' : 'Create Ledger'}
                </button>
            </div>
        </div>
    );
};

export default LedgerForm;
