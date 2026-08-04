import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { emailBulkApi } from '@/services/emailBulkApi';
import ModuleHomeBackLink from '@/features/dashboard/components/ModuleHomeBackLink';
import { PATHS } from '@/routes/paths';

const page = { padding: '24px 28px', fontFamily: "'Inter', sans-serif", background: '#f8f9fa', minHeight: '100vh' };
const card = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 20, marginBottom: 16 };
const inp = { padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: 8, width: '100%', boxSizing: 'border-box', fontSize: 13 };
const btn = { padding: '8px 14px', borderRadius: 8, border: 'none', background: '#0f766e', color: '#fff', fontWeight: 600, cursor: 'pointer' };

const emptyForm = {
    templateName: '',
    subject: '',
    bodyHtml: '',
    bodyText: '',
    industryType: '',
    customerType: '',
    language: 'en',
    attachments: [],
    isActive: true,
};

export default function EmailBulkTemplatesPage() {
    const [rows, setRows] = useState([]);
    const [form, setForm] = useState(emptyForm);
    const [editId, setEditId] = useState(null);

    const load = async () => {
        try {
            setRows(await emailBulkApi.listTemplates());
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to load templates');
        }
    };

    useEffect(() => { load(); }, []);

    const onSave = async (e) => {
        e.preventDefault();
        try {
            if (editId) await emailBulkApi.updateTemplate(editId, form);
            else await emailBulkApi.createTemplate(form);
            toast.success('Template saved');
            setForm(emptyForm);
            setEditId(null);
            load();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Save failed');
        }
    };

    const onUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            const data = await emailBulkApi.uploadTemplateAttachment(file);
            setForm((f) => ({ ...f, attachments: [...(f.attachments || []), data.attachment] }));
            toast.success('Attachment uploaded');
        } catch (err) {
            toast.error(err.response?.data?.message || 'Upload failed');
        }
    };

    return (
        <div style={page}>
            <ModuleHomeBackLink to={PATHS.SETTINGS.COMMUNICATION_HOME} label="Back to Communication Home" />
            <h1>Email Template Master</h1>
            <form style={card} onSubmit={onSave}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <input style={inp} placeholder="Template name" value={form.templateName} onChange={(e) => setForm({ ...form, templateName: e.target.value })} required />
                    <input style={inp} placeholder="Subject" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} required />
                    <input style={inp} placeholder="Industry type" value={form.industryType} onChange={(e) => setForm({ ...form, industryType: e.target.value })} />
                    <input style={inp} placeholder="Customer type" value={form.customerType} onChange={(e) => setForm({ ...form, customerType: e.target.value })} />
                </div>
                <textarea style={{ ...inp, marginTop: 12, minHeight: 120 }} placeholder="Email body (HTML allowed)" value={form.bodyHtml} onChange={(e) => setForm({ ...form, bodyHtml: e.target.value })} required />
                <div style={{ marginTop: 12 }}>
                    <input type="file" onChange={onUpload} />
                    {(form.attachments || []).map((a) => <span key={a.attachmentId} style={{ fontSize: 12, color: '#64748b', marginLeft: 8 }}>{a.fileName}</span>)}
                </div>
                <button type="submit" style={{ ...btn, marginTop: 12 }}>{editId ? 'Update Template' : 'Save Template'}</button>
            </form>
            <div style={card}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead><tr style={{ textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}><th>Name</th><th>Subject</th><th>Active</th><th></th></tr></thead>
                    <tbody>
                        {rows.map((r) => (
                            <tr key={r._id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                <td>{r.templateName}</td>
                                <td>{r.subject}</td>
                                <td>{r.isActive ? 'Yes' : 'No'}</td>
                                <td><button type="button" style={btn} onClick={() => { setEditId(r._id); setForm({ ...emptyForm, ...r }); }}>Edit</button></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
