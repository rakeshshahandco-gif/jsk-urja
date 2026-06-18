import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { leadApi } from '@/services/leadApi';
import { useAuth } from '@/hooks/useAuth';
import { useCompany } from '@/contexts/CompanyContext';
import ProductCatalogPicker from '@/features/productCatalog/components/ProductCatalogPicker';
import CreateTaskFromLeadModal from '../components/CreateTaskFromLeadModal';

const STATUS = ['new', 'contacted', 'qualified', 'quotation', 'negotiation', 'won', 'lost', 'hold'];
const PRIORITY = ['high', 'medium', 'low'];
const ASSETS = [
    { type: 'catalog', label: 'Catalog PDF', field: 'catalogPdfUrl' },
    { type: 'datasheet', label: 'Datasheet PDF', field: 'datasheetPdfUrl' },
    { type: 'brochure', label: 'Brochure', field: 'brochureUrl' },
    { type: 'image', label: 'Image', field: 'imageUrl' },
    { type: 'video', label: 'Video / Demo', field: 'videoUrl' },
];

const EMPTY = {
    customerName: '',
    customerMobile: '',
    customerEmail: '',
    source: 'manual',
    status: 'new',
    priority: 'medium',
    assignedTo: null,
    nextFollowUpDate: '',
    whatsapp: { messageText: '', receivedAt: null, threadRef: '', attachments: [] },
    products: [],
    notes: '',
};

export default function LeadFormPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const isEdit = Boolean(id);

    const [form, setForm] = useState(EMPTY);
    const [activities, setActivities] = useState([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [pickerOpen, setPickerOpen] = useState(false);
    const [sharing, setSharing] = useState('');
    const [whatsappLink, setWhatsappLink] = useState('');
    const [linkedTasks, setLinkedTasks] = useState([]);
    const [visibilityMeta, setVisibilityMeta] = useState({ canAssign: false, users: [] });
    const [showCreateTask, setShowCreateTask] = useState(false);
    const { hasPermission } = useAuth();
    const { selectedCompany, loading: companyLoading } = useCompany();
    const companyId = selectedCompany?._id || selectedCompany?.id;

    const reload = async () => {
        if (!isEdit) return;
        setLoading(true);
        try {
            const data = await leadApi.get(id);
            setForm({
                ...EMPTY,
                ...data,
                customerName: data.customerName || data.customerId?.customerName || '',
                nextFollowUpDate: data.nextFollowUpDate ? data.nextFollowUpDate.slice(0, 10) : '',
                whatsapp: { ...EMPTY.whatsapp, ...(data.whatsapp || {}) },
                assignedTo: data.assignedTo?._id || data.assignedTo || null,
                products: (data.products || []).map((p) => ({
                    catalogProductId: p.catalogProductId?._id || p.catalogProductId,
                    catalogProduct: p.catalogProductId && typeof p.catalogProductId === 'object' ? p.catalogProductId : null,
                    quantity: p.quantity || 0,
                    requirementNote: p.requirementNote || '',
                })),
            });
            const acts = await leadApi.activities(id, { limit: 100 });
            setActivities(acts || []);
            const mobile = (data.customerMobile || '').replace(/[^0-9]/g, '');
            if (mobile) setWhatsappLink(`https://wa.me/${mobile}`);
        } catch (e) {
            setError(e.response?.data?.message || e.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (companyLoading || !companyId) return;
        reload();
        /* eslint-disable-next-line react-hooks/exhaustive-deps */
    }, [id, companyId, companyLoading]);

    const update = (k, v) => setForm((s) => ({ ...s, [k]: v }));

    const onSave = async (e) => {
        e?.preventDefault?.();
        setSaving(true);
        setError('');
        try {
            const body = {
                customerName: form.customerName,
                customerMobile: form.customerMobile,
                customerEmail: form.customerEmail,
                source: form.source,
                status: form.status,
                priority: form.priority,
                assignedTo: form.assignedTo || null,
                nextFollowUpDate: form.nextFollowUpDate ? new Date(form.nextFollowUpDate).toISOString() : null,
                notes: form.notes,
                products: form.products.map((p) => ({
                    catalogProductId: p.catalogProductId,
                    quantity: Number(p.quantity) || 0,
                    requirementNote: p.requirementNote || '',
                })),
            };
            if (isEdit) {
                await leadApi.update(id, body);
            } else {
                const created = await leadApi.create(body);
                navigate(`/crm/leads/${created._id}`);
                return;
            }
            await reload();
        } catch (err) {
            setError(err.response?.data?.message || err.message || 'Save failed');
        } finally {
            setSaving(false);
        }
    };

    const addPickedProducts = (picked) => {
        setPickerOpen(false);
        if (!picked?.length) return;
        const existingIds = new Set(form.products.map((p) => String(p.catalogProductId)));
        const additions = picked
            .filter((p) => !existingIds.has(String(p._id)))
            .map((p) => ({
                catalogProductId: p._id,
                catalogProduct: p,
                quantity: 0,
                requirementNote: '',
            }));
        setForm((s) => ({ ...s, products: [...s.products, ...additions] }));
    };

    const removeProduct = (idx) => {
        setForm((s) => ({ ...s, products: s.products.filter((_, i) => i !== idx) }));
    };

    const shareAsset = async (catalogProductId, assetType, url) => {
        if (!isEdit) {
            setError('Save the lead first, then share assets.');
            return;
        }
        setSharing(`${catalogProductId}-${assetType}`);
        try {
            await leadApi.shareAsset(id, { catalogProductId, assetType, channel: 'whatsapp', url });
            await reload();
            if (url && whatsappLink) {
                const composed = `${whatsappLink}?text=${encodeURIComponent(url)}`;
                window.open(composed, '_blank', 'noopener');
            }
        } catch (err) {
            setError(err.response?.data?.message || err.message || 'Share failed');
        } finally {
            setSharing('');
        }
    };

    if (loading) return <div style={{ padding: 24 }}>Loading...</div>;

    return (
        <div style={{ padding: 24, display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16, maxWidth: 1200 }}>
            <form onSubmit={onSave} style={{ background: 'white', padding: 20, border: '1px solid #e2e8f0', borderRadius: 8, display: 'grid', gap: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h2 style={{ margin: 0 }}>{isEdit ? 'Lead Detail' : 'New Lead'}</h2>
                    <button type="button" onClick={() => navigate('/crm/leads')}>Back to leads</button>
                </div>
                {error && <div style={{ color: '#dc2626' }}>{error}</div>}

                {isEdit && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 13, background: '#f8fafc', padding: 10, borderRadius: 6 }}>
                        <div><strong>Created By:</strong> {form.createdByName || '—'}</div>
                        <div><strong>Owner:</strong> {form.ownerName || form.assignedToName || 'Unassigned'}</div>
                        <div><strong>Created:</strong> {form.createdAt ? new Date(form.createdAt).toLocaleString() : '—'}</div>
                        <div><strong>Source:</strong> {form.source}</div>
                    </div>
                )}

                {isEdit && hasPermission('crm.leads.create_task') && (
                    <button
                        type="button"
                        onClick={() => setShowCreateTask(true)}
                        style={{ background: '#0f766e', color: '#fff', border: 'none', padding: '8px 14px', borderRadius: 6, width: 'fit-content' }}
                    >
                        Create Task
                    </button>
                )}

                <fieldset style={fs}>
                    <legend style={lg}>Customer</legend>
                    <div style={grid2}>
                        <Row label="Name"><input value={form.customerName} onChange={(e) => update('customerName', e.target.value)} style={input} /></Row>
                        <Row label="Mobile"><input value={form.customerMobile} onChange={(e) => update('customerMobile', e.target.value)} style={input} /></Row>
                        <Row label="Email"><input value={form.customerEmail} onChange={(e) => update('customerEmail', e.target.value)} style={input} /></Row>
                        <Row label="Source">
                            <select value={form.source} onChange={(e) => update('source', e.target.value)} style={input}>
                                {['whatsapp', 'manual', 'call', 'email', 'visit', 'other'].map((s) => <option key={s} value={s}>{s}</option>)}
                            </select>
                        </Row>
                    </div>
                </fieldset>

                {(form.whatsapp?.messageText || form.source === 'whatsapp') && (
                    <fieldset style={fs}>
                        <legend style={lg}>WhatsApp Message</legend>
                        <textarea
                            value={form.whatsapp.messageText || ''}
                            readOnly
                            rows={4}
                            style={{ ...input, background: '#f8fafc', fontFamily: 'monospace', fontSize: 12 }}
                        />
                        {form.whatsapp.receivedAt && (
                            <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
                                Received: {new Date(form.whatsapp.receivedAt).toLocaleString()}
                            </div>
                        )}
                    </fieldset>
                )}

                <fieldset style={fs}>
                    <legend style={lg}>Products</legend>
                    <button type="button" onClick={() => setPickerOpen(true)} style={{ marginBottom: 8 }}>+ Add from Catalog</button>
                    {form.products.length === 0 && (
                        <div style={{ fontSize: 12, color: '#64748b' }}>No products selected yet.</div>
                    )}
                    {form.products.map((p, idx) => {
                        const product = p.catalogProduct || null;
                        return (
                            <div key={p.catalogProductId || idx} style={{ border: '1px solid #e2e8f0', padding: 10, borderRadius: 6, marginBottom: 8 }}>
                                <div style={{ display: 'flex', gap: 8 }}>
                                    {product?.imageUrl
                                        ? <img src={product.imageUrl} alt="" style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 4 }} />
                                        : <div style={{ width: 48, height: 48, background: '#e2e8f0', borderRadius: 4 }} />}
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontWeight: 600 }}>{product?.name || p.catalogProductId}</div>
                                        <div style={{ fontSize: 11, color: '#64748b' }}>{product?.code}{product?.category ? ' · ' + product.category : ''}</div>
                                    </div>
                                    <button type="button" onClick={() => removeProduct(idx)}>Remove</button>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 8, marginTop: 8 }}>
                                    <div>
                                        <label style={lbl}>Quantity</label>
                                        <input
                                            type="number"
                                            min="0"
                                            value={p.quantity}
                                            onChange={(e) => {
                                                const list = [...form.products];
                                                list[idx] = { ...list[idx], quantity: e.target.value };
                                                update('products', list);
                                            }}
                                            style={input}
                                        />
                                    </div>
                                    <div>
                                        <label style={lbl}>Requirement Note</label>
                                        <input
                                            value={p.requirementNote}
                                            onChange={(e) => {
                                                const list = [...form.products];
                                                list[idx] = { ...list[idx], requirementNote: e.target.value };
                                                update('products', list);
                                            }}
                                            style={input}
                                        />
                                    </div>
                                </div>
                                {product && isEdit && (
                                    <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                        {ASSETS.map((a) => {
                                            const url = product[a.field];
                                            if (!url) return null;
                                            const key = `${p.catalogProductId}-${a.type}`;
                                            return (
                                                <button
                                                    key={a.type}
                                                    type="button"
                                                    onClick={() => shareAsset(p.catalogProductId, a.type, url)}
                                                    disabled={sharing === key}
                                                    style={{ background: '#16a34a', color: 'white', border: 'none', padding: '4px 10px', borderRadius: 4, fontSize: 12 }}
                                                >
                                                    {sharing === key ? 'Sharing...' : `Share ${a.label}`}
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </fieldset>

                <fieldset style={fs}>
                    <legend style={lg}>Workflow</legend>
                    <div style={grid2}>
                        <Row label="Status">
                            <select value={form.status} onChange={(e) => update('status', e.target.value)} style={input}>
                                {STATUS.map((s) => <option key={s} value={s}>{s}</option>)}
                            </select>
                        </Row>
                        <Row label="Priority">
                            <select value={form.priority} onChange={(e) => update('priority', e.target.value)} style={input}>
                                {PRIORITY.map((s) => <option key={s} value={s}>{s}</option>)}
                            </select>
                        </Row>
                        <Row label="Next Follow-up Date">
                            <input type="date" value={form.nextFollowUpDate} onChange={(e) => update('nextFollowUpDate', e.target.value)} style={input} />
                        </Row>
                        <Row label="Assigned To (User Id)">
                            <input value={form.assignedTo || ''} onChange={(e) => update('assignedTo', e.target.value)} placeholder="User _id (optional)" style={input} />
                        </Row>
                    </div>
                    <Row label="Notes">
                        <textarea value={form.notes} onChange={(e) => update('notes', e.target.value)} rows={3} style={input} />
                    </Row>
                </fieldset>

                <div style={{ display: 'flex', gap: 8 }}>
                    <button type="submit" disabled={saving} style={{ background: '#1e3a8a', color: 'white', padding: '10px 18px', border: 'none', borderRadius: 6 }}>
                        {saving ? 'Saving...' : (isEdit ? 'Update Lead' : 'Create Lead')}
                    </button>
                    <button type="button" onClick={() => navigate('/crm/leads')}>Cancel</button>
                </div>
            </form>

            <aside style={{ background: 'white', padding: 16, border: '1px solid #e2e8f0', borderRadius: 8 }}>
                {isEdit && (
                    <>
                        <h3 style={{ margin: '0 0 8px 0', fontSize: 14 }}>Linked Tasks</h3>
                        {linkedTasks.length === 0 && (
                            <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 12 }}>No tasks linked yet.</div>
                        )}
                        {linkedTasks.map((t) => (
                            <div key={t._id} style={{ fontSize: 12, marginBottom: 8, borderBottom: '1px solid #f1f5f9', paddingBottom: 6 }}>
                                <div style={{ fontWeight: 600 }}>{t.title}</div>
                                <div style={{ color: '#64748b' }}>
                                    {t.status} · Due {t.dueDate ? new Date(t.dueDate).toLocaleDateString() : '—'}
                                </div>
                            </div>
                        ))}
                    </>
                )}
                <h3 style={{ margin: '16px 0 8px 0', fontSize: 14 }}>Activity History</h3>
                <div style={{ fontSize: 11, color: '#64748b', marginBottom: 8 }}>
                    Chat imported, products selected, catalog / datasheet shared, follow-up scheduled, status changes.
                </div>
                {activities.length === 0 && (
                    <div style={{ fontSize: 12, color: '#94a3b8' }}>{isEdit ? 'No activity yet.' : 'Save the lead first to start activity log.'}</div>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {activities.map((a) => (
                        <div key={a._id} style={{ borderLeft: '3px solid #1e3a8a', paddingLeft: 8, fontSize: 12 }}>
                            <div style={{ fontWeight: 600 }}>{a.type.replace(/_/g, ' ')}</div>
                            <div style={{ color: '#64748b' }}>
                                {a.userId?.name || 'system'} · {new Date(a.at).toLocaleString()}
                            </div>
                            {a.payload && Object.keys(a.payload).length > 0 && (
                                <pre style={{ background: '#f8fafc', padding: 6, borderRadius: 4, margin: '4px 0 0 0', fontSize: 10, whiteSpace: 'pre-wrap' }}>
                                    {JSON.stringify(a.payload, null, 2)}
                                </pre>
                            )}
                        </div>
                    ))}
                </div>
            </aside>

            <ProductCatalogPicker
                open={pickerOpen}
                onClose={() => setPickerOpen(false)}
                onConfirm={addPickedProducts}
                initialIds={form.products.map((p) => p.catalogProductId)}
            />

            <CreateTaskFromLeadModal
                open={showCreateTask}
                lead={form}
                onClose={() => setShowCreateTask(false)}
                onCreated={() => {
                    setShowCreateTask(false);
                    reload();
                }}
            />
        </div>
    );
}

function Row({ label, children }) {
    return (
        <div>
            <label style={lbl}>{label}</label>
            {children}
        </div>
    );
}

const fs = { border: '1px solid #e2e8f0', borderRadius: 6, padding: 12 };
const lg = { fontWeight: 600, fontSize: 13 };
const lbl = { display: 'block', fontSize: 12, color: '#475569', marginBottom: 4 };
const input = { width: '100%', padding: 8, border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' };
const grid2 = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 };
