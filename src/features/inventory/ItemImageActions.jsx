import React, { useRef, useState } from 'react';
import toast from 'react-hot-toast';
import {
    uploadItemImage,
    replaceItemImage,
    deleteItemImage,
    getItemImageDownloadUrl,
    isImageFileType,
} from '@/services/itemImageApi';

const btn = {
    padding: '6px 10px',
    fontSize: 12,
    fontWeight: 700,
    borderRadius: 6,
    border: '1px solid #e2e8f0',
    background: '#fff',
    cursor: 'pointer',
    color: '#334155',
};

export function ItemImageActions({
    itemId,
    companyId,
    imageType,
    multiple = false,
    images = [],
    canView = true,
    canUpload = true,
    canDelete = true,
    canDownload = true,
    onRefresh,
}) {
    const fileInputRef = useRef(null);
    const cameraInputRef = useRef(null);
    const replaceInputRef = useRef(null);
    const [busy, setBusy] = useState(false);
    const [replaceId, setReplaceId] = useState(null);

    const rows = images.filter((img) => img.imageType === imageType && !img.isDeleted);

    const appendMeta = (fd, source = 'upload') => {
        fd.append('imageType', imageType);
        fd.append('source', source);
        if (companyId) fd.append('companyId', companyId);
    };

    const handleUpload = async (file, source = 'upload') => {
        if (!itemId) {
            toast.error('Save the item first before uploading images.');
            return;
        }
        if (!file) return;
        setBusy(true);
        try {
            const fd = new FormData();
            fd.append('file', file);
            appendMeta(fd, source);
            if (replaceId) {
                await replaceItemImage(replaceId, fd);
                toast.success('Image replaced');
                setReplaceId(null);
            } else {
                await uploadItemImage(itemId, fd);
                toast.success('Image uploaded');
            }
            onRefresh?.();
        } catch (e) {
            toast.error(e.response?.data?.message || 'Upload failed');
        } finally {
            setBusy(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
            if (cameraInputRef.current) cameraInputRef.current.value = '';
            if (replaceInputRef.current) replaceInputRef.current.value = '';
        }
    };

    const handleDelete = async (imageId) => {
        if (!window.confirm('Delete this image?')) return;
        setBusy(true);
        try {
            await deleteItemImage(imageId, companyId ? { companyId } : {});
            toast.success('Image deleted');
            onRefresh?.();
        } catch (e) {
            toast.error(e.response?.data?.message || 'Delete failed');
        } finally {
            setBusy(false);
        }
    };

    if (!canView) return null;

    return (
        <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 12, marginBottom: 10, background: '#fafbfc' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginBottom: 8 }}>
                {canUpload && (
                    <>
                        <input
                            ref={cameraInputRef}
                            type="file"
                            accept="image/*"
                            capture="environment"
                            style={{ display: 'none' }}
                            onChange={(e) => handleUpload(e.target.files?.[0], 'mobile_scan')}
                        />
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/jpeg,image/png,image/webp,application/pdf"
                            style={{ display: 'none' }}
                            onChange={(e) => handleUpload(e.target.files?.[0], 'upload')}
                        />
                        <input
                            ref={replaceInputRef}
                            type="file"
                            accept="image/jpeg,image/png,image/webp,application/pdf"
                            style={{ display: 'none' }}
                            onChange={(e) => handleUpload(e.target.files?.[0], 'replace')}
                        />
                        <button type="button" style={btn} disabled={busy} onClick={() => cameraInputRef.current?.click()}>
                            Scan from Mobile
                        </button>
                        <button type="button" style={btn} disabled={busy} onClick={() => { setReplaceId(null); fileInputRef.current?.click(); }}>
                            Upload
                        </button>
                    </>
                )}
                {!multiple && rows.length > 0 && canUpload && (
                    <span style={{ fontSize: 11, color: '#64748b' }}>Upload again to replace the current image.</span>
                )}
            </div>

            {rows.length === 0 && (
                <p style={{ margin: 0, fontSize: 12, color: '#94a3b8' }}>No image uploaded yet.</p>
            )}

            {rows.map((img) => {
                const url = getItemImageDownloadUrl(img.thumbnailUrl || img.imageUrl);
                const fullUrl = getItemImageDownloadUrl(img.imageUrl);
                const showPreview = isImageFileType(img.fileType, img.originalName || img.fileName);
                return (
                    <div key={img._id} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '8px 0', borderTop: '1px solid #f1f5f9' }}>
                        {showPreview ? (
                            <a href={fullUrl} target="_blank" rel="noreferrer">
                                <img src={url} alt={img.originalName || img.fileName} style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 6, border: '1px solid #e2e8f0' }} />
                            </a>
                        ) : (
                            <div style={{ width: 72, height: 72, borderRadius: 6, border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#64748b', background: '#fff' }}>PDF</div>
                        )}
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: '#1e293b', wordBreak: 'break-all' }}>
                                {img.originalName || img.fileName}
                            </div>
                            <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                                {img.uploadedAt || img.createdAt ? new Date(img.uploadedAt || img.createdAt).toLocaleString() : ''}
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                                {showPreview && (
                                    <a href={fullUrl} target="_blank" rel="noreferrer" style={{ ...btn, textDecoration: 'none' }}>Preview</a>
                                )}
                                {canDownload && (
                                    <a href={fullUrl} download style={{ ...btn, textDecoration: 'none' }}>Download</a>
                                )}
                                {canUpload && (
                                    <button type="button" style={btn} disabled={busy} onClick={() => { setReplaceId(img._id); replaceInputRef.current?.click(); }}>
                                        Replace
                                    </button>
                                )}
                                {canDelete && (
                                    <button type="button" style={{ ...btn, color: '#b91c1c', borderColor: '#fecaca' }} disabled={busy} onClick={() => handleDelete(img._id)}>
                                        Delete
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
