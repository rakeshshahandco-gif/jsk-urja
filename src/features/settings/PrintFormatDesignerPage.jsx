import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { PATHS } from '@/routes/paths';
import { buildLayoutV2, getDefaultColumns, mergeFields, mergeColumns } from '@/constants/printFormatSections';
import { buildLayoutPreviewDocument } from '@/constants/printFormatPreviewData';
import { getCompanyProfile } from '@/services/settingsApi';
import PrintFormatWysiwygEditor from './components/PrintFormatWysiwygEditor';
import {
    listPrintFormats,
    pullOriginalPrintFormat,
    pullBlankPrintFormat,
    copyPrintFormat,
    importPrintFormat,
    buildPrintFormatExportPayload,
    savePrintFormatDraft,
    approvePrintFormat,
    setDefaultPrintFormat,
    previewPrintFormat,
    deletePrintFormat,
    getSampleDocSuggestion,
    listPrintFormatSampleDocs,
    getPrintDesignerSettings,
} from '@/services/printFormatApi';
import { getPrintFormatDisplayStatus } from '@/utils/printFormatRuntime';
import { getInvoiceSeries } from '@/services/salesApi';

const DOC_TYPES = ['Sales Order', 'Sales Invoice'];
const PAPER_SIZES = ['A4', 'Letter', 'Legal', 'Custom'];
const ORIENTATIONS = ['portrait', 'landscape'];

const card = {
    background: '#fff',
    border: '1px solid #e2e8f0',
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
};

const inp = {
    padding: '8px 12px',
    border: '1px solid #e2e8f0',
    borderRadius: 8,
    fontSize: 14,
    width: '100%',
    boxSizing: 'border-box',
};

const btn = (bg, color = '#fff') => ({
    padding: '8px 14px',
    borderRadius: 8,
    border: 'none',
    background: bg,
    color,
    fontWeight: 700,
    fontSize: 13,
    cursor: 'pointer',
});

const emptyFormat = () => ({
    name: '',
    paperSize: 'A4',
    orientation: 'portrait',
    margins: { top: 10, right: 10, bottom: 10, left: 10, unit: 'mm' },
    customPaper: { widthMm: 210, heightMm: 297 },
    layout: buildLayoutV2('Sales Order'),
});

function mergeLayoutWithV2(savedLayout, docType) {
    const base = buildLayoutV2(docType);
    const saved = savedLayout || {};
    const hasBlocks = saved.blocks && Object.keys(saved.blocks).length > 0;
    if ((saved.engineVersion >= 2) && hasBlocks) {
        return {
            ...base,
            ...saved,
            engineVersion: 3,
            blocks: { ...base.blocks, ...(saved.blocks || {}) },
            fields: mergeFields(saved.fields || {}, docType),
            itemTable: {
                ...base.itemTable,
                ...(saved.itemTable || {}),
                columns: saved.itemTable?.columns?.length
                    ? mergeColumns(saved.itemTable.columns, docType)
                    : getDefaultColumns(docType),
            },
            sections: { ...base.sections, ...(saved.sections || {}) },
        };
    }
    return {
        ...base,
        ...saved,
        engineVersion: 3,
        blocks: { ...base.blocks, ...(saved.blocks || {}) },
        fields: mergeFields(saved.fields || {}, docType),
        itemTable: {
            ...base.itemTable,
            ...(saved.itemTable || {}),
            columns: getDefaultColumns(docType),
        },
        sections: { ...base.sections, ...(saved.sections || {}) },
    };
}

export default function PrintFormatDesignerPage() {
    const navigate = useNavigate();
    const [docType, setDocType] = useState('Sales Order');
    const [invoiceSeriesId, setInvoiceSeriesId] = useState('');
    const [invoiceSeriesList, setInvoiceSeriesList] = useState([]);
    const [formats, setFormats] = useState([]);
    const [selectedId, setSelectedId] = useState('');
    const [form, setForm] = useState(emptyFormat());
    const [sampleDocRef, setSampleDocRef] = useState('');
    const [sampleDocOptions, setSampleDocOptions] = useState([]);
    const [loadingSampleDocs, setLoadingSampleDocs] = useState(false);
    const [editorOpen, setEditorOpen] = useState(false);
    const [sampleDocument, setSampleDocument] = useState(null);
    const [company, setCompany] = useState({});
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [layoutPreviewMode, setLayoutPreviewMode] = useState(false);
    const [designerEnabled, setDesignerEnabled] = useState(false);

    useEffect(() => {
        getPrintDesignerSettings()
            .then((s) => setDesignerEnabled(!!s?.enableCustomPrintDesigner))
            .catch(() => setDesignerEnabled(false));
    }, []);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const seriesFilter = docType === 'Sales Invoice' ? invoiceSeriesId : null;
            const rows = await listPrintFormats(docType, seriesFilter || undefined);
            setFormats(rows || []);
            if (rows?.length) {
                setSelectedId((prev) => (rows.some((f) => f._id === prev) ? prev : rows[0]._id));
            } else {
                setSelectedId('');
            }
        } catch (e) {
            toast.error(e.response?.data?.message || 'Failed to load print formats');
        } finally {
            setLoading(false);
        }
    }, [docType, invoiceSeriesId]);

    useEffect(() => {
        load();
    }, [docType, invoiceSeriesId]);

    useEffect(() => {
        if (docType !== 'Sales Invoice') {
            setInvoiceSeriesId('');
            setInvoiceSeriesList([]);
            return;
        }
        getInvoiceSeries({ active: true })
            .then((list) => {
                const taxSeries = (list || []).filter((s) => !s.isEstimate);
                setInvoiceSeriesList(taxSeries);
                if (!invoiceSeriesId && taxSeries.length) {
                    const def = taxSeries.find((s) => s.isDefaultForTaxInvoice) || taxSeries[0];
                    setInvoiceSeriesId(def._id);
                }
            })
            .catch(() => setInvoiceSeriesList([]));
    }, [docType]);

    useEffect(() => {
        const seriesParam = docType === 'Sales Invoice' ? invoiceSeriesId : null;
        if (docType === 'Sales Invoice' && !invoiceSeriesId) {
            setSampleDocOptions([]);
            setSampleDocRef('');
            return;
        }
        setLoadingSampleDocs(true);
        Promise.all([
            listPrintFormatSampleDocs(docType, seriesParam || undefined),
            getSampleDocSuggestion(docType, seriesParam || undefined),
        ])
            .then(([options, suggested]) => {
                setSampleDocOptions(options || []);
                if (suggested) {
                    setSampleDocRef(suggested);
                } else if (options?.length) {
                    setSampleDocRef(options[0].ref);
                } else {
                    setSampleDocRef('');
                }
            })
            .catch(() => {
                setSampleDocOptions([]);
            })
            .finally(() => setLoadingSampleDocs(false));
    }, [docType, invoiceSeriesId]);

    useEffect(() => {
        const row = formats.find((f) => f._id === selectedId);
        if (row) {
            setForm({
                name: row.name,
                paperSize: row.paperSize,
                orientation: row.orientation,
                margins: row.margins || emptyFormat().margins,
                customPaper: row.customPaper || emptyFormat().customPaper,
                layout: mergeLayoutWithV2(row.layout, docType),
            });
        }
    }, [selectedId, formats, docType]);

    const selectFormat = (row) => {
        setSelectedId(row._id);
        if (editorOpen) {
            setEditorOpen(false);
            setSampleDocument(null);
        }
    };

    const openLiveEditor = async (formatId = selectedId) => {
        if (!formatId) return toast.error('Select a format first');
        try {
            const ref = sampleDocRef.trim();
            const [previewData, companyRes] = await Promise.all([
                previewPrintFormat(formatId, ref || undefined),
                getCompanyProfile().catch(() => ({ data: {} })),
            ]);
            const doc = previewData?.sampleDocument || buildLayoutPreviewDocument(docType);
            setSampleDocument(doc);
            setLayoutPreviewMode(Boolean(previewData?.isLayoutPreview ?? doc?._layoutPreview));
            setCompany(companyRes?.data || {});
            if (previewData?.format?.layout) {
                setForm((prev) => ({
                    ...prev,
                    name: previewData.format.name ?? prev.name,
                    paperSize: previewData.format.paperSize ?? prev.paperSize,
                    orientation: previewData.format.orientation ?? prev.orientation,
                    margins: previewData.format.margins ?? prev.margins,
                    customPaper: previewData.format.customPaper ?? prev.customPaper,
                    layout: mergeLayoutWithV2(previewData.format.layout, docType),
                }));
            }
            setEditorOpen(true);
            if (ref && previewData?.isLayoutPreview) {
                toast(`Invoice/SO "${ref}" not found — using layout sample data.`, { icon: 'ℹ️' });
            } else if (ref && !previewData?.isLayoutPreview) {
                toast.success(`Preview loaded: ${ref}`);
            }
        } catch (e) {
            toast.error(e.response?.data?.message || 'Could not open live format');
        }
    };

    const handleOpenLiveFormat = () => openLiveEditor(selectedId);

    const handlePullOriginal = async () => {
        if (docType === 'Sales Invoice' && !invoiceSeriesId) {
            return toast.error('Please select an Invoice Series first');
        }
        const series = invoiceSeriesList.find((s) => s._id === invoiceSeriesId);
        const defaultName = docType === 'Sales Invoice' && series
            ? `Original ${series.seriesName}`
            : `Original ${docType}`;
        try {
            const row = await pullOriginalPrintFormat(
                docType,
                form.name?.trim() || defaultName,
                docType === 'Sales Invoice' ? invoiceSeriesId : undefined,
            );
            toast.success(row._id ? 'Original layout ready — open editor to adjust blocks' : 'Original layout pulled');
            setSelectedId(row._id);
            setForm({
                name: row.name,
                paperSize: row.paperSize,
                orientation: row.orientation,
                margins: row.margins || emptyFormat().margins,
                customPaper: row.customPaper || emptyFormat().customPaper,
                layout: mergeLayoutWithV2(row.layout, docType),
            });
            await load();
            await openLiveEditor(row._id);
        } catch (e) {
            toast.error(e.response?.data?.message || 'Failed');
        }
    };

    const handleSaveDraft = async () => {
        if (!selectedId) return toast.error('Select or create a format first');
        setSaving(true);
        try {
            await savePrintFormatDraft(selectedId, {
                name: form.name,
                paperSize: form.paperSize,
                orientation: form.orientation,
                margins: form.margins,
                customPaper: form.customPaper,
                layout: {
                    ...form.layout,
                    blocks: form.layout?.blocks,
                    fields: form.layout?.fields,
                    itemTable: form.layout?.itemTable,
                },
            });
            toast.success('Draft saved');
            await load();
        } catch (e) {
            toast.error(e.response?.data?.message || 'Failed to save');
        } finally {
            setSaving(false);
        }
    };

    const handleApprove = async () => {
        if (!selectedId) return toast.error('Select a format first');
        try {
            await approvePrintFormat(selectedId);
            toast.success('Format approved — you may now set it as Active Default');
            await load();
        } catch (e) {
            toast.error(e.response?.data?.message || 'Failed to approve');
        }
    };

    const handleSetDefault = async () => {
        if (!selectedId) return toast.error('Select a format first');
        const row = formats.find((f) => f._id === selectedId);
        if (row?.status !== 'approved') {
            return toast.error('Approve the format first, then set as Active Default');
        }
        if (!window.confirm(
            `Set "${row?.name || 'this format'}" as Active Default for ${docType}?\n\nThis will override built-in print for live invoices/orders until changed.`,
        )) return;
        try {
            await setDefaultPrintFormat(selectedId);
            toast.success('Active Default set — live print will use this custom format');
            await load();
        } catch (e) {
            toast.error(e.response?.data?.message || 'Failed');
        }
    };

    const handleDelete = async () => {
        if (!selectedId || !window.confirm('Delete this print format?')) return;
        try {
            await deletePrintFormat(selectedId);
            toast.success('Deleted');
            setSelectedId('');
            setEditorOpen(false);
            setSampleDocument(null);
            await load();
        } catch (e) {
            toast.error(e.response?.data?.message || 'Failed');
        }
    };

    const handleSaveAsNewVersion = async () => {
        if (!selectedId) return toast.error('Select a format first');
        const base = selectedRow?.name || form.name || docType;
        const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
        const name = window.prompt('New version name:', `${base} — ${stamp}`);
        if (!name?.trim()) return;
        try {
            const row = await copyPrintFormat(selectedId, name.trim());
            toast.success('Saved as new draft version (live print unchanged)');
            setSelectedId(row._id);
            setForm({
                name: row.name,
                paperSize: row.paperSize,
                orientation: row.orientation,
                margins: row.margins || emptyFormat().margins,
                customPaper: row.customPaper || emptyFormat().customPaper,
                layout: mergeLayoutWithV2(row.layout, docType),
            });
            await load();
        } catch (e) {
            toast.error(e.response?.data?.message || 'Failed to save new version');
        }
    };

    const handleRestoreAsNewDraft = async () => {
        if (!selectedId) return toast.error('Select a format to restore from');
        if (!window.confirm(
            `Restore "${selectedRow?.name || 'selected format'}" as a new Draft?\n\nLive Active Default is not changed until you Approve + Set Active Default.`,
        )) return;
        try {
            const name = `${selectedRow?.name || form.name || docType} (Restored Draft)`;
            const row = await copyPrintFormat(selectedId, name);
            toast.success('Restored as new draft');
            setSelectedId(row._id);
            setForm({
                name: row.name,
                paperSize: row.paperSize,
                orientation: row.orientation,
                margins: row.margins || emptyFormat().margins,
                customPaper: row.customPaper || emptyFormat().customPaper,
                layout: mergeLayoutWithV2(row.layout, docType),
            });
            await load();
        } catch (e) {
            toast.error(e.response?.data?.message || 'Failed to restore');
        }
    };

    const handleExportFormat = () => {
        if (!selectedId || !selectedRow) return toast.error('Select a format first');
        const payload = buildPrintFormatExportPayload({
            ...selectedRow,
            ...form,
            _id: selectedId,
            docType,
            layout: form.layout || selectedRow.layout,
        });
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `print-format-${docType.replace(/\s+/g, '-').toLowerCase()}-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success('Format exported');
    };

    const handleImportFormat = () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'application/json,.json';
        input.onchange = async () => {
            const file = input.files?.[0];
            if (!file) return;
            try {
                const text = await file.text();
                const json = JSON.parse(text);
                if (!json.layout || !json.docType) {
                    return toast.error('Invalid export file (missing layout/docType)');
                }
                if (json.docType !== docType) {
                    if (!window.confirm(`File is for "${json.docType}" but current type is "${docType}". Import anyway as ${docType}?`)) {
                        return;
                    }
                }
                const row = await importPrintFormat({
                    docType,
                    name: json.name || `Imported ${docType}`,
                    paperSize: json.paperSize,
                    orientation: json.orientation,
                    margins: json.margins,
                    customPaper: json.customPaper,
                    layout: json.layout,
                    invoiceSeriesId: docType === 'Sales Invoice' ? invoiceSeriesId || undefined : undefined,
                });
                toast.success('Imported as new draft (live print unchanged)');
                setSelectedId(row._id);
                setForm({
                    name: row.name,
                    paperSize: row.paperSize,
                    orientation: row.orientation,
                    margins: row.margins || emptyFormat().margins,
                    customPaper: row.customPaper || emptyFormat().customPaper,
                    layout: mergeLayoutWithV2(row.layout, docType),
                });
                await load();
            } catch (e) {
                toast.error(e.response?.data?.message || e.message || 'Import failed');
            }
        };
        input.click();
    };

    const selectedRow = formats.find((f) => f._id === selectedId);

    if (editorOpen) {
        return (
            <PrintFormatWysiwygEditor
                docType={docType}
                form={form}
                setForm={setForm}
                sampleDocument={sampleDocument || buildLayoutPreviewDocument(docType)}
                company={company}
                isLayoutPreview={layoutPreviewMode}
                onSaveDraft={handleSaveDraft}
                onApprove={handleApprove}
                onSetDefault={handleSetDefault}
                onExit={() => {
                    setEditorOpen(false);
                    setLayoutPreviewMode(false);
                }}
                saving={saving}
            />
        );
    }

    return (
        <div style={{ padding: '24px 28px', fontFamily: "'Inter', sans-serif", background: '#f8f9fa', minHeight: '100vh' }}>
            <div style={{
                background: designerEnabled ? '#ecfdf5' : '#fef2f2',
                border: `1px solid ${designerEnabled ? '#6ee7b7' : '#fecaca'}`,
                borderRadius: 10,
                padding: '12px 16px',
                marginBottom: 16,
                fontSize: 13,
                color: designerEnabled ? '#065f46' : '#991b1b',
                lineHeight: 1.45,
            }}>
                {designerEnabled ? (
                    <>
                        <strong>Custom Print Format Designer is ENABLED.</strong>
                        {' '}Only Approved + Active Default formats affect live Sales Order/Sales Invoice print/PDF.
                        Draft formats never affect live print.
                    </>
                ) : (
                    <>
                        <strong>Custom Print Format Designer is currently DISABLED.</strong>
                        {' '}Live Sales Order/Sales Invoice print will use locked built-in formats.
                        {' '}
                        <button
                            type="button"
                            onClick={() => navigate(PATHS.SETTINGS.COMPANY_PROFILE)}
                            style={{
                                marginLeft: 4,
                                padding: 0,
                                border: 'none',
                                background: 'none',
                                color: '#1d4ed8',
                                fontWeight: 700,
                                cursor: 'pointer',
                                textDecoration: 'underline',
                            }}
                        >
                            Go to Company Settings to Enable
                        </button>
                    </>
                )}
            </div>
            {!designerEnabled && (
                <div style={{
                    background: '#fffbeb',
                    border: '1px solid #fcd34d',
                    borderRadius: 10,
                    padding: '10px 14px',
                    marginBottom: 16,
                    fontSize: 12,
                    color: '#92400e',
                }}>
                    Designer preview and draft editing remain available here for testing only. They do not change live invoice/SO print while disabled.
                </div>
            )}
            <div style={{ ...card, marginBottom: 16 }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
                    <button
                        type="button"
                        onClick={() => navigate(PATHS.SETTINGS.HOME)}
                        style={{ ...btn('#64748b'), alignSelf: 'center' }}
                    >
                        Back
                    </button>
                    <div style={{ minWidth: 180 }}>
                        <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 4 }}>Print Format Designer</div>
                    </div>
                    <div style={{ minWidth: 140 }}>
                        <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 4 }}>Doc Type</label>
                        <select
                            value={docType}
                            onChange={(e) => {
                                setDocType(e.target.value);
                                setSelectedId('');
                                setEditorOpen(false);
                                setSampleDocRef('');
                                setForm(emptyFormat());
                            }}
                            style={inp}
                        >
                            {DOC_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                        </select>
                    </div>
                    {docType === 'Sales Invoice' && (
                        <div style={{ minWidth: 180 }}>
                            <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 4 }}>
                                Invoice Series <span style={{ color: '#dc2626' }}>*</span>
                            </label>
                            <select
                                value={invoiceSeriesId}
                                onChange={(e) => {
                                    setInvoiceSeriesId(e.target.value);
                                    setSelectedId('');
                                    setEditorOpen(false);
                                }}
                                style={inp}
                            >
                                <option value="">Select series…</option>
                                {invoiceSeriesList.map((s) => (
                                    <option key={s._id} value={s._id}>
                                        {s.seriesName} ({s.prefix})
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}
                    <div style={{ minWidth: 160, flex: 1 }}>
                        <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 4 }}>Format Name</label>
                        <input
                            style={inp}
                            value={form.name}
                            onChange={(e) => setForm({ ...form, name: e.target.value })}
                            placeholder="Format name"
                        />
                    </div>
                    <div style={{ minWidth: 100 }}>
                        <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 4 }}>Paper</label>
                        <select style={inp} value={form.paperSize} onChange={(e) => setForm({ ...form, paperSize: e.target.value })}>
                            {PAPER_SIZES.map((p) => <option key={p} value={p}>{p}</option>)}
                        </select>
                    </div>
                    <div style={{ minWidth: 110 }}>
                        <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 4 }}>Orientation</label>
                        <select style={inp} value={form.orientation} onChange={(e) => setForm({ ...form, orientation: e.target.value })}>
                            {ORIENTATIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                        </select>
                    </div>
                    <div>
                        <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 4 }}>
                            Margins ({form.margins?.unit || 'mm'})
                        </label>
                        <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                            <select
                                style={{ ...inp, width: 90 }}
                                value={form.margins?.unit || 'mm'}
                                onChange={(e) => setForm({
                                    ...form,
                                    margins: { ...(form.margins || {}), unit: e.target.value },
                                })}
                            >
                                <option value="mm">mm</option>
                                <option value="inch">inch</option>
                            </select>
                        </div>
                        <div style={{ display: 'flex', gap: 6 }}>
                            {['top', 'right', 'bottom', 'left'].map((side) => (
                                <input
                                    key={side}
                                    type="number"
                                    placeholder={side}
                                    style={{ ...inp, width: 56 }}
                                    value={form.margins?.[side] ?? 10}
                                    onChange={(e) => setForm({ ...form, margins: { ...form.margins, [side]: Number(e.target.value) } })}
                                />
                            ))}
                        </div>
                    </div>
                    <div style={{ minWidth: 220 }}>
                        <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 4 }}>
                            {docType === 'Sales Order' ? 'Preview SO No' : 'Preview Invoice No'}
                        </label>
                        <select
                            style={inp}
                            value={sampleDocRef}
                            onChange={(e) => setSampleDocRef(e.target.value)}
                            disabled={loadingSampleDocs || (docType === 'Sales Invoice' && !invoiceSeriesId)}
                        >
                            <option value="">
                                {loadingSampleDocs ? 'Loading…' : '— Sample layout only —'}
                            </option>
                            {sampleDocOptions.map((opt) => (
                                <option key={opt.ref} value={opt.ref}>
                                    {opt.label}
                                </option>
                            ))}
                        </select>
                        <input
                            style={{ ...inp, marginTop: 6, fontSize: 12 }}
                            placeholder={docType === 'Sales Order' ? 'Or type SO no. e.g. 26-27/069' : 'Or type invoice no. e.g. 26-27/012'}
                            value={sampleDocRef}
                            onChange={(e) => setSampleDocRef(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleOpenLiveFormat()}
                        />
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignSelf: 'flex-end' }}>
                        <button type="button" style={btn('#2563eb')} onClick={handlePullOriginal}>Pull Original Format</button>
                        <button type="button" style={btn('#0ea5e9')} onClick={() => handleOpenLiveFormat()} disabled={!selectedId}>
                            Open Live Format
                        </button>
                        <button type="button" style={btn('#16a34a')} onClick={handleSaveDraft} disabled={saving || !selectedId}>
                            {saving ? 'Saving...' : 'Save Draft'}
                        </button>
                        <button type="button" style={btn('#0d9488')} onClick={handleApprove} disabled={!selectedId}>
                            Approve
                        </button>
                        <button
                            type="button"
                            style={btn('#7c3aed')}
                            onClick={handleSetDefault}
                            disabled={!selectedId || selectedRow?.status !== 'approved'}
                            title={selectedRow?.status !== 'approved' ? 'Approve format first' : 'Set as Active Default for live print'}
                        >
                            Set Active Default
                        </button>
                        <button type="button" style={btn('#0369a1')} onClick={handleSaveAsNewVersion} disabled={!selectedId}>
                            Save As New Version
                        </button>
                        <button type="button" style={btn('#b45309')} onClick={handleRestoreAsNewDraft} disabled={!selectedId}>
                            Restore as New Draft
                        </button>
                        <button type="button" style={btn('#475569')} onClick={handleExportFormat} disabled={!selectedId}>
                            Export
                        </button>
                        <button type="button" style={btn('#334155')} onClick={handleImportFormat}>
                            Import
                        </button>
                        <button type="button" style={btn('#dc2626')} onClick={handleDelete} disabled={!selectedId}>Delete</button>
                    </div>
                </div>
                {form.paperSize === 'Custom' && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 12, maxWidth: 320 }}>
                        <input
                            type="number"
                            placeholder="Width mm"
                            style={inp}
                            value={form.customPaper?.widthMm || ''}
                            onChange={(e) => setForm({ ...form, customPaper: { ...form.customPaper, widthMm: Number(e.target.value) } })}
                        />
                        <input
                            type="number"
                            placeholder="Height mm"
                            style={inp}
                            value={form.customPaper?.heightMm || ''}
                            onChange={(e) => setForm({ ...form, customPaper: { ...form.customPaper, heightMm: Number(e.target.value) } })}
                        />
                    </div>
                )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 16 }}>
                <div style={card}>
                    <div style={{ fontWeight: 800, marginBottom: 4 }}>Version History</div>
                    <div style={{ fontSize: 11, color: '#64748b', marginBottom: 12 }}>
                        Saved formats for this company + document type. Only Approved + Active Default drives live print.
                    </div>
                    {loading ? <div style={{ color: '#94a3b8' }}>Loading...</div> : (
                        formats.length === 0 ? (
                            <div style={{ color: '#94a3b8', fontSize: 13 }}>No custom formats yet. Pull Original to start.</div>
                        ) : formats.map((f) => (
                            <button
                                key={f._id}
                                type="button"
                                onClick={() => selectFormat(f)}
                                style={{
                                    display: 'block', width: '100%', textAlign: 'left', marginBottom: 8,
                                    padding: '10px 12px', borderRadius: 8, cursor: 'pointer',
                                    border: selectedId === f._id ? '2px solid #2563eb' : '1px solid #e2e8f0',
                                    background: selectedId === f._id ? '#eff6ff' : '#fff',
                                }}
                            >
                                <div style={{ fontWeight: 700, fontSize: 13 }}>{f.name}</div>
                                <div style={{ fontSize: 11, color: '#64748b' }}>
                                    {getPrintFormatDisplayStatus(f)} | {f.source}
                                </div>
                            </button>
                        ))
                    )}
                </div>

                <div>
                    {selectedRow && (
                        <div style={{ ...card, fontSize: 13, color: '#475569' }}>
                            <strong>Selected:</strong> {selectedRow.name}
                            <div style={{ marginTop: 6 }}>
                                Paper: {selectedRow.paperSize} {selectedRow.orientation} | Margins: {selectedRow.margins?.top ?? 10}mm
                                {selectedRow.isDefault && selectedRow.status === 'approved' && (
                                    <span style={{ marginLeft: 10, color: '#059669', fontWeight: 700 }}>
                                        Active Default for {docType}
                                        {docType === 'Sales Invoice' && invoiceSeriesList.find((s) => s._id === selectedRow.invoiceSeriesId)
                                            ? ` · ${invoiceSeriesList.find((s) => s._id === selectedRow.invoiceSeriesId).seriesName}`
                                            : ''}
                                    </span>
                                )}
                            </div>
                            <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 10, marginBottom: 0 }}>
                                <strong>Pull Original Format</strong> loads the built-in layout.
                                {docType === 'Sales Invoice' && (
                                    <> Select <strong>Invoice Series</strong> and pick a real <strong>Preview Invoice No</strong> (e.g. 26-27/012) to align blocks with live data — all invoice fields are shown read-only.</>
                                )}
                                {docType === 'Sales Order' && (
                                    <> Pick a real <strong>Preview SO No</strong> to align with live order data.</>
                                )}
                                {' '}Click <strong>Open Live Format</strong> to move blocks. Only layout is saved, not document values.
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
