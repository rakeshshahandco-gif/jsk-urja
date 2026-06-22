import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { emailBulkApi } from '@/services/emailBulkApi';

const page = { padding: '24px 28px', fontFamily: "'Inter', sans-serif", background: '#f8f9fa', minHeight: '100vh' };
const card = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 20, marginBottom: 16 };
const inp = { padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: 8, width: '100%', boxSizing: 'border-box', fontSize: 13 };
const btn = { padding: '8px 14px', borderRadius: 8, border: 'none', background: '#0f766e', color: '#fff', fontWeight: 600, cursor: 'pointer' };

export default function EmailBulkBlacklistPage() {
    const [rows, setRows] = useState([]);
    const [email, setEmail] = useState('');
    const [source, setSource] = useState('manual');

    const load = async () => {
        try {
            setRows(await emailBulkApi.listBlacklist());
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to load blacklist');
        }
    };

    useEffect(() => { load(); }, []);

    const onAdd = async (e) => {
        e.preventDefault();
        try {
            await emailBulkApi.addBlacklist({ email, source, reason: source });
            toast.success('Added to blacklist');
            setEmail('');
            load();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Add failed');
        }
    };

    const onRemove = async (id) => {
        try {
            await emailBulkApi.removeBlacklist(id);
            toast.success('Removed');
            load();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Remove failed');
        }
    };

    return (
        <div style={page}>
            <h1>Email Blacklist / Opt-out</h1>
            <form style={card} onSubmit={onAdd}>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr auto', gap: 12 }}>
                    <input style={inp} type="email" placeholder="Email address" value={email} onChange={(e) => setEmail(e.target.value)} required />
                    <select style={inp} value={source} onChange={(e) => setSource(e.target.value)}>
                        <option value="manual">Manual</option>
                        <option value="unsubscribe">Unsubscribe</option>
                        <option value="do_not_send">Do Not Send</option>
                    </select>
                    <button type="submit" style={btn}>Add</button>
                </div>
            </form>
            <div style={card}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead><tr style={{ textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}><th>Email</th><th>Source</th><th>Reason</th><th></th></tr></thead>
                    <tbody>
                        {rows.map((r) => (
                            <tr key={r._id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                <td>{r.email}</td>
                                <td>{r.source}</td>
                                <td>{r.reason}</td>
                                <td><button type="button" style={{ ...btn, background: '#b91c1c' }} onClick={() => onRemove(r._id)}>Remove</button></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
