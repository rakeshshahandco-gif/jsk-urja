import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { productCatalogApi } from '@/services/productCatalogApi';

const EMPTY = {
    name: '',
    code: '',
    category: '',
    shortDescription: '',
    detailedDescription: '',
    technicalSpecs: {},
    imageUrl: '',
    catalogPdfUrl: '',
    datasheetPdfUrl: '',
    brochureUrl: '',
    videoUrl: '',
    isActive: true,
};

export default function ProductCatalogFormPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const isEdit = Boolean(id);

    const [form, setForm] = useState(EMPTY);
    const [specsText, setSpecsText] = useState('');
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [uploading, setUploading] = useState('');

    useEffect(() => {
        let cancelled = false;
        if (!isEdit) return;
        (async () => {
            setLoading(true);
            try {
                const data = await productCatalogApi.get(id);
                if (cancelled) return;
                setForm({ ...EMPTY, ...data, technicalSpecs: data?.technicalSpecs || {} });
                setSpecsText(specsObjectToText(data?.technicalSpecs));
            } catch (e) {
                setError(e.response?.data?.message || e.message);
            } finally {
                setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [id, isEdit]);

    const onChange = (k, v) => setForm((s) => ({ ...s, [k]: v }));

    const onSubmit = async (e) => {
        e.preventDefault();
        setSaving(true);
        setError('');
        try {
            const body = { ...form, technicalSpecs: specsTextToObject(specsText) };
            if (isEdit) {
                await productCatalogApi.update(id, body);
            } else {
                const created = await productCatalogApi.create(body);
                navigate(`/crm/product-catalog/${created._id}`);
                return;
            }
            navigate('/crm/product-catalog');
        } catch (err) {
            setError(err.response?.data?.message || err.message || 'Save failed');
        } finally {
            setSaving(false);
        }
    };

    const onUpload = async (assetType, file) => {
        if (!isEdit) {
            setError('Save the product first, then upload assets.');
            return;
        }
        setUploading(assetType);
        try {
            const res = await productCatalogApi.uploadAsset(id, assetType, file);
            if (res?.product) {
                setForm((s) => ({ ...s, ...res.product }));
            } else if (res?.url) {
                const fieldMap = {
                    image: 'imageUrl',
                    catalog: 'catalogPdfUrl',
                    datasheet: 'datasheetPdfUrl',
                    brochure: 'brochureUrl',
                };
                setForm((s) => ({ ...s, [fieldMap[assetType]]: res.url }));
            }
        } catch (err) {
            setError(err.response?.data?.message || err.message || 'Upload failed');
        } finally {
            setUploading('');
        }
    };

    if (loading) return <div style={{ padding: 24 }}>Loading...</div>;

    return (
        <div style={{ padding: 24, maxWidth: 900 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h2 style={{ margin: 0 }}>{isEdit ? 'Edit Product' : 'New Product'}</h2>
                <button type="button" onClick={() => navigate('/crm/product-catalog')}>Back to list</button>
            </div>

            {error && <div style={{ color: '#dc2626', marginBottom: 12 }}>{error}</div>}

            <form onSubmit={onSubmit} style={{ display: 'grid', gap: 14, background: 'white', padding: 20, border: '1px solid #e2e8f0', borderRadius: 8 }}>
                <Row label="Product Name *">
                    <input value={form.name} onChange={(e) => onChange('name', e.target.value)} required style={input} />
                </Row>
                <Row label="Product Code *">
                    <input value={form.code} onChange={(e) => onChange('code', e.target.value)} required style={input} />
                </Row>
                <Row label="Category">
                    <input value={form.category} onChange={(e) => onChange('category', e.target.value)} style={input} />
                </Row>
                <Row label="Short Description">
                    <input value={form.shortDescription} onChange={(e) => onChange('shortDescription', e.target.value)} style={input} />
                </Row>
                <Row label="Detailed Description">
                    <textarea value={form.detailedDescription} onChange={(e) => onChange('detailedDescription', e.target.value)} rows={4} style={input} />
                </Row>

                <fieldset style={{ border: '1px solid #e2e8f0', borderRadius: 6, padding: 12 }}>
                    <legend style={{ fontWeight: 600, fontSize: 13 }}>Technical Specifications</legend>
                    <div style={{ fontSize: 11, color: '#64748b', marginBottom: 6 }}>
                        One per line, format <code>key: value</code> (e.g. <code>Wattage: 20W</code>).
                    </div>
                    <textarea
                        value={specsText}
                        onChange={(e) => setSpecsText(e.target.value)}
                        rows={5}
                        placeholder="Wattage: 20W\nInput Voltage: 220V AC\nDimming: DALI"
                        style={input}
                    />
                </fieldset>

                <fieldset style={{ border: '1px solid #e2e8f0', borderRadius: 6, padding: 12, display: 'grid', gap: 10 }}>
                    <legend style={{ fontWeight: 600, fontSize: 13 }}>Assets</legend>
                    <AssetField label="Product Image"   url={form.imageUrl}        accept="image/*"          uploadType="image"     uploading={uploading} onUpload={onUpload} onUrlChange={(v) => onChange('imageUrl', v)} canUpload={isEdit} />
                    <AssetField label="Catalog PDF"     url={form.catalogPdfUrl}   accept="application/pdf"  uploadType="catalog"   uploading={uploading} onUpload={onUpload} onUrlChange={(v) => onChange('catalogPdfUrl', v)} canUpload={isEdit} />
                    <AssetField label="Datasheet PDF"   url={form.datasheetPdfUrl} accept="application/pdf"  uploadType="datasheet" uploading={uploading} onUpload={onUpload} onUrlChange={(v) => onChange('datasheetPdfUrl', v)} canUpload={isEdit} />
                    <AssetField label="Brochure"        url={form.brochureUrl}     accept="application/pdf,image/*" uploadType="brochure" uploading={uploading} onUpload={onUpload} onUrlChange={(v) => onChange('brochureUrl', v)} canUpload={isEdit} />
                    <Row label="Video / Demo Link">
                        <input value={form.videoUrl} onChange={(e) => onChange('videoUrl', e.target.value)} placeholder="https://..." style={input} />
                    </Row>
                </fieldset>

                <Row label="Status">
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <input type="checkbox" checked={form.isActive} onChange={(e) => onChange('isActive', e.target.checked)} />
                        Active
                    </label>
                </Row>

                <div style={{ display: 'flex', gap: 8 }}>
                    <button type="submit" disabled={saving} style={{ background: '#1e3a8a', color: 'white', padding: '10px 18px', border: 'none', borderRadius: 6 }}>
                        {saving ? 'Saving...' : (isEdit ? 'Update Product' : 'Create Product')}
                    </button>
                    <button type="button" onClick={() => navigate('/crm/product-catalog')}>Cancel</button>
                </div>
            </form>
        </div>
    );
}

function Row({ label, children }) {
    return (
        <div>
            <label style={{ display: 'block', fontSize: 12, color: '#475569', marginBottom: 4 }}>{label}</label>
            {children}
        </div>
    );
}

function AssetField({ label, url, accept, uploadType, uploading, onUpload, onUrlChange, canUpload }) {
    return (
        <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr auto', gap: 8, alignItems: 'center' }}>
            <div style={{ fontSize: 12, color: '#475569' }}>{label}</div>
            <input
                value={url || ''}
                onChange={(e) => onUrlChange(e.target.value)}
                placeholder="URL or upload file"
                style={input}
            />
            <label style={{ fontSize: 12, color: '#1e3a8a', cursor: canUpload ? 'pointer' : 'not-allowed', opacity: canUpload ? 1 : 0.5 }}>
                {uploading === uploadType ? 'Uploading...' : (url ? 'Replace' : 'Upload')}
                <input
                    type="file"
                    accept={accept}
                    style={{ display: 'none' }}
                    disabled={!canUpload || uploading === uploadType}
                    onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) onUpload(uploadType, f);
                        e.target.value = '';
                    }}
                />
            </label>
        </div>
    );
}

const input = { width: '100%', padding: 8, border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 13 };

function specsObjectToText(obj) {
    if (!obj || typeof obj !== 'object') return '';
    return Object.entries(obj).map(([k, v]) => `${k}: ${v}`).join('\n');
}

function specsTextToObject(text) {
    const out = {};
    String(text || '').split(/\r?\n/).forEach((line) => {
        const idx = line.indexOf(':');
        if (idx <= 0) return;
        const k = line.slice(0, idx).trim();
        const v = line.slice(idx + 1).trim();
        if (k) out[k] = v;
    });
    return out;
}
