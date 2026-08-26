import React, { useEffect, useRef, useState } from 'react';
import { searchExistingCustomers } from './searchExistingCustomers';

const inp = { padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, width: '100%', boxSizing: 'border-box' };

export default function CustomerPartySearch({ valueLabel, onSelect, placeholder = 'Type to search customers…' }) {
    const [q, setQ] = useState(valueLabel || '');
    const [open, setOpen] = useState(false);
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(false);
    const wrapRef = useRef(null);
    const timer = useRef(null);

    useEffect(() => { setQ(valueLabel || ''); }, [valueLabel]);

    useEffect(() => {
        const onDoc = (e) => {
            if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
        };
        document.addEventListener('mousedown', onDoc);
        return () => document.removeEventListener('mousedown', onDoc);
    }, []);

    const run = (term) => {
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(async () => {
            setLoading(true);
            try {
                const list = await searchExistingCustomers(term);
                setRows(list);
            } catch {
                setRows([]);
            } finally {
                setLoading(false);
            }
        }, 250);
    };

    return (
        <div ref={wrapRef} style={{ position: 'relative' }}>
            <input
                value={q}
                placeholder={placeholder}
                style={inp}
                onFocus={() => { setOpen(true); run(q); }}
                onChange={(e) => {
                    setQ(e.target.value);
                    setOpen(true);
                    run(e.target.value);
                }}
            />
            {open && (
                <div style={{
                    position: 'absolute', zIndex: 20, left: 0, right: 0, top: '100%',
                    background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8,
                    maxHeight: 280, overflowY: 'auto', boxShadow: '0 8px 24px rgba(15,23,42,.12)',
                }}>
                    {loading && <div style={{ padding: 10, fontSize: 12, color: '#64748b' }}>Searching…</div>}
                    {!loading && !rows.length && <div style={{ padding: 10, fontSize: 12, color: '#64748b' }}>No matching customers</div>}
                    {rows.map((c) => (
                        <button
                            key={c.id}
                            type="button"
                            onClick={() => { onSelect(c); setQ(c.company || c.name); setOpen(false); }}
                            style={{
                                display: 'block', width: '100%', textAlign: 'left', padding: '8px 10px',
                                border: 0, background: 'transparent', cursor: 'pointer', fontSize: 13,
                            }}
                        >
                            <div style={{ fontWeight: 700 }}>{c.company || c.name}</div>
                            <div style={{ fontSize: 11, color: '#64748b' }}>
                                {[c.customerName, c.customerCode, c.city, c.phone, c.gstin].filter(Boolean).join(' · ')}
                            </div>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
