import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { whatsappBulkApi } from '@/services/whatsappBulkApi';

const page = { padding: '24px 28px', fontFamily: "'Inter', sans-serif", background: '#f8f9fa', minHeight: '100vh' };
const card = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 20, marginBottom: 16 };
const inp = { padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: 8, width: '100%', boxSizing: 'border-box', fontSize: 13 };
const btn = { padding: '8px 14px', borderRadius: 8, border: 'none', background: '#0f766e', color: '#fff', fontWeight: 600, cursor: 'pointer' };

const SEND_LABELS = {
    text_only: 'Text only',
    image_only: 'Image only',
    image_with_caption: 'Image + caption',
};

const emptyForm = {
    matterName: '',
    category: '',
    industry: '',
    language: 'en',
    messageBody: '',
    sendContentType: 'text_only',
    attachmentType: 'none',
    attachmentPath: '',
    attachmentOriginalName: '',
    imageAttachment: null,
    isActive: true,
};

function imagePreviewUrl(imageAttachment) {
    if (!imageAttachment?.fileUrl) return '';
    const url = imageAttachment.fileUrl;
    if (url.startsWith('http')) return url;
    const base = import.meta.env.VITE_API_URL?.replace(/\/api\/v1\/?$/, '') || '';
    return `${base}${url.startsWith('/') ? url : `/${url}`}`;
}

export default function WhatsappBulkMatterPage() {
    const [rows, setRows] = useState([]);
    const [form, setForm] = useState(emptyForm);
    const [editId, setEditId] = useState(null);

    const load = async () => {
        try {
            setRows(await whatsappBulkApi.listMatters());
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to load matters');
        }
    };

    useEffect(() => { load(); }, []);

    const onSave = async (e) => {
        e.preventDefault();
        try {
            const payload = {
                ...form,
                attachmentType: form.sendContentType === 'text_only' ? 'none' : 'image',
            };
            if (editId) await whatsappBulkApi.updateMatter(editId, payload);
            else await whatsappBulkApi.createMatter(payload);
            toast.success('Matter saved');
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
            const data = await whatsappBulkApi.uploadMatterAttachment(file);
            setForm((f) => ({
                ...f,
                imageAttachment: data.imageAttachment,
                attachmentPath: data.attachmentPath || data.imageAttachment?.filePath || '',
                attachmentOriginalName: data.attachmentOriginalName || file.name,
                attachmentType: 'image',
            }));
            toast.success('Image uploaded');
        } catch (err) {
            toast.error(err.response?.data?.message || 'Upload failed');
        }
    };

    const previewUrl = imagePreviewUrl(form.imageAttachment);
    const needsImage = form.sendContentType !== 'text_only';
    const needsCaption = form.sendContentType === 'image_with_caption' || form.sendContentType === 'text_only';

    return (
        <div style={page}>
            <h1>WhatsApp Matter Master</h1>
            <p style={{ color: '#64748b', marginBottom: 16 }}>
                Save <strong>message templates only</strong> (text / image). No phone numbers here.
                When sending, go to <strong>Bulk Message Utility</strong> → pick this matter → then choose recipients.
            </p>
            <form style={card} onSubmit={onSave}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <input style={inp} placeholder="Matter name" value={form.matterName} onChange={(e) => setForm({ ...form, matterName: e.target.value })} required />
                    <input style={inp} placeholder="Category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
                    <input style={inp} placeholder="Industry" value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })} />
                    <input style={inp} placeholder="Language" value={form.language} onChange={(e) => setForm({ ...form, language: e.target.value })} />
                    <select style={inp} value={form.sendContentType} onChange={(e) => setForm({ ...form, sendContentType: e.target.value })}>
                        {Object.entries(SEND_LABELS).map(([k, label]) => (
                            <option key={k} value={k}>{label}</option>
                        ))}
                    </select>
                </div>
                {needsCaption ? (
                    <textarea
                        style={{ ...inp, marginTop: 12, minHeight: 120 }}
                        placeholder={form.sendContentType === 'text_only' ? 'Message body' : 'Caption / message with image'}
                        value={form.messageBody}
                        onChange={(e) => setForm({ ...form, messageBody: e.target.value })}
                        required={form.sendContentType !== 'image_only'}
                    />
                ) : null}
                {needsImage ? (
                    <div style={{ marginTop: 12, display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                        <div>
                            <input type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" onChange={onUpload} />
                            <p style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>JPG, JPEG, PNG, WEBP — max 20 MB</p>
                        </div>
                        {previewUrl ? (
                            <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 8, maxWidth: 160 }}>
                                <img src={previewUrl} alt="Preview" style={{ maxWidth: 140, maxHeight: 140, objectFit: 'contain', display: 'block' }} />
                                <span style={{ fontSize: 11, color: '#64748b', wordBreak: 'break-all' }}>
                                    {form.imageAttachment?.fileName || form.attachmentOriginalName}
                                </span>
                            </div>
                        ) : form.attachmentPath ? (
                            <span style={{ fontSize: 12, color: '#64748b' }}>{form.attachmentOriginalName || form.attachmentPath}</span>
                        ) : null}
                    </div>
                ) : null}
                <button type="submit" style={{ ...btn, marginTop: 12 }}>{editId ? 'Update Matter Template' : 'Save Matter Template'}</button>
            </form>
            <div style={card}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead><tr style={{ textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}><th>Name</th><th>Send type</th><th>Category</th><th>Usage</th><th>Active</th><th></th></tr></thead>
                    <tbody>
                        {rows.map((r) => (
                            <tr key={r._id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                <td>{r.matterName}</td>
                                <td>{SEND_LABELS[r.sendContentType] || r.sendContentType || 'Text only'}</td>
                                <td>{r.category}</td>
                                <td>{r.usageCount || 0}</td>
                                <td>{r.isActive ? 'Yes' : 'No'}</td>
                                <td><button type="button" style={btn} onClick={() => { setEditId(r._id); setForm({ ...emptyForm, ...r, sendContentType: r.sendContentType || 'text_only' }); }}>Edit</button></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
