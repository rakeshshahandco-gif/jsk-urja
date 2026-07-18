import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layers, Plus, Pencil, X, Check, Copy, Eye, Lock, Archive, Star, BadgeCheck, LayoutTemplate } from 'lucide-react';
import { useCompany } from '@/contexts/CompanyContext';
import { useToast } from '@/components/ui/Toast';
import { BrandedLoader } from '@/components/ui/BrandedLoading';
import { PATHS } from '@/routes/paths';
import {
    getPrintFormatVersions,
    createPrintFormatVersionDraft,
    copyPrintFormatVersion,
    updatePrintFormatVersion,
    approvePrintFormatVersion,
    setDefaultPrintFormatVersion,
    lockPrintFormatVersion,
    archivePrintFormatVersion,
    previewPrintFormatVersion,
} from '@/services/printFormatVersionApi';
import {
    PRINT_FORMAT_VERSION_DOCUMENT_TYPES,
    PRINT_FORMAT_VERSION_DOCUMENT_TYPE_LABELS,
    PRINT_FORMAT_VERSION_STATUS_LABELS,
    STATUS_BADGE_COLORS,
} from '@/constants/printFormatVersion.constants';

const inp = {
    height: 30, fontSize: 12, padding: '0 8px', border: '1px solid #d1d5db',
    borderRadius: 5, background: '#fff', outline: 'none', boxSizing: 'border-box', width: '100%',
};
const th = {
    padding: '5px 10px', fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase',
    letterSpacing: '0.04em', borderBottom: '1px solid #e5e7eb', background: '#f8fafc', whiteSpace: 'nowrap',
};
const td = { padding: '5px 10px', fontSize: 12, color: '#374151', borderBottom: '1px solid #f3f4f6', verticalAlign: 'middle' };
const btnPrimary = {
    height: 32, padding: '0 14px', background: '#0d9488', color: '#fff', border: 'none', borderRadius: 6,
    fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6,
};
const btnGhost = {
    height: 28, padding: '0 10px', background: '#fff', color: '#374151', border: '1px solid #d1d5db',
    borderRadius: 5, fontSize: 11, fontWeight: 600, cursor: 'pointer',
};

function StatusBadge({ status }) {
    const s = String(status || 'DRAFT').toUpperCase();
    const colors = STATUS_BADGE_COLORS[s] || STATUS_BADGE_COLORS.DRAFT;
    return (
        <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 999, fontSize: 10, fontWeight: 700, background: colors.bg, color: colors.color }}>
            {PRINT_FORMAT_VERSION_STATUS_LABELS[s] || s}
        </span>
    );
}

const BLANK = () => ({
    companyId: '',
    documentType: 'SALES_ORDER',
    formatVersion: '',
    name: '',
    notes: '',
});

export default function PrintFormatVersionManagerPage() {
    const navigate = useNavigate();
    const { companies, selectedCompany } = useCompany();
    const { addToast } = useToast();
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [showForm, setShowForm] = useState(false);
    const [editId, setEditId] = useState(null);
    const [form, setForm] = useState(BLANK());
    const [preview, setPreview] = useState(null);
    const [previewDocNumber, setPreviewDocNumber] = useState('');

    const [filterCompanyId, setFilterCompanyId] = useState(selectedCompany?._id || '');
    const [filterDocumentType, setFilterDocumentType] = useState('');

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const params = {};
            if (filterCompanyId) params.companyId = filterCompanyId;
            if (filterDocumentType) params.documentType = filterDocumentType;
            const data = await getPrintFormatVersions(params);
            setRows(Array.isArray(data) ? data : []);
        } catch (err) {
            addToast(err?.response?.data?.message || 'Failed to load format versions', 'error');
        } finally {
            setLoading(false);
        }
    }, [addToast, filterCompanyId, filterDocumentType]);

    useEffect(() => { load(); }, [load]);

    const closeForm = () => {
        setShowForm(false);
        setEditId(null);
        setForm(BLANK());
    };

    const openAdd = () => {
        const blank = BLANK();
        blank.companyId = filterCompanyId || selectedCompany?._id || '';
        blank.documentType = filterDocumentType || 'SALES_ORDER';
        blank.name = `${PRINT_FORMAT_VERSION_DOCUMENT_TYPE_LABELS[blank.documentType]} format`;
        setForm(blank);
        setEditId(null);
        setShowForm(true);
    };

    const openEdit = (row) => {
        if (row.status !== 'DRAFT') {
            addToast('Only DRAFT versions can be edited. Create a copy instead.', 'error');
            return;
        }
        setForm({
            companyId: row.companyId?._id || row.companyId || '',
            documentType: row.documentType,
            formatVersion: row.formatVersion,
            name: row.name || '',
            notes: row.notes || '',
        });
        setEditId(row._id);
        setShowForm(true);
    };

    const handleSave = async () => {
        if (!form.companyId) {
            addToast('Select a company', 'error');
            return;
        }
        setSaving(true);
        try {
            if (editId) {
                await updatePrintFormatVersion(editId, { name: form.name, notes: form.notes });
                addToast('Draft updated', 'success');
            } else {
                await createPrintFormatVersionDraft({
                    companyId: form.companyId,
                    documentType: form.documentType,
                    formatVersion: form.formatVersion || undefined,
                    name: form.name,
                    notes: form.notes,
                });
                addToast('Draft created (live print unchanged)', 'success');
            }
            closeForm();
            await load();
        } catch (err) {
            addToast(err?.response?.data?.message || 'Save failed', 'error');
        } finally {
            setSaving(false);
        }
    };

    const runAction = async (fn, okMsg) => {
        try {
            await fn();
            addToast(okMsg, 'success');
            await load();
        } catch (err) {
            addToast(err?.response?.data?.message || 'Action failed', 'error');
        }
    };

    const handlePreview = async (row) => {
        try {
            const data = await previewPrintFormatVersion(row._id, {
                documentNumber: previewDocNumber || undefined,
            });
            setPreview(data);
        } catch (err) {
            addToast(err?.response?.data?.message || 'Preview failed', 'error');
        }
    };

    if (loading && !rows.length) {
        return <BrandedLoader message="Loading Print Format Version Manager..." />;
    }

    return (
        <div style={{ padding: '20px 24px', maxWidth: 1280, margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, gap: 12 }}>
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Layers size={20} color="#0d9488" />
                        <span style={{ fontSize: 14, fontWeight: 800, color: '#111827' }}>Print Format Version Manager</span>
                    </div>
                    <p style={{ margin: '6px 0 0', fontSize: 12, color: '#64748b', maxWidth: 780 }}>
                        Version registry for company + document type. JSON is the storage format.
                        Use the Visual Print Format Designer to drag/resize layout blocks — live SO/SI print stays golden until Custom Designer is explicitly enabled and published.
                    </p>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button
                        type="button"
                        onClick={() => navigate(PATHS.SETTINGS.PRINT_FORMAT_DESIGNER)}
                        style={{ ...btnPrimary, background: '#0f766e' }}
                    >
                        <LayoutTemplate size={14} /> Open Visual Designer
                    </button>
                    <button type="button" onClick={openAdd} style={btnPrimary}>
                        <Plus size={14} /> Create Draft
                    </button>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginBottom: 14, padding: 12, background: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: 8 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: '#475569' }}>
                    Company
                    <select value={filterCompanyId} onChange={(e) => setFilterCompanyId(e.target.value)} style={{ ...inp, marginTop: 4 }}>
                        <option value="">All companies</option>
                        {(companies || []).map((c) => (
                            <option key={c._id} value={c._id}>{c.companyName}</option>
                        ))}
                    </select>
                </label>
                <label style={{ fontSize: 11, fontWeight: 600, color: '#475569' }}>
                    Document Type
                    <select value={filterDocumentType} onChange={(e) => setFilterDocumentType(e.target.value)} style={{ ...inp, marginTop: 4 }}>
                        <option value="">All types</option>
                        {PRINT_FORMAT_VERSION_DOCUMENT_TYPES.map((dt) => (
                            <option key={dt} value={dt}>{PRINT_FORMAT_VERSION_DOCUMENT_TYPE_LABELS[dt]}</option>
                        ))}
                    </select>
                </label>
                <label style={{ fontSize: 11, fontWeight: 600, color: '#475569' }}>
                    Preview document #
                    <input
                        value={previewDocNumber}
                        onChange={(e) => setPreviewDocNumber(e.target.value)}
                        placeholder="e.g. 26-27/069"
                        style={{ ...inp, marginTop: 4 }}
                    />
                </label>
            </div>

            <div style={{ overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 980 }}>
                    <thead>
                        <tr>
                            <th style={th}>Company</th>
                            <th style={th}>Document</th>
                            <th style={th}>Version</th>
                            <th style={th}>Name</th>
                            <th style={th}>Status</th>
                            <th style={th}>Default</th>
                            <th style={th}>Copied From</th>
                            <th style={th}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.length === 0 ? (
                            <tr>
                                <td colSpan={8} style={{ ...td, textAlign: 'center', color: '#94a3b8', padding: 24 }}>
                                    No format versions yet. Create a draft per company / document type.
                                </td>
                            </tr>
                        ) : (
                            rows.map((row) => (
                                <tr key={row._id}>
                                    <td style={td}>{row.companyId?.companyName || '—'}</td>
                                    <td style={td}>{PRINT_FORMAT_VERSION_DOCUMENT_TYPE_LABELS[row.documentType] || row.documentType}</td>
                                    <td style={td}><code style={{ fontSize: 11 }}>{row.formatVersion}</code></td>
                                    <td style={td}>{row.name}</td>
                                    <td style={td}><StatusBadge status={row.status} /></td>
                                    <td style={td}>{row.isDefault ? 'Yes' : '—'}</td>
                                    <td style={td}>{row.copiedFromId?.formatVersion || '—'}</td>
                                    <td style={td}>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                            <button type="button" style={btnGhost} onClick={() => handlePreview(row)}>
                                                <Eye size={12} style={{ marginRight: 4, verticalAlign: 'middle' }} /> Preview
                                            </button>
                                            {row.status === 'DRAFT' && (
                                                <button type="button" style={btnGhost} onClick={() => openEdit(row)}>
                                                    <Pencil size={12} style={{ marginRight: 4, verticalAlign: 'middle' }} /> Edit
                                                </button>
                                            )}
                                            <button
                                                type="button"
                                                style={btnGhost}
                                                onClick={() => runAction(() => copyPrintFormatVersion(row._id), 'Draft copy created')}
                                            >
                                                <Copy size={12} style={{ marginRight: 4, verticalAlign: 'middle' }} /> Copy
                                            </button>
                                            {row.status === 'DRAFT' && (
                                                <button type="button" style={btnGhost} onClick={() => runAction(() => approvePrintFormatVersion(row._id), 'Approved')}>
                                                    <BadgeCheck size={12} style={{ marginRight: 4, verticalAlign: 'middle' }} /> Approve
                                                </button>
                                            )}
                                            {(row.status === 'APPROVED' || row.status === 'DEFAULT') && (
                                                <button type="button" style={btnGhost} onClick={() => runAction(() => setDefaultPrintFormatVersion(row._id), 'Set as default (live print still unchanged)')}>
                                                    <Star size={12} style={{ marginRight: 4, verticalAlign: 'middle' }} /> Set Default
                                                </button>
                                            )}
                                            {(row.status === 'DEFAULT' || row.status === 'APPROVED') && (
                                                <button type="button" style={btnGhost} onClick={() => runAction(() => lockPrintFormatVersion(row._id), 'Locked')}>
                                                    <Lock size={12} style={{ marginRight: 4, verticalAlign: 'middle' }} /> Lock
                                                </button>
                                            )}
                                            {row.status !== 'ARCHIVED' && row.status !== 'DEFAULT' && !(row.status === 'LOCKED' && row.isDefault) && (
                                                <button type="button" style={btnGhost} onClick={() => runAction(() => archivePrintFormatVersion(row._id), 'Archived')}>
                                                    <Archive size={12} style={{ marginRight: 4, verticalAlign: 'middle' }} /> Archive
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {preview && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 60, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 16px', overflowY: 'auto' }}>
                    <div style={{ width: '100%', maxWidth: 720, background: '#fff', borderRadius: 10, border: '1px solid #e5e7eb', padding: 20 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                            <span style={{ fontSize: 14, fontWeight: 800 }}>Format Preview (read-only)</span>
                            <button type="button" style={{ ...btnGhost, border: 'none' }} onClick={() => setPreview(null)}><X size={16} /></button>
                        </div>
                        <p style={{ fontSize: 12, color: '#0f766e', background: '#ccfbf1', padding: 8, borderRadius: 6 }}>
                            {preview.message}
                        </p>
                        <div style={{ fontSize: 12, marginTop: 10 }}>
                            <div><strong>{preview.format?.name}</strong> · {preview.format?.formatVersion} · <StatusBadge status={preview.format?.status} /></div>
                            <div style={{ color: '#64748b', marginTop: 4 }}>
                                {preview.format?.companyId?.companyName} · {preview.format?.documentType}
                            </div>
                        </div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#475569', margin: '12px 0 4px' }}>Layout snapshot</div>
                        <pre style={{ fontSize: 11, background: '#f8fafc', padding: 8, borderRadius: 6, maxHeight: 220, overflow: 'auto' }}>
                            {JSON.stringify(preview.format?.layoutSnapshot || {}, null, 2)}
                        </pre>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#475569', margin: '12px 0 4px' }}>Document data</div>
                        <pre style={{ fontSize: 11, background: '#f8fafc', padding: 8, borderRadius: 6, maxHeight: 160, overflow: 'auto' }}>
                            {JSON.stringify(preview.documentPreview || { hint: 'Enter a document # above and click Preview again' }, null, 2)}
                        </pre>
                    </div>
                </div>
            )}

            {showForm && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 60, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 16px', overflowY: 'auto' }}>
                    <div style={{ width: '100%', maxWidth: 560, background: '#fff', borderRadius: 10, border: '1px solid #e5e7eb', padding: 20 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                            <span style={{ fontSize: 14, fontWeight: 800 }}>{editId ? 'Edit Draft' : 'Create Draft Format Version'}</span>
                            <button type="button" onClick={closeForm} style={{ ...btnGhost, border: 'none' }}><X size={16} /></button>
                        </div>
                        <div style={{ display: 'grid', gap: 12 }}>
                            <label style={{ fontSize: 11, fontWeight: 600, color: '#475569' }}>
                                Company
                                <select
                                    value={form.companyId}
                                    disabled={!!editId}
                                    onChange={(e) => setForm((f) => ({ ...f, companyId: e.target.value }))}
                                    style={{ ...inp, marginTop: 4, background: editId ? '#f8fafc' : '#fff' }}
                                >
                                    <option value="">Select company…</option>
                                    {(companies || []).map((c) => (
                                        <option key={c._id} value={c._id}>{c.companyName}</option>
                                    ))}
                                </select>
                            </label>
                            {!editId && (
                                <label style={{ fontSize: 11, fontWeight: 600, color: '#475569' }}>
                                    Document Type
                                    <select
                                        value={form.documentType}
                                        onChange={(e) => setForm((f) => ({
                                            ...f,
                                            documentType: e.target.value,
                                            name: `${PRINT_FORMAT_VERSION_DOCUMENT_TYPE_LABELS[e.target.value]} format`,
                                        }))}
                                        style={{ ...inp, marginTop: 4 }}
                                    >
                                        {PRINT_FORMAT_VERSION_DOCUMENT_TYPES.map((dt) => (
                                            <option key={dt} value={dt}>{PRINT_FORMAT_VERSION_DOCUMENT_TYPE_LABELS[dt]}</option>
                                        ))}
                                    </select>
                                </label>
                            )}
                            {!editId && (
                                <label style={{ fontSize: 11, fontWeight: 600, color: '#475569' }}>
                                    Format Version (optional — auto Vn)
                                    <input
                                        value={form.formatVersion}
                                        onChange={(e) => setForm((f) => ({ ...f, formatVersion: e.target.value }))}
                                        placeholder="e.g. JSK_URJA_SO_V1"
                                        style={{ ...inp, marginTop: 4 }}
                                    />
                                </label>
                            )}
                            <label style={{ fontSize: 11, fontWeight: 600, color: '#475569' }}>
                                Name
                                <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} style={{ ...inp, marginTop: 4 }} />
                            </label>
                            <label style={{ fontSize: 11, fontWeight: 600, color: '#475569' }}>
                                Notes
                                <textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={3} style={{ ...inp, height: 'auto', marginTop: 4, padding: 8, resize: 'vertical' }} />
                            </label>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
                            <button type="button" style={btnGhost} onClick={closeForm} disabled={saving}>Cancel</button>
                            <button type="button" style={btnPrimary} onClick={handleSave} disabled={saving}>
                                <Check size={14} /> {saving ? 'Saving…' : 'Save Draft'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
