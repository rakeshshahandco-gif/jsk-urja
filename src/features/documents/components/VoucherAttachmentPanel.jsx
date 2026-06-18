import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { voucherAttachmentApi } from '@/services/voucherAttachmentApi';
import { useFeatureSettings } from '@/contexts/FeatureSettingsContext';
import { DOCUMENT_ATTACHMENTS_FEATURE } from '@/features/documents/DocumentsFeatureGate';
import { PATHS } from '@/routes/paths';
import { env } from '@/config/env';

const resolveFileUrl = (url) => {
    if (!url) return '#';
    if (url.startsWith('http')) return url;
    const base = env.SOCKET_URL || String(env.API_URL).replace(/\/api\/v1\/?$/, '');
    return `${base}${url.startsWith('/') ? url : `/${url}`}`;
};

const card = {
    background: '#ffffff',
    border: '1px solid #e2e8f0',
    borderRadius: 14,
    padding: 20,
    boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
};

const actionBtn = (primary) => ({
    flex: 1,
    minWidth: 140,
    padding: '14px 12px',
    borderRadius: 10,
    border: primary ? '1px solid #2563eb' : '1px solid #e2e8f0',
    background: primary ? '#eff6ff' : '#fff',
    color: primary ? '#2563eb' : '#1e293b',
    fontWeight: 700,
    fontSize: 13,
    cursor: 'pointer',
    textAlign: 'center',
});

function fmtSize(bytes) {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function VoucherAttachmentPanel({
    voucherType = 'purchase_invoice',
    voucherId,
    title = 'Attachments',
    compact = false,
}) {
    const navigate = useNavigate();
    const fileRef = useRef(null);
    const imageRef = useRef(null);
    const { isFeatureEnabled } = useFeatureSettings();
    const enabled = isFeatureEnabled(DOCUMENT_ATTACHMENTS_FEATURE);
    const mobileScanEnabled = isFeatureEnabled('purchase.enableMobileScanBills');

    const [files, setFiles] = useState([]);
    const [loading, setLoading] = useState(false);
    const [uploading, setUploading] = useState(false);

    const load = useCallback(async () => {
        if (!enabled || !voucherId) return;
        setLoading(true);
        try {
            const rows = await voucherAttachmentApi.listByVoucher(voucherType, voucherId);
            setFiles(Array.isArray(rows) ? rows : []);
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to load attachments');
        } finally {
            setLoading(false);
        }
    }, [enabled, voucherId, voucherType]);

    useEffect(() => {
        load();
    }, [load]);

    if (!enabled) return null;

    if (!voucherId) {
        return (
            <div style={{ ...card, marginTop: compact ? 0 : 16 }}>
                <h3 style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>{title}</h3>
                <p style={{ margin: 0, color: '#64748b', fontSize: 13 }}>Save the voucher first, then attach supplier bill PDF or images.</p>
            </div>
        );
    }

    const doUpload = async (fileList, source = 'upload') => {
        const file = fileList?.[0];
        if (!file) return;
        setUploading(true);
        try {
            await voucherAttachmentApi.upload({ file, voucherType, voucherId, source });
            toast.success('File attached');
            await load();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Upload failed');
        } finally {
            setUploading(false);
            if (fileRef.current) fileRef.current.value = '';
            if (imageRef.current) imageRef.current.value = '';
        }
    };

    const onRemove = async (id) => {
        if (!window.confirm('Remove this attachment?')) return;
        try {
            await voucherAttachmentApi.remove(id);
            toast.success('Attachment removed');
            load();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Remove failed');
        }
    };

    const openMobileScan = () => {
        navigate(`${PATHS.DOCUMENTS.MOBILE_SCAN}?voucherType=${voucherType}&voucherId=${voucherId}`);
    };

    return (
        <div style={{ ...card, marginTop: compact ? 0 : 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
                <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>{title}</h3>
                {loading && <span style={{ fontSize: 12, color: '#94a3b8' }}>Loading…</span>}
            </div>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
                {mobileScanEnabled && (
                    <button type="button" style={actionBtn(true)} onClick={openMobileScan} disabled={uploading}>
                        Scan from Mobile
                    </button>
                )}
                <button
                    type="button"
                    style={actionBtn(false)}
                    disabled={uploading}
                    onClick={() => fileRef.current?.click()}
                >
                    Upload PDF
                </button>
                <button
                    type="button"
                    style={actionBtn(false)}
                    disabled={uploading}
                    onClick={() => imageRef.current?.click()}
                >
                    Upload Image
                </button>
            </div>

            <input ref={fileRef} type="file" accept="application/pdf,.pdf" style={{ display: 'none' }} onChange={(e) => doUpload(e.target.files, 'upload')} />
            <input ref={imageRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => doUpload(e.target.files, 'upload')} />

            {files.length === 0 ? (
                <p style={{ margin: 0, color: '#94a3b8', fontSize: 13 }}>No files attached yet.</p>
            ) : (
                <div style={{ display: 'grid', gap: 8 }}>
                    {files.map((f) => (
                        <div
                            key={f._id}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 12,
                                padding: '10px 12px',
                                borderRadius: 10,
                                border: '1px solid #e2e8f0',
                                background: '#f8fafc',
                            }}
                        >
                            <div style={{ width: 40, height: 40, borderRadius: 8, background: '#dbeafe', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700 }}>
                                {(f.mimeType || '').includes('pdf') ? 'PDF' : 'IMG'}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {f.originalName || f.fileName}
                                </div>
                                <div style={{ fontSize: 11, color: '#64748b' }}>{fmtSize(f.fileSize)}</div>
                            </div>
                            <a href={resolveFileUrl(f.fileUrl)} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: '#2563eb', fontWeight: 600, textDecoration: 'none' }}>
                                View
                            </a>
                            <button type="button" onClick={() => onRemove(f._id)} style={{ background: 'none', border: 'none', color: '#dc2626', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>
                                Remove
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
