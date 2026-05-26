import React, { useEffect, useState, useCallback } from 'react';
import { getSuppliers, deleteSupplier, createSupplier, updateSupplier, importSuppliersExcel, downloadSupplierTemplate, generateSupplierCode } from '@/services/purchaseApi';
import toast from 'react-hot-toast';
import { BrandedLoader } from '@/components/ui/BrandedLoading';
import { Badge } from '@/components/ui';
import axios from 'axios';

const inp = { padding: '8px 12px', background: '#fff', border: '1px solid #d1d5db', borderRadius: 7, color: '#374151', fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box' };
const th = { padding: '10px 14px', textAlign: 'left', color: '#6b7280', fontWeight: 600, borderBottom: '2px solid #e5e7eb', whiteSpace: 'nowrap', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.03em', background: '#f9fafb' };
const td = { padding: '11px 14px', fontSize: 13, borderBottom: '1px solid #f3f4f6', color: '#374151' };
const secTitle = { fontSize: 11, fontWeight: 800, color: '#1d4ed8', textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid #dbeafe', paddingBottom: 6, marginBottom: 12, marginTop: 4 };
const lbl = { fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase' };

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

const EMPTY = {
    supplierName: '', contactPerson: '', phone: '', email: '',
    address: '', area: '', city: '', state: '', pincode: '',
    gstNumber: '', gstType: '', panNumber: '',
    deducteeConstitution: '',
    openingBalance: 0, openingBalanceDrCr: 'Cr',
    paymentTerms: '',
    bankName: '', bankAccountNo: '', bankIfsc: '',
    remarks: '',
    msmeApplicable: false, msmeRegNo: '', msmeCategory: '',
};

export default function SupplierListPage() {
    const [suppliers, setSuppliers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [modal, setModal] = useState(null);
    const [saving, setSaving] = useState(false);
    const [importing, setImporting] = useState(false);
    const [generatingCode, setGeneratingCode] = useState(false);
    const [showLedgerModal, setShowLedgerModal] = useState(false);
    const [selectedSupplierForLedger, setSelectedSupplierForLedger] = useState(null);

    const load = useCallback(() => {
        setLoading(true);
        getSuppliers({ search, limit: 100 })
            .then(d => setSuppliers(d.suppliers || []))
            .catch(() => toast.error('Failed to load suppliers'))
            .finally(() => setLoading(false));
    }, [search]);

    useEffect(() => { load(); }, [load]);

    const openCreate = () => setModal({ mode: 'create', data: { ...EMPTY } });
    const openEdit = (s) => setModal({ mode: 'edit', data: { ...EMPTY, ...s } });
    const set = (k, v) => setModal(m => {
        const newData = { ...m.data, [k]: v };
        if (k === 'state') {
            const stateClean = v.trim().toLowerCase();
            if (stateClean === 'maharashtra' || stateClean === 'mh') {
                newData.gstType = 'CGST / SGST';
            } else if (stateClean !== '') {
                newData.gstType = 'IGST';
            }
        }
        return { ...m, data: newData };
    });

    const handleSave = async () => {
        setSaving(true);
        try {
            if (modal.mode === 'create') {
                await createSupplier(modal.data);
                toast.success('Supplier created! Ledger under Sundry Creditors auto-created.');
            } else {
                await updateSupplier(modal.data._id, modal.data);
                toast.success('Supplier updated! Ledger synced.');
            }
            setModal(null); load();
        } catch (e) { toast.error(e.response?.data?.message || e.message); }
        finally { setSaving(false); }
    };

    const handleGenerateCode = async () => {
        setGeneratingCode(true);
        try {
            const res = await generateSupplierCode();
            set('supplierCode', res.supplierCode || res?.data?.supplierCode || res || '');
            toast.success('Code generated successfully');
        } catch {
            toast.error('Could not generate code');
        } finally {
            setGeneratingCode(false);
        }
    };

    const handleDelete = async (id, name) => {
        if (!window.confirm(`Delete supplier "${name}"?`)) return;
        try { await deleteSupplier(id); toast.success('Deleted'); load(); }
        catch (e) { toast.error(e.response?.data?.message || e.message); }
    };

    const handleDownloadTemplate = async () => {
        try {
            const blob = await downloadSupplierTemplate();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'Supplier_Master_Template.xlsx';
            a.click();
        } catch (e) { toast.error('Failed to download template'); }
    };

    const handleImport = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const formData = new FormData();
        formData.append('file', file);
        setImporting(true);
        try {
            const res = await importSuppliersExcel(formData);
            toast.success(res.message);
            load();
        } catch (e) { toast.error(e.response?.data?.message || e.message); }
        finally { setImporting(false); e.target.value = ''; }
    };

    const handleAutoLink = async (supplier) => {
        const loadingToast = toast.loading('Linking to ledger...');
        try {
            await axios.post('/api/v1/accounts/masters/ledger-link/auto-single', {
                entityId: supplier._id,
                entityType: 'Supplier'
            });
            toast.success('Linked successfully', { id: loadingToast });
            load();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to link ledger', { id: loadingToast });
        }
    };

    return (
        <div style={{ padding: '24px 28px', fontFamily: "'Inter', sans-serif", background: '#f8f9fa', minHeight: '100vh', color: '#1e293b' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
                <div>
                    <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#1e293b' }}>🏭 Supplier Master</h1>
                    <p style={{ margin: '4px 0 0', color: '#9ca3af', fontSize: 13 }}>Manage all your material suppliers</p>
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                    <button onClick={handleDownloadTemplate}
                        style={{ padding: '9px 18px', borderRadius: 8, background: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0', cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>
                        📥 Template
                    </button>
                    <label style={{ padding: '9px 18px', borderRadius: 8, background: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0', cursor: 'pointer', fontWeight: 700, fontSize: 13, display: 'inline-block' }}>
                        {importing ? '⌛ Importing...' : '📤 Import Excel'}
                        <input type="file" hidden accept=".xlsx, .xls" onChange={handleImport} disabled={importing} />
                    </label>
                    <button onClick={openCreate}
                        style={{ padding: '9px 18px', borderRadius: 8, background: '#0d9488', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 13, boxShadow: '0 2px 8px rgba(13,148,136,0.3)' }}>
                        + Add Supplier
                    </button>
                </div>
            </div>

            {/* Search */}
            <div style={{ marginBottom: 14, maxWidth: 400, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '10px 14px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                <input placeholder="Search suppliers..." value={search} onChange={e => setSearch(e.target.value)} style={inp} />
            </div>

            {/* Table */}
            <div style={{ background: '#fff', borderRadius: 12, overflow: 'hidden', border: '1px solid #e5e7eb', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                        <tr>
                            {['Code', 'Supplier Name', 'Contact', 'Phone', 'City', 'GST No.', 'Ledger', 'Opening Bal.', 'Actions'].map(h => (
                                <th key={h} style={th}>{h}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={8} style={{ padding: 40 }}><BrandedLoader size={80} /></td></tr>
                        ) : suppliers.length === 0 ? (
                            <tr><td colSpan={8} style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>No suppliers found. Click &quot;Add Supplier&quot; to get started.</td></tr>
                        ) : suppliers.map((s) => (
                            <tr key={s._id}
                                onMouseEnter={e => e.currentTarget.style.background = '#f8f9fa'}
                                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                <td style={{ ...td, color: '#2563eb', fontWeight: 600 }}>{s.supplierCode}</td>
                                <td style={{ ...td, fontWeight: 500, color: '#1e293b' }}>{s.supplierName}</td>
                                <td style={td}>{s.contactPerson || '—'}</td>
                                <td style={td}>{s.phone || '—'}</td>
                                <td style={td}>{s.city || '—'}</td>
                                <td style={{ ...td, fontFamily: 'monospace', fontSize: 11 }}>
                            {s.gstNumber || '—'}
                            {s.msmeApplicable && (
                                <span style={{ display: 'inline-block', marginLeft: 6, background: '#dcfce7', color: '#166534', fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 4, letterSpacing: '0.03em' }}>
                                    MSME{s.msmeCategory ? ` · ${s.msmeCategory}` : ''}
                                </span>
                            )}
                        </td>
                                <td style={td}>
                                    {s.ledgerId ? (
                                        <Badge variant="success" className="cursor-pointer" onClick={() => handleAutoLink(s)}>Linked</Badge>
                                    ) : (
                                        <Badge variant="warning" className="cursor-pointer" onClick={() => handleAutoLink(s)}>Unlinked</Badge>
                                    )}
                                </td>
                                <td style={{ ...td, fontWeight: 700, color: (s.openingBalance || 0) > 0 ? '#059669' : '#6b7280' }}>
                                    {(s.openingBalance || 0) > 0
                                        ? `₹${Number(s.openingBalance).toLocaleString('en-IN')} ${s.openingBalanceDrCr || 'Cr'}`
                                        : '—'}
                                </td>
                                <td style={td}>
                                    <div style={{ display: 'flex', gap: 6 }}>
                                        <button onClick={() => openEdit(s)}
                                            style={{ padding: '4px 10px', fontSize: 12, fontWeight: 600, background: '#f1f5f9', color: '#374151', border: '1px solid #e2e8f0', borderRadius: 6, cursor: 'pointer' }}>Edit</button>
                                        <button onClick={() => handleDelete(s._id, s.supplierName)}
                                            style={{ padding: '4px 10px', fontSize: 12, fontWeight: 600, background: '#fef2f2', color: '#dc2626', border: '1px solid #fca5a5', borderRadius: 6, cursor: 'pointer' }}>Delete</button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Modal */}
            {modal && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
                    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 16, padding: 28, width: '100%', maxWidth: 760, maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.18)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1e293b' }}>
                                {modal.mode === 'create' ? '🏭 Add New Supplier' : `✎ Edit: ${modal.data.supplierName}`}
                            </h2>
                            <button onClick={() => setModal(null)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#9ca3af', lineHeight: 1 }}>×</button>
                        </div>

                        {/* ── Section 1: Basic Info ── */}
                        <div style={secTitle}>📋 Basic Information</div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 20 }}>
                            <div style={{ gridColumn: 'span 2' }}>
                                <label style={lbl}>Supplier Code</label>
                                <div style={{ display: 'flex', gap: 4 }}>
                                    <input
                                        value={modal.data.supplierCode || ''}
                                        onChange={e => set('supplierCode', e.target.value.toUpperCase())}
                                        style={{ ...inp, fontFamily: 'monospace', fontWeight: 'bold' }}
                                        placeholder="Leave empty to auto-generate"
                                    />
                                    {modal.mode === 'create' && (
                                        <button type="button" onClick={handleGenerateCode} disabled={generatingCode} title="Auto-generate code"
                                            style={{ height: '36px', width: '40px', border: '1px solid #d1d5db', borderRadius: 7, background: '#f9fafb', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280', flexShrink: 0 }}>
                                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path>
                                                <path d="M3 3v5h5"></path>
                                            </svg>
                                        </button>
                                    )}
                                </div>
                            </div>
                            <div style={{ gridColumn: 'span 2' }}>
                                <label style={lbl}>Supplier Name *</label>
                                <input value={modal.data.supplierName || ''} onChange={e => set('supplierName', e.target.value)} style={inp} placeholder="Full legal name of supplier" />
                                {modal.mode === 'edit' && modal.data.supplierName !== suppliers.find(s => s._id === modal.data._id)?.supplierName && (
                                    <div style={{ fontSize: '11px', color: '#e11d48', marginTop: '4px', background: '#fff1f2', padding: '6px 10px', borderRadius: '6px', border: '1px solid #fecdd3', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <span style={{ fontSize: '14px' }}>⚠️</span>
                                        <span>Changing this name will update it globally in all past & future records.</span>
                                    </div>
                                )}
                            </div>
                            <div>
                                <label style={lbl}>Contact Person</label>
                                <input value={modal.data.contactPerson || ''} onChange={e => set('contactPerson', e.target.value)} style={inp} />
                            </div>
                            <div>
                                <label style={lbl}>Phone</label>
                                <input value={modal.data.phone || ''} onChange={e => set('phone', e.target.value)} style={inp} />
                            </div>
                            <div>
                                <label style={lbl}>Email</label>
                                <input type="email" value={modal.data.email || ''} onChange={e => set('email', e.target.value)} style={inp} />
                            </div>
                            <div>
                                <label style={lbl}>Payment Terms</label>
                                <input value={modal.data.paymentTerms || ''} onChange={e => set('paymentTerms', e.target.value)} style={inp} placeholder="e.g. Net 30" />
                            </div>
                        </div>

                        {/* ── Section 2: Opening Balance ── */}
                        <div style={secTitle}>💰 Opening Balance (Accounts)</div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginBottom: 20 }}>
                            <div>
                                <label style={lbl}>Opening Balance (₹)</label>
                                <input type="number" min="0" value={modal.data.openingBalance || 0} onChange={e => set('openingBalance', e.target.value)} style={inp} placeholder="0" />
                            </div>
                            <div>
                                <label style={lbl}>Dr / Cr</label>
                                <select value={modal.data.openingBalanceDrCr || 'Cr'} onChange={e => set('openingBalanceDrCr', e.target.value)} style={{ ...inp, cursor: 'pointer' }}>
                                    <option value="Cr">Cr — Payable (We owe supplier)</option>
                                    <option value="Dr">Dr — Advance Paid</option>
                                </select>
                            </div>
                            <div style={{ alignSelf: 'end', paddingBottom: 4 }}>
                                <div style={{ fontSize: 11, color: '#6b7280', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '8px 12px' }}>
                                    ℹ️ This sets the ledger opening balance under <strong>Sundry Creditors</strong>
                                </div>
                            </div>
                        </div>

                        {/* ── Section 3: GST & Tax ── */}
                        <div style={secTitle}>🔰 GST & Tax Details</div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginBottom: 20 }}>
                            <div>
                                <label style={lbl}>GST Number (GSTIN)</label>
                                <input value={modal.data.gstNumber || ''} onChange={e => set('gstNumber', e.target.value.toUpperCase())} style={{ ...inp, fontFamily: 'monospace' }} placeholder="22AAAAA0000A1Z5" />
                            </div>
                            <div>
                                <label style={lbl}>GST Type</label>
                                <select value={modal.data.gstType || ''} onChange={e => set('gstType', e.target.value)} style={{ ...inp, cursor: 'pointer' }}>
                                    <option value="">— Select —</option>
                                    <option>CGST / SGST</option>
                                    <option>IGST</option>
                                </select>
                            </div>
                            <div>
                                <label style={lbl}>PAN Number</label>
                                <input value={modal.data.panNumber || ''} onChange={e => set('panNumber', e.target.value.toUpperCase())} style={{ ...inp, fontFamily: 'monospace' }} placeholder="AAAAA0000A" />
                            </div>
                            <div style={{ gridColumn: 'span 3' }}>
                                <label style={lbl}>Deductee type / constitution</label>
                                <select value={modal.data.deducteeConstitution || ''} onChange={e => set('deducteeConstitution', e.target.value)} style={{ ...inp, cursor: 'pointer' }} title="Used with TDS Master to pick Individual/HUF vs company rate (e.g. 194C 1% vs 2%).">
                                    {DEDUCTEE_CONSTITUTION_OPTIONS.map((opt) => (
                                        <option key={opt || 'blank'} value={opt}>{opt ? opt : '— Not set —'}</option>
                                    ))}
                                </select>
                                <span style={{ fontSize: 11, color: '#64748b', display: 'block', marginTop: 6 }}>
                                    Drives auto TDS rate from TDS Master by section (e.g. 194C: Individual/HUF/Proprietorship vs company).
                                </span>
                            </div>
                        </div>

                        {/* ── Section 4: Address ── */}
                        <div style={secTitle}>📍 Address Details</div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 20 }}>
                            <div style={{ gridColumn: 'span 2' }}>
                                <label style={lbl}>Address / Street</label>
                                <input value={modal.data.address || ''} onChange={e => set('address', e.target.value)} style={inp} placeholder="Building, Street, Road..." />
                            </div>
                            <div>
                                <label style={lbl}>Area / Locality</label>
                                <input value={modal.data.area || ''} onChange={e => set('area', e.target.value)} style={inp} />
                            </div>
                            <div>
                                <label style={lbl}>City</label>
                                <input value={modal.data.city || ''} onChange={e => set('city', e.target.value)} style={inp} />
                            </div>
                            <div>
                                <label style={lbl}>State</label>
                                <input value={modal.data.state || ''} onChange={e => set('state', e.target.value)} style={inp} list="supp-state-list" />
                                <datalist id="supp-state-list">
                                    {['Maharashtra','Gujarat','Rajasthan','Delhi','Karnataka','Tamil Nadu','Telangana','West Bengal','Uttar Pradesh','Madhya Pradesh','Punjab','Haryana','Bihar','Andhra Pradesh','Kerala','Odisha','Chhattisgarh','Jharkhand','Assam','Goa','Jammu and Kashmir','Chandigarh','Puducherry'].map(st => <option key={st} value={st} />)}
                                </datalist>
                            </div>
                            <div>
                                <label style={lbl}>Pincode</label>
                                <input value={modal.data.pincode || ''} onChange={e => set('pincode', e.target.value)} style={inp} />
                            </div>
                        </div>

                        {/* ── Section 5: Bank Details ── */}
                        <div style={secTitle}>🏦 Bank Details</div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginBottom: 20 }}>
                            <div>
                                <label style={lbl}>Bank Name</label>
                                <input value={modal.data.bankName || ''} onChange={e => set('bankName', e.target.value)} style={inp} placeholder="e.g. HDFC Bank" />
                            </div>
                            <div>
                                <label style={lbl}>Account No.</label>
                                <input value={modal.data.bankAccountNo || ''} onChange={e => set('bankAccountNo', e.target.value)} style={{ ...inp, fontFamily: 'monospace' }} />
                            </div>
                            <div>
                                <label style={lbl}>IFSC Code</label>
                                <input value={modal.data.bankIfsc || ''} onChange={e => set('bankIfsc', e.target.value.toUpperCase())} style={{ ...inp, fontFamily: 'monospace' }} placeholder="HDFC0001234" />
                            </div>
                        </div>

                        {/* ── Section 6: MSME Details ── */}
                        <div style={secTitle}>🏛️ MSME Details (MSMED Act)</div>
                        <div style={{ marginBottom: 20 }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', marginBottom: 14 }}>
                                <input
                                    type="checkbox"
                                    checked={!!modal.data.msmeApplicable}
                                    onChange={e => set('msmeApplicable', e.target.checked)}
                                    style={{ width: 16, height: 16, accentColor: '#0d9488', cursor: 'pointer' }}
                                />
                                <span style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>
                                    MSME Registered Supplier
                                </span>
                                <span style={{ fontSize: 11, color: '#64748b', fontWeight: 400 }}>
                                    (Enables 45-day MSME compliance tracking)
                                </span>
                            </label>

                            {modal.data.msmeApplicable && (
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '16px 18px' }}>
                                    <div>
                                        <label style={lbl}>Udyam Registration No.</label>
                                        <input
                                            value={modal.data.msmeRegNo || ''}
                                            onChange={e => set('msmeRegNo', e.target.value.toUpperCase())}
                                            style={{ ...inp, fontFamily: 'monospace' }}
                                            placeholder="UDYAM-XX-00-0000000"
                                        />
                                        <span style={{ fontSize: 11, color: '#64748b', display: 'block', marginTop: 4 }}>
                                            As per Udyam Registration Certificate
                                        </span>
                                    </div>
                                    <div>
                                        <label style={lbl}>MSME Category</label>
                                        <select
                                            value={modal.data.msmeCategory || ''}
                                            onChange={e => set('msmeCategory', e.target.value)}
                                            style={{ ...inp, cursor: 'pointer' }}
                                        >
                                            <option value="">— Select Category —</option>
                                            <option value="Micro">Micro Enterprise</option>
                                            <option value="Small">Small Enterprise</option>
                                            <option value="Medium">Medium Enterprise</option>
                                        </select>
                                        <span style={{ fontSize: 11, color: '#64748b', display: 'block', marginTop: 4 }}>
                                            As classified under MSMED Act
                                        </span>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* ── Remarks ── */}
                        <div style={{ marginBottom: 20 }}>
                            <label style={lbl}>Remarks</label>
                            <textarea rows={2} value={modal.data.remarks || ''} onChange={e => set('remarks', e.target.value)} style={{ ...inp, resize: 'vertical' }} />
                        </div>

                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', borderTop: '1px solid #f1f5f9', paddingTop: 16 }}>
                            <button onClick={() => { if (window.confirm('Discard changes?')) setModal(null); }} style={{ padding: '9px 20px', background: '#f1f5f9', color: '#374151', border: '1px solid #e2e8f0', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>Cancel</button>
                            <button onClick={handleSave} disabled={saving} style={{ padding: '9px 24px', background: '#0d9488', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 13, opacity: saving ? 0.7 : 1 }}>
                                {saving ? 'Saving...' : modal.mode === 'create' ? '✓ Create Supplier' : '✓ Update Supplier'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
}
