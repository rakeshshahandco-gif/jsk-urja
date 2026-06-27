import React, { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { whatsappBulkApi } from '@/services/whatsappBulkApi';

const page = { padding: '24px 28px', fontFamily: "'Inter', sans-serif", background: '#f8f9fa', minHeight: '100vh' };
const card = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 20, marginBottom: 16 };
const inp = { padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: 8, width: '100%', boxSizing: 'border-box', fontSize: 13 };
const btn = { padding: '8px 14px', borderRadius: 8, border: 'none', background: '#0f766e', color: '#fff', fontWeight: 600, cursor: 'pointer', marginRight: 8, marginBottom: 8 };
const btnSec = { ...btn, background: '#475569' };
const btnWarn = { ...btn, background: '#d97706' };
const btnDanger = { ...btn, background: '#b91c1c' };
const stepTitle = { fontSize: 15, fontWeight: 700, color: '#0f766e', margin: '0 0 12px' };

const SEND_LABELS = {
    text_only: 'Text only',
    image_only: 'Image only',
    image_with_caption: 'Image + caption',
};

function imagePreviewUrl(imageAttachment) {
    if (!imageAttachment?.fileUrl) return '';
    const url = imageAttachment.fileUrl;
    if (url.startsWith('http')) return url;
    const base = import.meta.env.VITE_API_URL?.replace(/\/api\/v1\/?$/, '') || '';
    return `${base}${url.startsWith('/') ? url : `/${url}`}`;
}

function detectFileSourceHint(name = '') {
    const lower = name.toLowerCase();
    if (lower.endsWith('.csv')) return 'csv_upload';
    if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) return 'excel_upload';
    return 'txt_upload';
}

const defaultForm = {
    campaignName: '',
    recipientSource: 'manual',
    messageBody: '',
    sendContentType: 'text_only',
    imageAttachment: null,
    sendMode: 'SAFE',
    scheduleType: 'now',
    scheduledStartAt: '',
    timezone: 'Asia/Kolkata',
    sendWindowStart: '09:00',
    sendWindowEnd: '19:00',
    dailyLimit: 100,
    batchSize: 25,
    gapBetweenBatchesMs: 86400000,
    manualNumbers: [],
    filters: {
        activeOnly: false,
        inactiveOnly: false,
        businessCategory: 'All',
        customerTypes: [],
        industryTypes: [],
        states: [],
        cities: [],
        selectedRecipientKeys: [],
    },
    uploadFilePath: '',
};

export default function WhatsappBulkCampaignsPage() {
    const [meta, setMeta] = useState(null);
    const [matters, setMatters] = useState([]);
    const [campaigns, setCampaigns] = useState([]);
    const [form, setForm] = useState(defaultForm);
    const [manualText, setManualText] = useState('');
    const [preview, setPreview] = useState(null);
    const [selectedRecipientKeys, setSelectedRecipientKeys] = useState([]);
    const [liveRecipients, setLiveRecipients] = useState(null);
    const [selectedId, setSelectedId] = useState(null);
    const [testMobile, setTestMobile] = useState('');
    const [fastConfirm, setFastConfirm] = useState(false);
    const [matterOnlyMode, setMatterOnlyMode] = useState(false);

    const selectedCampaign = useMemo(
        () => campaigns.find((c) => c._id === selectedId) || null,
        [campaigns, selectedId],
    );

    const load = async () => {
        try {
            const [m, c, mattersList] = await Promise.all([
                whatsappBulkApi.getMeta(),
                whatsappBulkApi.listCampaigns(),
                whatsappBulkApi.listMatters(),
            ]);
            setMeta(m);
            setCampaigns(c);
            setMatters(mattersList.filter((x) => x.isActive !== false));
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to load');
        }
    };

    const loadLiveRecipients = async (id = selectedId) => {
        if (!id) {
            setLiveRecipients(null);
            return;
        }
        try {
            const rows = await whatsappBulkApi.listRecipients(id);
            if (!rows.length) {
                setLiveRecipients(null);
                return;
            }
            setLiveRecipients({
                total: rows.length,
                sent: rows.filter((r) => r.status === 'sent').length,
                failed: rows.filter((r) => r.status === 'failed').length,
                pending: rows.filter((r) => r.status === 'pending').length,
                recipients: rows,
            });
        } catch {
            setLiveRecipients(null);
        }
    };

    useEffect(() => { load(); }, []);

    useEffect(() => {
        loadLiveRecipients(selectedId);
    }, [selectedId]);

    useEffect(() => {
        if (!selectedId) return undefined;
        const camp = campaigns.find((c) => c._id === selectedId);
        if (!camp || !['Pending', 'Sending', 'Scheduled'].includes(camp.status)) return undefined;
        const timer = setInterval(() => {
            load();
            loadLiveRecipients(selectedId);
        }, 5000);
        return () => clearInterval(timer);
    }, [selectedId, campaigns]);

    const applyMatterDefaults = (matterId) => {
        if (!matterId) {
            setMatterOnlyMode(false);
            setForm((f) => ({ ...f, matterId: null }));
            return;
        }
        const matter = matters.find((m) => m._id === matterId);
        if (!matter) return;
        setMatterOnlyMode(true);
        setForm((f) => ({
            ...f,
            matterId,
            messageBody: matter.messageBody || '',
            sendContentType: matter.sendContentType || 'text_only',
            imageAttachment: matter.imageAttachment || null,
            attachmentPath: matter.attachmentPath || '',
            campaignName: f.campaignName || matter.matterName,
        }));
    };

    const buildPayload = () => {
        const manualNumbers = manualText.split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean);
        let scheduledStartAt = null;
        if (form.scheduleType !== 'now' && form.scheduledStartAt) {
            scheduledStartAt = new Date(form.scheduledStartAt).toISOString();
        }
        const filters = {
            ...form.filters,
            businessCategory: form.filters.businessCategory || 'All',
            selectedRecipientKeys: selectedRecipientKeys.length ? selectedRecipientKeys : undefined,
        };
        return { ...form, filters, manualNumbers, scheduledStartAt };
    };

    const isMasterSource = ['customer_master', 'lead_master'].includes(form.recipientSource);
    const categoryOptions = meta?.businessCategories || meta?.customerTypes || ['All'];

    const toggleRecipient = (recipientKey, checked) => {
        setSelectedRecipientKeys((prev) => {
            if (checked) return prev.includes(recipientKey) ? prev : [...prev, recipientKey];
            return prev.filter((k) => k !== recipientKey);
        });
        setPreview((p) => {
            if (!p?.recipients) return p;
            const recipients = p.recipients.map((r) => (
                r.recipientKey === recipientKey ? { ...r, selected: checked } : r
            ));
            const finalSelected = recipients.filter((r) => r.status === 'pending' && r.selected).length;
            return { ...p, recipients, finalSelected };
        });
    };

    const toggleAllRecipients = (checked) => {
        if (!preview?.recipients) return;
        const keys = preview.recipients
            .filter((r) => r.status === 'pending')
            .map((r) => r.recipientKey);
        setSelectedRecipientKeys(checked ? keys : []);
        setPreview((p) => {
            const recipients = p.recipients.map((r) => (
                r.status === 'pending' ? { ...r, selected: checked } : r
            ));
            const finalSelected = checked ? keys.length : 0;
            return { ...p, recipients, finalSelected };
        });
    };

    const onCreate = async () => {
        try {
            if (!form.matterId && !form.messageBody?.trim() && form.sendContentType !== 'image_only') {
                toast.error('Pick a saved Matter template or enter a message');
                return;
            }
            if (form.sendMode === 'FAST' && !fastConfirm) {
                toast.error('Confirm Fast Mode risk before creating campaign');
                return;
            }
            if (form.scheduleType !== 'now' && !form.scheduledStartAt) {
                toast.error('Please select schedule date and time');
                return;
            }
            const doc = await whatsappBulkApi.createCampaign(buildPayload());
            toast.success('Campaign created — now Save Recipients then Start');
            setSelectedId(doc._id);
            load();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Create failed');
        }
    };

    const onSaveAsMatter = async () => {
        const name = window.prompt('Matter template name (message only — no recipients):', form.campaignName || 'New Matter');
        if (!name?.trim()) return;
        try {
            await whatsappBulkApi.createMatter({
                matterName: name.trim(),
                messageBody: form.messageBody,
                sendContentType: form.sendContentType || 'text_only',
                imageAttachment: form.imageAttachment,
                attachmentPath: form.attachmentPath || '',
                attachmentType: form.sendContentType === 'text_only' ? 'none' : 'image',
                isActive: true,
            });
            toast.success('Matter template saved — pick it from dropdown next time');
            load();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Save matter failed');
        }
    };

    const onPreview = async () => {
        try {
            const data = await whatsappBulkApi.previewRecipients(buildPayload());
            setPreview(data);
            const defaultKeys = (data.recipients || [])
                .filter((r) => r.status === 'pending' && r.selected !== false)
                .map((r) => r.recipientKey);
            setSelectedRecipientKeys(defaultKeys);
        } catch (err) {
            toast.error(err.response?.data?.message || 'Preview failed');
        }
    };

    const onImportNumbersFile = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            const hint = detectFileSourceHint(file.name);
            const data = await whatsappBulkApi.parseNumbersFromFile(file, hint);
            const nums = data.numbers || [];
            if (!nums.length) {
                toast.error('No valid numbers found in file');
                return;
            }
            setManualText((prev) => {
                const existing = prev.split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean);
                const merged = [...new Set([...existing, ...nums])];
                return merged.join('\n');
            });
            setForm((f) => ({ ...f, recipientSource: 'manual' }));
            toast.success(`${nums.length} number(s) added from file`);
        } catch (err) {
            toast.error(err.response?.data?.message || 'Import failed');
        } finally {
            e.target.value = '';
        }
    };

    const onUploadImage = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            const data = await whatsappBulkApi.uploadCampaignImage(file);
            setForm((f) => ({
                ...f,
                imageAttachment: data.imageAttachment,
                attachmentPath: data.imageAttachment?.filePath || '',
            }));
            toast.success('Image uploaded');
        } catch (err) {
            toast.error(err.response?.data?.message || 'Image upload failed');
        }
    };

    const onUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            const data = await whatsappBulkApi.uploadRecipientFile(file);
            setForm((f) => ({ ...f, uploadFilePath: data.uploadFilePath }));
            toast.success('File uploaded');
        } catch (err) {
            toast.error(err.response?.data?.message || 'Upload failed');
        }
    };

    const runAction = async (action, id = selectedId) => {
        if (!id) return toast.error('Select or create a campaign first');
        try {
            if (action === 'saveRecipients') {
                await whatsappBulkApi.saveRecipients(id, {
                    filters: {
                        ...form.filters,
                        businessCategory: form.filters.businessCategory || 'All',
                        selectedRecipientKeys,
                    },
                });
            } else {
                await whatsappBulkApi[action](id);
            }
            toast.success('Done');
            await load();
            await loadLiveRecipients(id);
        } catch (err) {
            toast.error(err.response?.data?.message || 'Action failed');
        }
    };

    const onScheduleCampaign = async () => {
        if (!selectedId) return toast.error('Select or create a campaign first');
        const count = preview?.finalSelected ?? selectedRecipientKeys.length;
        if (isMasterSource && !preview) {
            return toast.error('Preview recipients first, then confirm selection before sending');
        }
        const msg = `Send campaign to ${count} selected recipient(s)?\n\n`
            + `Total found: ${preview?.totalFound ?? '—'}\n`
            + `Valid numbers: ${preview?.validNumbers ?? '—'}\n`
            + `Duplicates skipped: ${preview?.duplicateSkipped ?? 0}\n`
            + `Invalid skipped: ${preview?.invalidSkipped ?? 0}\n`
            + `Opt-out skipped: ${preview?.optOutSkipped ?? 0}\n`
            + `Final selected: ${count}`;
        if (!window.confirm(msg)) return;
        try {
            await whatsappBulkApi.saveRecipients(selectedId, {
                filters: {
                    ...form.filters,
                    businessCategory: form.filters.businessCategory || 'All',
                    selectedRecipientKeys,
                },
            });
            await whatsappBulkApi.scheduleCampaign(selectedId);
            toast.success('Campaign scheduled');
            await load();
            await loadLiveRecipients(selectedId);
        } catch (err) {
            toast.error(err.response?.data?.message || 'Schedule failed');
        }
    };

    const onRevokeSent = async () => {
        if (!selectedId) return toast.error('Select a campaign first');
        if (!window.confirm(
            'Pause sending and try to DELETE all sent messages from recipients (WhatsApp "delete for everyone").\n\n'
            + 'Only works for messages sent recently and only for new sends after this update.\n\nContinue?',
        )) return;
        try {
            const data = await whatsappBulkApi.revokeSent(selectedId);
            toast.success(data.message || 'Revoke completed');
            load();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Revoke failed');
        }
    };

    const onTestSend = async () => {
        if (!selectedId) return toast.error('Create campaign first');
        try {
            await whatsappBulkApi.testSend(selectedId, testMobile);
            toast.success('Test message sent');
            await load();
            await loadLiveRecipients(selectedId);
        } catch (err) {
            toast.error(err.response?.data?.message || 'Test send failed');
        }
    };

    const messageLocked = matterOnlyMode && !!form.matterId;
    const isActiveSend = selectedCampaign && ['Sending', 'Pending', 'Scheduled'].includes(selectedCampaign.status);
    const hasSentMessages = selectedCampaign && (selectedCampaign.sentCount || 0) > 0;
    const showActionBar = selectedCampaign && (isActiveSend || hasSentMessages);

    return (
        <div style={page}>
            <h1>WhatsApp Bulk Message Utility</h1>
            <p style={{ color: '#64748b' }}>
                Step 1: Pick or save a <strong>Matter template</strong> (message only). Step 2: Choose recipients and send.
                Uses CRM WhatsApp — connect once under <strong>WhatsApp</strong> in sidebar.
            </p>

            {showActionBar ? (
                <div style={{ ...card, border: '2px solid #f59e0b', background: '#fffbeb' }}>
                    <strong style={{ color: '#b45309' }}>
                        Selected campaign: {selectedCampaign.campaignName} ({selectedCampaign.status})
                    </strong>
                    <p style={{ fontSize: 12, color: '#92400e', margin: '8px 0 12px' }}>
                        Sent {selectedCampaign.sentCount} / {selectedCampaign.totalRecipients}
                        {isActiveSend ? ' — click Pause immediately if sent by mistake.' : ' — use Delete Sent Messages to revoke WhatsApp messages.'}
                    </p>
                    {isActiveSend ? (
                        <>
                            <button type="button" style={btnWarn} onClick={() => runAction('pauseCampaign')}>⏸ Pause Now</button>
                            <button type="button" style={btnDanger} onClick={() => runAction('stopCampaign')}>⏹ Stop Sending</button>
                        </>
                    ) : null}
                    {hasSentMessages ? (
                        <button type="button" style={{ ...btnDanger, background: '#7f1d1d' }} onClick={onRevokeSent}>🗑 Delete Sent Messages</button>
                    ) : null}
                </div>
            ) : null}

            <div style={card}>
                <h3 style={stepTitle}>Step 1 — Message (Matter template)</h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <input style={inp} placeholder="Campaign name" value={form.campaignName} onChange={(e) => setForm({ ...form, campaignName: e.target.value })} />
                    <select style={inp} value={form.matterId || ''} onChange={(e) => applyMatterDefaults(e.target.value || null)}>
                        <option value="">— Pick saved Matter template —</option>
                        {matters.map((m) => <option key={m._id} value={m._id}>{m.matterName}</option>)}
                    </select>
                </div>
                <p style={{ fontSize: 12, color: '#64748b', margin: '10px 0' }}>
                    Save message-only templates in <strong>WhatsApp Matter Master</strong>, or save current text below as a new template.
                </p>
                <button type="button" style={btnSec} onClick={onSaveAsMatter}>💾 Save as Matter Template (message only)</button>

                {!messageLocked ? (
                    <>
                        <select style={{ ...inp, marginTop: 12 }} value={form.sendContentType || 'text_only'} onChange={(e) => setForm({ ...form, sendContentType: e.target.value })}>
                            {Object.entries(SEND_LABELS).map(([k, label]) => (
                                <option key={k} value={k}>{label}</option>
                            ))}
                        </select>
                        {(form.sendContentType === 'text_only' || form.sendContentType === 'image_with_caption' || !form.sendContentType) ? (
                            <textarea style={{ ...inp, marginTop: 12, minHeight: 100 }} placeholder="Message body / caption" value={form.messageBody} onChange={(e) => setForm({ ...form, messageBody: e.target.value })} />
                        ) : null}
                        {form.sendContentType && form.sendContentType !== 'text_only' ? (
                            <div style={{ marginTop: 12 }}>
                                <input type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" onChange={onUploadImage} />
                            </div>
                        ) : null}
                    </>
                ) : (
                    <div style={{ marginTop: 12, padding: 12, background: '#ecfdf5', borderRadius: 8, fontSize: 13 }}>
                        <strong>Using matter:</strong> {matters.find((m) => m._id === form.matterId)?.matterName}
                        <br />
                        {form.messageBody ? <>Message: {form.messageBody.slice(0, 120)}{form.messageBody.length > 120 ? '…' : ''}</> : null}
                        {imagePreviewUrl(form.imageAttachment) ? (
                            <img src={imagePreviewUrl(form.imageAttachment)} alt="" style={{ maxWidth: 80, marginTop: 8, display: 'block' }} />
                        ) : null}
                        <button type="button" style={{ ...btnSec, marginTop: 8 }} onClick={() => applyMatterDefaults(null)}>Clear matter — edit message manually</button>
                    </div>
                )}
            </div>

            <div style={card}>
                <h3 style={stepTitle}>Step 2 — Recipients &amp; send options</h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <select style={inp} value={form.recipientSource} onChange={(e) => setForm({ ...form, recipientSource: e.target.value })}>
                        {(meta?.recipientSources || []).map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <select style={inp} value={form.sendMode} onChange={(e) => setForm({ ...form, sendMode: e.target.value })}>
                        <option value="SAFE">Safe Mode (recommended)</option>
                        <option value="FAST">Fast Mode</option>
                    </select>
                    <select style={inp} value={form.scheduleType} onChange={(e) => setForm({ ...form, scheduleType: e.target.value })}>
                        <option value="now">Send Now</option>
                        <option value="later">Schedule for Later</option>
                        <option value="batch">Batch Schedule</option>
                    </select>
                    <input style={inp} type="datetime-local" value={form.scheduledStartAt} onChange={(e) => setForm({ ...form, scheduledStartAt: e.target.value })} />
                    <input style={inp} type="number" placeholder="Daily limit" value={form.dailyLimit} onChange={(e) => setForm({ ...form, dailyLimit: Number(e.target.value) })} />
                    <input style={inp} type="number" placeholder="Batch size" value={form.batchSize} onChange={(e) => setForm({ ...form, batchSize: Number(e.target.value) })} />
                </div>

                {form.recipientSource === 'manual' ? (
                    <div style={{ marginTop: 12 }}>
                        <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>Phone numbers (comma or new line)</label>
                        <textarea style={{ ...inp, marginTop: 4, minHeight: 80 }} placeholder="919920730373&#10;9323135895" value={manualText} onChange={(e) => setManualText(e.target.value)} />
                        <div style={{ marginTop: 8 }}>
                            <label style={{ ...btnSec, display: 'inline-block', cursor: 'pointer' }}>
                                📁 Import numbers from file (TXT / CSV / Excel)
                                <input type="file" accept=".txt,.csv,.xlsx,.xls" onChange={onImportNumbersFile} style={{ display: 'none' }} />
                            </label>
                        </div>
                    </div>
                ) : null}
                {['excel_upload', 'csv_upload', 'txt_upload'].includes(form.recipientSource) ? (
                    <div style={{ marginTop: 12 }}><input type="file" accept=".txt,.csv,.xlsx,.xls" onChange={onUpload} /></div>
                ) : null}
                {form.recipientSource === 'customer_master' ? (
                    <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                        <label><input type="checkbox" checked={form.filters.activeOnly} onChange={(e) => setForm({ ...form, filters: { ...form.filters, activeOnly: e.target.checked, inactiveOnly: false } })} /> Active customers</label>
                        <label><input type="checkbox" checked={form.filters.inactiveOnly} onChange={(e) => setForm({ ...form, filters: { ...form.filters, inactiveOnly: e.target.checked, activeOnly: false } })} /> Inactive customers</label>
                    </div>
                ) : null}
                {isMasterSource ? (
                    <div style={{ marginTop: 12 }}>
                        <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>
                            Customer Type / Business Category
                        </label>
                        <select
                            style={inp}
                            value={form.filters.businessCategory || 'All'}
                            onChange={(e) => {
                                setPreview(null);
                                setSelectedRecipientKeys([]);
                                setForm({
                                    ...form,
                                    filters: { ...form.filters, businessCategory: e.target.value },
                                });
                            }}
                        >
                            {categoryOptions.map((opt) => (
                                <option key={opt} value={opt}>{opt}</option>
                            ))}
                        </select>
                        <p style={{ fontSize: 11, color: '#94a3b8', margin: '6px 0 0' }}>
                            Choose &quot;All&quot; to include customers/leads without a category. Custom types from Customer Type Master are listed automatically.
                        </p>
                    </div>
                ) : null}
                {form.sendMode === 'FAST' ? (
                    <label style={{ display: 'block', marginTop: 12, color: '#b45309' }}>
                        <input type="checkbox" checked={fastConfirm} onChange={(e) => setFastConfirm(e.target.checked)} />
                        {' '}Fast Mode may increase WhatsApp restriction risk.
                    </label>
                ) : null}
                <div style={{ marginTop: 16 }}>
                    <button type="button" style={btnSec} onClick={onPreview}>Preview Recipients</button>
                    <button type="button" style={btn} onClick={onCreate}>Create Campaign</button>
                </div>
            </div>

            {liveRecipients ? (
                <div style={card}>
                    <strong>Recipient status (live):</strong>{' '}
                    {liveRecipients.sent} sent, {liveRecipients.pending} pending, {liveRecipients.failed} failed — {liveRecipients.total} total
                    <ul style={{ maxHeight: 180, overflow: 'auto', fontSize: 12, marginTop: 8 }}>
                        {liveRecipients.recipients.slice(0, 50).map((r) => (
                            <li key={r._id || r.mobile}>
                                {r.mobile} — <strong>{r.status}</strong>
                                {r.sentAt ? ` (${new Date(r.sentAt).toLocaleString()})` : ''}
                            </li>
                        ))}
                    </ul>
                </div>
            ) : preview ? (
                <div style={card}>
                    <strong>Recipient preview — confirm before send</strong>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginTop: 10, fontSize: 13 }}>
                        <span><strong>Total Found:</strong> {preview.totalFound ?? 0}</span>
                        <span><strong>Valid Numbers:</strong> {preview.validNumbers ?? preview.valid ?? 0}</span>
                        <span><strong>Duplicate Skipped:</strong> {preview.duplicateSkipped ?? 0}</span>
                        <span><strong>Invalid Skipped:</strong> {preview.invalidSkipped ?? 0}</span>
                        <span><strong>Opt-out Skipped:</strong> {preview.optOutSkipped ?? preview.blacklisted ?? 0}</span>
                        <span style={{ color: '#0f766e' }}><strong>Final Selected:</strong> {preview.finalSelected ?? selectedRecipientKeys.length}</span>
                    </div>
                    {isMasterSource && (preview.recipients || []).length > 0 ? (
                        <div style={{ marginTop: 12, overflowX: 'auto', maxHeight: 320, overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: 8 }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                                <thead>
                                    <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
                                        <th style={{ padding: 8 }}>
                                            <input
                                                type="checkbox"
                                                checked={(preview.recipients || []).filter((r) => r.status === 'pending').every((r) => r.selected)}
                                                onChange={(e) => toggleAllRecipients(e.target.checked)}
                                            />
                                        </th>
                                        <th style={{ padding: 8 }}>Name</th>
                                        <th style={{ padding: 8 }}>Mobile</th>
                                        <th style={{ padding: 8 }}>City</th>
                                        <th style={{ padding: 8 }}>State</th>
                                        <th style={{ padding: 8 }}>Category</th>
                                        <th style={{ padding: 8 }}>Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(preview.recipients || []).map((r) => (
                                        <tr key={r.recipientKey || r.mobile} style={{ borderTop: '1px solid #f1f5f9', opacity: r.status === 'blacklisted' ? 0.5 : 1 }}>
                                            <td style={{ padding: 8 }}>
                                                {r.status === 'pending' ? (
                                                    <input
                                                        type="checkbox"
                                                        checked={!!r.selected}
                                                        onChange={(e) => toggleRecipient(r.recipientKey, e.target.checked)}
                                                    />
                                                ) : '—'}
                                            </td>
                                            <td style={{ padding: 8 }}>{r.displayName || '—'}</td>
                                            <td style={{ padding: 8 }}>{r.mobile}</td>
                                            <td style={{ padding: 8 }}>{r.city || '—'}</td>
                                            <td style={{ padding: 8 }}>{r.state || '—'}</td>
                                            <td style={{ padding: 8 }}>{r.category || '—'}</td>
                                            <td style={{ padding: 8 }}>{r.status === 'blacklisted' ? 'Opt-out' : (r.entityStatus || r.status)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <ul style={{ maxHeight: 180, overflow: 'auto', fontSize: 12, marginTop: 8 }}>
                            {(preview.recipients || []).slice(0, 50).map((r) => (
                                <li key={r.mobile}>{r.mobile} — {r.displayName || r.status}</li>
                            ))}
                        </ul>
                    )}
                </div>
            ) : null}

            <div style={card}>
                <h3 style={stepTitle}>Step 3 — Run campaign</h3>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                    <input style={{ ...inp, maxWidth: 180 }} placeholder="Test mobile" value={testMobile} onChange={(e) => setTestMobile(e.target.value)} />
                    <button type="button" style={btnSec} onClick={onTestSend}>Test Send</button>
                    <button type="button" style={btn} onClick={() => runAction('saveRecipients')}>Save Recipients</button>
                    <button type="button" style={btn} onClick={onScheduleCampaign}>Start / Schedule</button>
                    <button type="button" style={btnWarn} onClick={() => runAction('pauseCampaign')}>Pause</button>
                    <button type="button" style={btnSec} onClick={() => runAction('resumeCampaign')}>Resume</button>
                    <button type="button" style={btnDanger} onClick={() => runAction('stopCampaign')}>Stop</button>
                    <button type="button" style={{ ...btnDanger, background: '#7f1d1d' }} onClick={onRevokeSent}>Delete Sent Messages</button>
                    <button type="button" style={btnSec} onClick={() => runAction('retryFailed')}>Retry Failed</button>
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead><tr style={{ textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}><th>Name</th><th>Status</th><th>Sent</th><th>Failed</th><th>Total</th><th></th></tr></thead>
                    <tbody>
                        {campaigns.map((c) => (
                            <tr key={c._id} style={{ borderBottom: '1px solid #f1f5f9', background: selectedId === c._id ? '#ecfdf5' : 'transparent' }}>
                                <td>{c.campaignName}</td>
                                <td>{c.status}</td>
                                <td>{c.sentCount}</td>
                                <td>{c.failedCount}</td>
                                <td>{c.totalRecipients}</td>
                                <td><button type="button" style={btnSec} onClick={() => setSelectedId(c._id)}>Select</button></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
