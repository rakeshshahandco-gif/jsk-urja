import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { emailBulkApi } from '@/services/emailBulkApi';
import ModuleHomeBackLink from '@/features/dashboard/components/ModuleHomeBackLink';
import { PATHS } from '@/routes/paths';

const page = { padding: '24px 28px', fontFamily: "'Inter', sans-serif", background: '#f8f9fa', minHeight: '100vh' };
const card = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 20, marginBottom: 16 };
const inp = { padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: 8, width: '100%', boxSizing: 'border-box', fontSize: 13 };
const btn = { padding: '8px 14px', borderRadius: 8, border: 'none', background: '#0f766e', color: '#fff', fontWeight: 600, cursor: 'pointer', marginRight: 8 };
const btnSec = { ...btn, background: '#475569' };

const defaultForm = {
    campaignName: '',
    recipientSource: 'customer_master',
    subject: '',
    bodyHtml: '',
    sendMode: 'SAFE',
    scheduleType: 'now',
    scheduledStartAt: '',
    timezone: 'Asia/Kolkata',
    sendWindowStart: '09:00',
    sendWindowEnd: '19:00',
    dailyLimit: 200,
    batchSize: 20,
    gapBetweenBatchesMs: 86400000,
    manualEmails: [],
    filters: { activeOnly: false, inactiveOnly: false, customerTypes: [], industryTypes: [], states: [], cities: [] },
    uploadFilePath: '',
};

export default function EmailBulkCampaignsPage() {
    const [meta, setMeta] = useState(null);
    const [templates, setTemplates] = useState([]);
    const [campaigns, setCampaigns] = useState([]);
    const [form, setForm] = useState(defaultForm);
    const [manualText, setManualText] = useState('');
    const [preview, setPreview] = useState(null);
    const [selectedId, setSelectedId] = useState(null);
    const [testEmail, setTestEmail] = useState('');

    const load = async () => {
        try {
            const [m, c, t] = await Promise.all([
                emailBulkApi.getMeta(),
                emailBulkApi.listCampaigns(),
                emailBulkApi.listTemplates(),
            ]);
            setMeta(m);
            setCampaigns(c);
            setTemplates(t.filter((x) => x.isActive !== false));
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to load');
        }
    };

    useEffect(() => { load(); }, []);

    const applyTemplate = (templateId) => {
        if (!templateId) return;
        const t = templates.find((x) => x._id === templateId);
        if (!t) return;
        setForm((f) => ({
            ...f,
            templateId,
            subject: t.subject || f.subject,
            bodyHtml: t.bodyHtml || f.bodyHtml,
            attachments: t.attachments || f.attachments,
        }));
    };

    const buildPayload = () => {
        const manualEmails = manualText.split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean);
        let scheduledStartAt = null;
        if (form.scheduleType !== 'now' && form.scheduledStartAt) {
            scheduledStartAt = new Date(form.scheduledStartAt).toISOString();
        }
        return { ...form, manualEmails, scheduledStartAt };
    };

    const onCreate = async () => {
        try {
            if (form.scheduleType !== 'now' && !form.scheduledStartAt) {
                toast.error('Please select schedule date and time');
                return;
            }
            const doc = await emailBulkApi.createCampaign(buildPayload());
            toast.success('Campaign created');
            setSelectedId(doc._id);
            load();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Create failed');
        }
    };

    const onPreview = async () => {
        try {
            const data = await emailBulkApi.previewRecipients(buildPayload());
            setPreview(data);
        } catch (err) {
            toast.error(err.response?.data?.message || 'Preview failed');
        }
    };

    const onUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            const data = await emailBulkApi.uploadRecipientFile(file);
            setForm((f) => ({ ...f, uploadFilePath: data.uploadFilePath }));
            toast.success('File uploaded');
        } catch (err) {
            toast.error(err.response?.data?.message || 'Upload failed');
        }
    };

    const runAction = async (action, id = selectedId) => {
        if (!id) return toast.error('Select or create a campaign first');
        try {
            await emailBulkApi[action](id);
            toast.success('Done');
            load();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Action failed');
        }
    };

    const onTestSend = async () => {
        if (!selectedId) return toast.error('Create campaign first');
        try {
            await emailBulkApi.testSend(selectedId, testEmail);
            toast.success('Test email sent');
        } catch (err) {
            toast.error(err.response?.data?.message || 'Test send failed');
        }
    };

    return (
        <div style={page}>
            <ModuleHomeBackLink to={PATHS.SETTINGS.COMMUNICATION_HOME} label="Back to Communication Home" />
            <h1>Email Bulk Campaign</h1>
            <p style={{ color: '#64748b' }}>Company-wise email campaigns. Isolated from WhatsApp modules.</p>
            <div style={card}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <input style={inp} placeholder="Campaign name" value={form.campaignName} onChange={(e) => setForm({ ...form, campaignName: e.target.value })} />
                    <select style={inp} value={form.recipientSource} onChange={(e) => setForm({ ...form, recipientSource: e.target.value })}>
                        {(meta?.recipientSources || []).map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <select style={inp} value={form.templateId || ''} onChange={(e) => applyTemplate(e.target.value || null)}>
                        <option value="">No saved template</option>
                        {templates.map((t) => <option key={t._id} value={t._id}>{t.templateName}</option>)}
                    </select>
                    <select style={inp} value={form.scheduleType} onChange={(e) => setForm({ ...form, scheduleType: e.target.value })}>
                        <option value="now">Send Now</option>
                        <option value="later">Schedule for Later</option>
                        <option value="batch">Batch Schedule</option>
                    </select>
                    <input style={inp} placeholder="Subject" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
                    <input style={inp} type="datetime-local" value={form.scheduledStartAt} onChange={(e) => setForm({ ...form, scheduledStartAt: e.target.value })} />
                    <input style={inp} type="number" placeholder="Daily limit" value={form.dailyLimit} onChange={(e) => setForm({ ...form, dailyLimit: Number(e.target.value) })} />
                    <input style={inp} type="number" placeholder="Batch size" value={form.batchSize} onChange={(e) => setForm({ ...form, batchSize: Number(e.target.value) })} />
                </div>
                <textarea style={{ ...inp, marginTop: 12, minHeight: 100 }} placeholder="Email body (HTML allowed)" value={form.bodyHtml} onChange={(e) => setForm({ ...form, bodyHtml: e.target.value })} />
                {form.recipientSource === 'manual' ? (
                    <textarea style={{ ...inp, marginTop: 12, minHeight: 80 }} placeholder="Manual emails (one per line)" value={manualText} onChange={(e) => setManualText(e.target.value)} />
                ) : null}
                {['excel_upload', 'csv_upload', 'txt_upload'].includes(form.recipientSource) ? (
                    <div style={{ marginTop: 12 }}><input type="file" onChange={onUpload} /></div>
                ) : null}
                <div style={{ marginTop: 16 }}>
                    <button type="button" style={btnSec} onClick={onPreview}>Preview Recipients</button>
                    <button type="button" style={btn} onClick={onCreate}>Create Campaign</button>
                </div>
            </div>
            {preview ? (
                <div style={card}>
                    <strong>Preview:</strong> {preview.valid} valid, {preview.blacklisted} blacklisted, {preview.total} total
                    <p style={{ fontSize: 12, color: '#64748b', marginTop: 8 }}>Subject: {form.subject || '(from template)'}</p>
                </div>
            ) : null}
            <div style={card}>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                    <input style={{ ...inp, maxWidth: 220 }} type="email" placeholder="Test email" value={testEmail} onChange={(e) => setTestEmail(e.target.value)} />
                    <button type="button" style={btnSec} onClick={onTestSend}>Test Send</button>
                    <button type="button" style={btn} onClick={() => runAction('saveRecipients')}>Save Recipients</button>
                    <button type="button" style={btn} onClick={() => runAction('scheduleCampaign')}>Start / Schedule</button>
                    <button type="button" style={btnSec} onClick={() => runAction('pauseCampaign')}>Pause</button>
                    <button type="button" style={btnSec} onClick={() => runAction('resumeCampaign')}>Resume</button>
                    <button type="button" style={{ ...btnSec, background: '#b91c1c' }} onClick={() => runAction('stopCampaign')}>Stop</button>
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
