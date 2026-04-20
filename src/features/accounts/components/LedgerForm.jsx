import React, { useState, useEffect, useMemo } from 'react';
import { 
    BookOpen, ShieldCheck, Landmark, MapPin, CreditCard, Loader2 
} from 'lucide-react';
import { getSuppliers } from '@/services/purchaseApi';
import { fetchGeocodeAddress } from '@/services/locationApi';
import { toast } from 'react-hot-toast';

const s = {
    label: { fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4, display: 'block' },
    input: { width: '100%', border: '1.5px solid #e5e7eb', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: '#111827', outline: 'none', background: '#fff', boxSizing: 'border-box' },
    select: { width: '100%', border: '1.5px solid #e5e7eb', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: '#111827', background: '#fff', boxSizing: 'border-box' },
    sectionTitle: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 800, color: '#1d4ed8', textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '2px solid #dbeafe', paddingBottom: 8, marginBottom: 14 },
};

export const EMPTY = { name: '', printName: '', alias: '', underGroup: '', openingBalance: 0, drCr: 'Dr', creditPeriod: 0, isBillWise: false, gstApplicable: false, gstRate: 0, hsnCode: '', gstin: '', pan: '', registrationType: 'Regular', mobile: '', email: '', address: '', city: '', state: '', pincode: '', bankName: '', accountNo: '', ifsc: '' };

const LedgerForm = ({ initial = EMPTY, groups = [], onSave, onCancel, loading }) => {
    const [form, setForm] = useState({ ...EMPTY, ...initial, underGroup: initial.underGroup?._id || initial.underGroup || '' });
    const [isFetchingPin, setIsFetchingPin] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);

    // Derived Nature of the selected group
    const selectedGroup = useMemo(() => groups.find(g => g._id === form.underGroup), [groups, form.underGroup]);
    const nature = selectedGroup?.nature; // 'Assets', 'Liabilities', 'Income', 'Expenses'
    const isPnL = nature === 'Income' || nature === 'Expenses';

    // Auto-sync behavior for P&L accounts
    useEffect(() => {
        if (nature === 'Expenses') {
            setForm(prev => ({ ...prev, drCr: 'Dr', openingBalance: 0, creditPeriod: 0, isBillWise: false }));
        } else if (nature === 'Income') {
            setForm(prev => ({ ...prev, drCr: 'Cr', openingBalance: 0, creditPeriod: 0, isBillWise: false }));
        }
    }, [nature]);

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
                gstApplicable: !!matchingSup.gstNumber
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
        set(name, type === 'checkbox' ? checked : value);
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
                            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', color: '#374151' }}>
                                <input type="checkbox" name="gstApplicable" checked={form.gstApplicable} onChange={change} style={{ accentColor: '#2563eb' }} />
                                GST Applicable?
                            </label>
                        </div>
                    </div>
                )}

                {/* If P&L, show GST Rate switch instead of Balance fields */}
                {isPnL && (
                    <div style={{ marginBottom: 20 }}>
                        <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', color: '#374151' }}>
                                <input type="checkbox" name="gstApplicable" checked={form.gstApplicable} onChange={change} style={{ accentColor: '#2563eb' }} />
                                GST Applicable?
                            </label>
                            
                            {form.gstApplicable && (
                                <>
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
                                </>
                            )}
                        </div>
                    </div>
                )}

                {/* GST / Statutory Details: Only show for Balance Sheet accounts (Assets/Liabilities) */}
                {form.gstApplicable && !isPnL && (
                    <div style={{ marginBottom: 20 }}>
                        <div style={s.sectionTitle}><ShieldCheck size={13} /> GST / Statutory Details</div>
                        <div style={{ ...grid3, ...mb }}>
                            <div><label style={s.label}>GSTIN</label><input name="gstin" value={form.gstin} onChange={change} style={s.input} placeholder="22AAAAA0000A1Z5" /></div>
                            <div><label style={s.label}>PAN</label><input name="pan" value={form.pan} onChange={change} style={s.input} /></div>
                            <div><label style={s.label}>HSN/SAC Code</label><input name="hsnCode" value={form.hsnCode} onChange={change} style={s.input} /></div>
                        </div>
                        <div style={mb}>
                            <label style={s.label}>Registration Type</label>
                            <select name="registrationType" value={form.registrationType} onChange={change} style={s.select}>
                                {['Regular', 'Composition', 'Unregistered', 'Consumer'].map(v => <option key={v} value={v}>{v}</option>)}
                            </select>
                        </div>
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
                <button type="button" onClick={() => onSave(form)} disabled={loading} style={{ padding: '9px 22px', borderRadius: 8, background: loading ? '#93c5fd' : '#2563eb', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>
                    {loading ? 'Saving...' : initial._id ? 'Update Ledger' : 'Create Ledger'}
                </button>
            </div>
        </div>
    );
};

export default LedgerForm;
