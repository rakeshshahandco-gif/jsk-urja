import React, { useEffect, useState } from 'react';
import { productCatalogApi } from '@/services/productCatalogApi';

/**
 * Modal multi-select used by LeadFormPage. Lets sales pick one/more products
 * from catalog. onConfirm receives selected ProductCatalog docs.
 */
export default function ProductCatalogPicker({ open, onClose, onConfirm, initialIds = [] }) {
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState('');
    const [selected, setSelected] = useState(() => new Set(initialIds.map(String)));

    useEffect(() => { if (open) setSelected(new Set(initialIds.map(String))); /* eslint-disable-next-line */ }, [open]);

    useEffect(() => {
        if (!open) return;
        let cancel = false;
        (async () => {
            setLoading(true);
            try {
                const data = await productCatalogApi.list({ limit: 200, isActive: true, search: search || undefined });
                if (!cancel) setRows(data?.results || []);
            } finally {
                if (!cancel) setLoading(false);
            }
        })();
        return () => { cancel = true; };
    }, [open, search]);

    if (!open) return null;

    const toggle = (id) => {
        const next = new Set(selected);
        if (next.has(String(id))) next.delete(String(id));
        else next.add(String(id));
        setSelected(next);
    };

    const confirm = () => {
        const picked = rows.filter((r) => selected.has(String(r._id)));
        onConfirm(picked);
    };

    return (
        <div style={overlay} onClick={onClose}>
            <div style={panel} onClick={(e) => e.stopPropagation()}>
                <div style={{ padding: 14, borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between' }}>
                    <strong>Pick products from catalog</strong>
                    <button onClick={onClose}>Close</button>
                </div>
                <div style={{ padding: 12, borderBottom: '1px solid #e2e8f0' }}>
                    <input
                        placeholder="Search by name / code / category"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        style={{ width: '100%', padding: 8, border: '1px solid #cbd5e1', borderRadius: 6 }}
                    />
                </div>
                <div style={{ maxHeight: 400, overflow: 'auto' }}>
                    {loading && <div style={{ padding: 16, textAlign: 'center' }}>Loading...</div>}
                    {!loading && rows.length === 0 && (
                        <div style={{ padding: 16, textAlign: 'center', color: '#64748b' }}>
                            No active products. Create one under Settings &gt; Product Catalog.
                        </div>
                    )}
                    {rows.map((r) => {
                        const on = selected.has(String(r._id));
                        return (
                            <label
                                key={r._id}
                                style={{
                                    display: 'flex', gap: 10, alignItems: 'center',
                                    padding: 10, borderBottom: '1px solid #f1f5f9', cursor: 'pointer',
                                    background: on ? '#eff6ff' : 'white',
                                }}
                            >
                                <input type="checkbox" checked={on} onChange={() => toggle(r._id)} />
                                {r.imageUrl
                                    ? <img src={r.imageUrl} alt="" style={{ width: 36, height: 36, objectFit: 'cover', borderRadius: 4 }} />
                                    : <div style={{ width: 36, height: 36, background: '#e2e8f0', borderRadius: 4 }} />}
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: 13, fontWeight: 600 }}>{r.name}</div>
                                    <div style={{ fontSize: 11, color: '#64748b' }}>
                                        {r.code} {r.category ? '· ' + r.category : ''}
                                    </div>
                                    {r.shortDescription && (
                                        <div style={{ fontSize: 11, color: '#475569' }}>{r.shortDescription}</div>
                                    )}
                                </div>
                            </label>
                        );
                    })}
                </div>
                <div style={{ padding: 12, borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                    <button onClick={onClose}>Cancel</button>
                    <button
                        onClick={confirm}
                        style={{ background: '#1e3a8a', color: 'white', padding: '8px 14px', border: 'none', borderRadius: 6 }}
                    >
                        Add selected ({selected.size})
                    </button>
                </div>
            </div>
        </div>
    );
}

const overlay = {
    position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
};
const panel = {
    background: 'white', borderRadius: 8, width: 600, maxWidth: '90vw', maxHeight: '85vh',
    display: 'flex', flexDirection: 'column', boxShadow: '0 10px 40px rgba(15,23,42,0.25)',
};
