import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { productCatalogApi } from '@/services/productCatalogApi';

export default function ProductCatalogListPage() {
    const navigate = useNavigate();
    const [rows, setRows] = useState([]);
    const [search, setSearch] = useState('');
    const [activeOnly, setActiveOnly] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const load = async () => {
        setLoading(true);
        setError('');
        try {
            const params = { limit: 200 };
            if (search) params.search = search;
            if (activeOnly) params.isActive = true;
            const data = await productCatalogApi.list(params);
            setRows(data?.results || []);
        } catch (e) {
            setError(e.response?.data?.message || e.message || 'Failed to load catalog');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

    const categories = useMemo(() => {
        const set = new Set(rows.map((r) => r.category).filter(Boolean));
        return Array.from(set);
    }, [rows]);

    return (
        <div style={{ padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div>
                    <h2 style={{ margin: 0 }}>Product Catalog</h2>
                    <div style={{ fontSize: 12, color: '#64748b' }}>
                        Shareable catalog of products (image, datasheet, brochure, video) for WhatsApp leads.
                    </div>
                </div>
                <Link
                    to="/crm/product-catalog/new"
                    style={{
                        background: '#1e3a8a', color: 'white', padding: '8px 14px',
                        borderRadius: 6, textDecoration: 'none', fontSize: 14,
                    }}
                >
                    + Add Product
                </Link>
            </div>

            <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                <input
                    placeholder="Search by name / code / category"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') load(); }}
                    style={{ flex: 1, minWidth: 240, padding: 8, border: '1px solid #cbd5e1', borderRadius: 6 }}
                />
                <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13 }}>
                    <input type="checkbox" checked={activeOnly} onChange={(e) => setActiveOnly(e.target.checked)} />
                    Active only
                </label>
                <button onClick={load} style={{ padding: '8px 14px' }}>Search</button>
            </div>

            {error && <div style={{ color: '#dc2626', marginBottom: 8 }}>{error}</div>}

            <div style={{ background: 'white', borderRadius: 8, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead style={{ background: '#f1f5f9' }}>
                        <tr>
                            <th style={{ textAlign: 'left', padding: 10 }}>Image</th>
                            <th style={{ textAlign: 'left', padding: 10 }}>Code</th>
                            <th style={{ textAlign: 'left', padding: 10 }}>Name</th>
                            <th style={{ textAlign: 'left', padding: 10 }}>Category</th>
                            <th style={{ textAlign: 'left', padding: 10 }}>Assets</th>
                            <th style={{ textAlign: 'left', padding: 10 }}>Status</th>
                            <th style={{ textAlign: 'left', padding: 10 }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading && (
                            <tr><td colSpan={7} style={{ padding: 16, textAlign: 'center' }}>Loading...</td></tr>
                        )}
                        {!loading && rows.length === 0 && (
                            <tr>
                                <td colSpan={7} style={{ padding: 16, textAlign: 'center', color: '#64748b' }}>
                                    No products in catalog yet.
                                </td>
                            </tr>
                        )}
                        {rows.map((r) => (
                            <tr key={r._id} style={{ borderTop: '1px solid #e2e8f0' }}>
                                <td style={{ padding: 8 }}>
                                    {r.imageUrl
                                        ? <img src={r.imageUrl} alt={r.name} style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 4 }} />
                                        : <div style={{ width: 40, height: 40, background: '#e2e8f0', borderRadius: 4 }} />}
                                </td>
                                <td style={{ padding: 8, fontFamily: 'monospace' }}>{r.code}</td>
                                <td style={{ padding: 8 }}>{r.name}</td>
                                <td style={{ padding: 8 }}>{r.category || '-'}</td>
                                <td style={{ padding: 8, fontSize: 12 }}>
                                    {r.catalogPdfUrl && <span style={pill}>Catalog</span>}
                                    {r.datasheetPdfUrl && <span style={pill}>Datasheet</span>}
                                    {r.brochureUrl && <span style={pill}>Brochure</span>}
                                    {r.videoUrl && <span style={pill}>Video</span>}
                                </td>
                                <td style={{ padding: 8 }}>
                                    <span style={{ color: r.isActive ? '#16a34a' : '#94a3b8' }}>
                                        {r.isActive ? 'Active' : 'Inactive'}
                                    </span>
                                </td>
                                <td style={{ padding: 8 }}>
                                    <button onClick={() => navigate(`/crm/product-catalog/${r._id}`)}>Edit</button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {categories.length > 0 && (
                <div style={{ marginTop: 12, fontSize: 12, color: '#64748b' }}>
                    Categories: {categories.join(', ')}
                </div>
            )}
        </div>
    );
}

const pill = {
    display: 'inline-block',
    padding: '2px 6px',
    background: '#e0e7ff',
    color: '#3730a3',
    borderRadius: 4,
    marginRight: 4,
    fontSize: 11,
};
