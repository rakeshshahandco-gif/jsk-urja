import React, { useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { voucherAttachmentApi } from '@/services/voucherAttachmentApi';
import { PATHS } from '@/routes/paths';
import DocumentsFeatureGate from '@/features/documents/DocumentsFeatureGate';

function MobileScanContent() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const voucherType = searchParams.get('voucherType') || 'purchase_invoice';
    const voucherId = searchParams.get('voucherId') || '';
    const galleryRef = useRef(null);
    const [preview, setPreview] = useState(null);
    const [previewFile, setPreviewFile] = useState(null);
    const [saving, setSaving] = useState(false);

    const captureFromGallery = (fileList) => {
        const file = fileList?.[0];
        if (!file) return;
        setPreviewFile(file);
        setPreview(URL.createObjectURL(file));
    };

    const onSave = async () => {
        if (!voucherId || !previewFile) {
            toast.error('Capture or select an image first');
            return;
        }
        setSaving(true);
        try {
            await voucherAttachmentApi.upload({
                file: previewFile,
                voucherType,
                voucherId,
                source: 'mobile_scan',
            });
            toast.success('Saved & attached');
            navigate(PATHS.DOCUMENTS.SCAN_BILLS);
        } catch (err) {
            toast.error(err.response?.data?.message || 'Save failed');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div style={{ minHeight: '100vh', background: '#0f172a', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '16px 12px 32px', fontFamily: "'Inter', sans-serif" }}>
            <div style={{ width: '100%', maxWidth: 420, background: '#1e293b', borderRadius: 24, overflow: 'hidden', border: '2px solid #334155' }}>
                <div style={{ padding: '14px 16px', background: '#2563eb', textAlign: 'center' }}>
                    <div style={{ color: '#fff', fontWeight: 800, fontSize: 16 }}>Scan Invoice</div>
                </div>

                {!preview ? (
                    <>
                        <div style={{ height: 360, background: '#0f172a', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <div style={{ width: '78%', height: '62%', border: '2px dashed #60a5fa', borderRadius: 10 }} />
                            <div style={{ position: 'absolute', bottom: 20, color: '#94a3b8', fontSize: 13, textAlign: 'center', padding: '0 24px' }}>
                                Position invoice within frame
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: 10, padding: 16, justifyContent: 'center' }}>
                            <button
                                type="button"
                                onClick={() => galleryRef.current?.click()}
                                style={{ flex: 1, padding: '14px 12px', borderRadius: 10, background: '#2563eb', color: '#fff', border: 'none', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}
                            >
                                Capture
                            </button>
                            <button
                                type="button"
                                onClick={() => galleryRef.current?.click()}
                                style={{ flex: 1, padding: '14px 12px', borderRadius: 10, background: '#334155', color: '#e2e8f0', border: 'none', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}
                            >
                                Gallery
                            </button>
                        </div>
                    </>
                ) : (
                    <>
                        <div style={{ height: 360, background: '#0f172a', padding: 16 }}>
                            <img src={preview} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'contain', borderRadius: 8, background: '#fff' }} />
                        </div>
                        <div style={{ display: 'flex', gap: 10, padding: 16, justifyContent: 'center' }}>
                            <button
                                type="button"
                                onClick={() => { setPreview(null); setPreviewFile(null); }}
                                style={{ flex: 1, padding: '14px 12px', borderRadius: 10, background: '#334155', color: '#e2e8f0', border: 'none', fontWeight: 700, cursor: 'pointer' }}
                            >
                                Retake
                            </button>
                            <button
                                type="button"
                                disabled={saving}
                                onClick={onSave}
                                style={{ flex: 1, padding: '14px 12px', borderRadius: 10, background: '#16a34a', color: '#fff', border: 'none', fontWeight: 700, cursor: 'pointer' }}
                            >
                                {saving ? 'Saving…' : 'Save & Attach'}
                            </button>
                        </div>
                    </>
                )}
            </div>

            <button
                type="button"
                onClick={() => navigate(-1)}
                style={{ marginTop: 20, background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 13 }}
            >
                Cancel
            </button>

            <input ref={galleryRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={(e) => captureFromGallery(e.target.files)} />
        </div>
    );
}

export default function MobileScanPage() {
    return (
        <DocumentsFeatureGate>
            <MobileScanContent />
        </DocumentsFeatureGate>
    );
}
