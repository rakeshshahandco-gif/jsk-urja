import React, { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { pettyCashApi } from '@/services/pettyCashApi';
import { voucherAttachmentApi } from '@/services/voucherAttachmentApi';
import { useFinancialYear } from '@/contexts/FinancialYearContext';
import { env } from '@/config/env';

const page = { padding: '24px 28px', fontFamily: "'Inter', sans-serif", background: '#f8f9fa', minHeight: '100vh' };
const card = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 20, marginBottom: 16 };
const inp = { padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: 8, width: '100%', boxSizing: 'border-box', fontSize: 13 };
const lbl = { fontSize: 11, color: '#64748b', fontWeight: 700, display: 'block', marginBottom: 4, textTransform: 'uppercase' };
const th = { padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#64748b', borderBottom: '2px solid #e5e7eb', background: '#f9fafb' };
const td = { padding: '10px 12px', fontSize: 13, borderBottom: '1px solid #f3f4f6' };

const resolveFileUrl = (url) => {
    if (!url) return '#';
    if (url.startsWith('http')) return url;
    const base = env.SOCKET_URL || String(env.API_URL).replace(/\/api\/v1\/?$/, '');
    return `${base}${url.startsWith('/') ? url : `/${url}`}`;
};

export default function PettyCashEntryPage() {
    const { selectedFY } = useFinancialYear();
    const [ledgers, setLedgers] = useState([]);
    const [entries, setEntries] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [lastSavedId, setLastSavedId] = useState(null);
    const [attachments, setAttachments] = useState([]);
    const fileRef = useRef(null);

    const [form, setForm] = useState({
        date: new Date().toISOString().slice(0, 10),
        externalVoucherNo: '',
        billNo: '',
        ledgerId: '',
        narration: '',
        payment: '',
        receipt: '',
        remarks: '',
    });

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [lg, data] = await Promise.all([
                pettyCashApi.listLedgers(),
                pettyCashApi.listEntries({ financialYear: selectedFY, limit: 50 }),
            ]);
            setLedgers(lg);
            setEntries(data?.results || []);
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to load');
        } finally {
            setLoading(false);
        }
    }, [selectedFY]);

    useEffect(() => { load(); }, [load]);

    const loadAttachments = async (id) => {
        if (!id) return;
        try {
            const rows = await voucherAttachmentApi.listByVoucher('petty_cash', id);
            setAttachments(rows);
        } catch {
            setAttachments([]);
        }
    };

    const onSubmit = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            const body = {
                ...form,
                payment: Number(form.payment) || 0,
                receipt: Number(form.receipt) || 0,
                financialYear: selectedFY,
                accountHead: ledgers.find((l) => l._id === form.ledgerId)?.name || '',
            };
            const saved = await pettyCashApi.createEntry(body);
            toast.success('Petty cash entry posted');
            setLastSavedId(saved._id);
            loadAttachments(saved._id);
            setForm((f) => ({ ...f, externalVoucherNo: '', billNo: '', narration: '', payment: '', receipt: '', remarks: '' }));
            load();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Save failed');
        } finally {
            setSaving(false);
        }
    };

    const onAttach = async (fileList) => {
        const file = fileList?.[0];
        if (!file || !lastSavedId) {
            toast.error('Save entry first, then attach');
            return;
        }
        try {
            await pettyCashApi.attachFile(lastSavedId, file);
            toast.success('Attachment uploaded');
            loadAttachments(lastSavedId);
        } catch (err) {
            toast.error(err.message || 'Upload failed');
        }
        if (fileRef.current) fileRef.current.value = '';
    };

    const fmt = (d) => (d ? new Date(d).toLocaleDateString('en-IN') : '—');
    const fmtAmt = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

    return (
        <div style={page}>
            <h1 style={{ margin: '0 0 6px', fontSize: 22, fontWeight: 800 }}>Petty Cash Entry</h1>
            <p style={{ margin: '0 0 20px', color: '#64748b', fontSize: 13 }}>FY {selectedFY} — payment debits expense & credits petty cash; receipt replenishes petty cash from bank/cash</p>

            <form onSubmit={onSubmit} style={card}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
                    <div><label style={lbl}>Date</label><input type="date" style={inp} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required /></div>
                    <div><label style={lbl}>Voucher No</label><input style={inp} value={form.externalVoucherNo} onChange={(e) => setForm({ ...form, externalVoucherNo: e.target.value })} /></div>
                    <div><label style={lbl}>Bill No</label><input style={inp} value={form.billNo} onChange={(e) => setForm({ ...form, billNo: e.target.value })} /></div>
                    <div>
                        <label style={lbl}>Account Head</label>
                        <select style={inp} value={form.ledgerId} onChange={(e) => setForm({ ...form, ledgerId: e.target.value })}>
                            <option value="">— Select —</option>
                            {ledgers.map((l) => <option key={l._id} value={l._id}>{l.name}</option>)}
                        </select>
                    </div>
                    <div><label style={lbl}>Payment</label><input type="number" min="0" step="0.01" style={inp} value={form.payment} onChange={(e) => setForm({ ...form, payment: e.target.value, receipt: e.target.value ? '' : form.receipt })} /></div>
                    <div><label style={lbl}>Receipt</label><input type="number" min="0" step="0.01" style={inp} value={form.receipt} onChange={(e) => setForm({ ...form, receipt: e.target.value, payment: e.target.value ? '' : form.payment })} /></div>
                </div>
                <div style={{ marginTop: 12 }}>
                    <label style={lbl}>Narration</label>
                    <input style={inp} value={form.narration} onChange={(e) => setForm({ ...form, narration: e.target.value })} />
                </div>
                <div style={{ marginTop: 12 }}>
                    <label style={lbl}>Remarks</label>
                    <input style={inp} value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} />
                </div>
                <div style={{ marginTop: 16, display: 'flex', gap: 10 }}>
                    <button type="submit" disabled={saving} style={{ padding: '10px 20px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer' }}>
                        {saving ? 'Posting…' : 'Save & Post'}
                    </button>
                </div>
            </form>

            {lastSavedId && (
                <div style={card}>
                    <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700 }}>Attachments (last saved entry)</h3>
                    <button type="button" onClick={() => fileRef.current?.click()} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontWeight: 600 }}>Upload PDF / Image</button>
                    <input ref={fileRef} type="file" accept="application/pdf,image/*" style={{ display: 'none' }} onChange={(e) => onAttach(e.target.files)} />
                    <div style={{ marginTop: 10 }}>
                        {attachments.map((a) => (
                            <div key={a._id} style={{ fontSize: 13, marginBottom: 6 }}>
                                <a href={resolveFileUrl(a.fileUrl)} target="_blank" rel="noreferrer">{a.originalName || a.fileName}</a>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <div style={{ ...card, padding: 0, overflow: 'auto' }}>
                <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', fontWeight: 700 }}>Recent Entries</div>
                {loading ? <p style={{ padding: 20, color: '#94a3b8' }}>Loading…</p> : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
                        <thead><tr>
                            {['Date', 'Voucher No', 'Account Head', 'Payment', 'Receipt', 'Balance', 'Status'].map((h) => <th key={h} style={th}>{h}</th>)}
                        </tr></thead>
                        <tbody>
                            {entries.map((e) => (
                                <tr key={e._id}>
                                    <td style={td}>{fmt(e.date)}</td>
                                    <td style={td}>{e.externalVoucherNo || '—'}</td>
                                    <td style={td}>{e.accountHead || '—'}</td>
                                    <td style={td}>{e.payment ? fmtAmt(e.payment) : '—'}</td>
                                    <td style={td}>{e.receipt ? fmtAmt(e.receipt) : '—'}</td>
                                    <td style={td}>{fmtAmt(e.balance)}</td>
                                    <td style={td}>{e.status}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}
