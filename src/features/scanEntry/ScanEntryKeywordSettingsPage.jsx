import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { scanEntryApi } from '@/services/scanEntryApi';
import { getLedgers } from '@/services/accountApi';

export default function ScanEntryKeywordSettingsPage() {
    const [rows, setRows] = useState([]);
    const [ledgers, setLedgers] = useState([]);
    const [keyword, setKeyword] = useState('');
    const [ledgerId, setLedgerId] = useState('');

    const load = async () => {
        const [maps, allLedgers] = await Promise.all([
            scanEntryApi.listKeywordMaps(),
            getLedgers(),
        ]);
        setRows(maps || []);
        setLedgers(allLedgers || []);
    };

    useEffect(() => { load().catch(() => {}); }, []);

    const save = async () => {
        if (!keyword.trim() || !ledgerId) return toast.error('Keyword and ledger are required');
        try {
            const led = ledgers.find((l) => l._id === ledgerId);
            await scanEntryApi.saveKeywordMap({ keyword: keyword.trim(), ledgerId, ledgerName: led?.ledgerName || led?.name || '' });
            toast.success('Keyword saved');
            setKeyword('');
            await load();
        } catch (err) {
            toast.error(err?.response?.data?.message || 'Save failed');
        }
    };

    const remove = async (id) => {
        if (!window.confirm('Delete this keyword map?')) return;
        try {
            await scanEntryApi.deleteKeywordMap(id);
            toast.success('Deleted');
            await load();
        } catch (err) {
            toast.error(err?.response?.data?.message || 'Delete failed');
        }
    };

    return (
        <div style={{ padding: 24 }}>
            <h2 style={{ marginTop: 0 }}>Scan Entry Keyword Mapping</h2>
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                <input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="keyword (e.g. stationery)" style={{ padding: '8px 10px', minWidth: 220 }} />
                <select value={ledgerId} onChange={(e) => setLedgerId(e.target.value)} style={{ padding: '8px 10px', minWidth: 260 }}>
                    <option value="">Select ledger</option>
                    {ledgers.map((l) => <option key={l._id} value={l._id}>{l.ledgerName || l.name}</option>)}
                </select>
                <button onClick={save} style={{ padding: '8px 12px' }}>Save</button>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff' }}>
                <thead>
                    <tr><th style={{ textAlign: 'left', padding: 8 }}>Keyword</th><th style={{ textAlign: 'left', padding: 8 }}>Ledger</th><th style={{ padding: 8 }}>Action</th></tr>
                </thead>
                <tbody>
                    {rows.map((r) => (
                        <tr key={r._id} style={{ borderTop: '1px solid #e5e7eb' }}>
                            <td style={{ padding: 8 }}>{r.keyword}</td>
                            <td style={{ padding: 8 }}>{r.ledgerName || r.ledgerId}</td>
                            <td style={{ padding: 8, textAlign: 'center' }}>
                                <button onClick={() => remove(r._id)} style={{ padding: '6px 10px' }}>Delete</button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

