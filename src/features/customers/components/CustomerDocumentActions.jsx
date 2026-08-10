import React, { useRef, useState } from 'react';
import toast from 'react-hot-toast';
import {
    uploadCustomerDocument,
    replaceCustomerDocument,
    deleteCustomerDocument,
    getCustomerDocumentDownloadUrl,
} from '@/services/customerDocumentApi';
import { EXPIRY_DOCUMENT_TYPES } from '@/config/customerKyc.config';

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

export function CustomerDocumentActions({
    customerId,
    documentType,
    documents = [],
    canView = true,
    canUpload = true,
    canDelete = true,
    canScan = true,
    canDownload = true,
    allowScan = true,
    allowUpload = true,
    allowDownload = true,
    trackExpiry,
    onRefresh,
    companyId,
    financialYearId,
}) {
    const pdfInputRef = useRef(null);
    const imageInputRef = useRef(null);
    const cameraInputRef = useRef(null);
    const replaceInputRef = useRef(null);
    const [busy, setBusy] = useState(false);
    const [expiryDate, setExpiryDate] = useState('');
    const [reminderDays, setReminderDays] = useState('');
    const [replaceId, setReplaceId] = useState(null);

    const showExpiry = trackExpiry !== undefined ? trackExpiry : EXPIRY_DOCUMENT_TYPES.has(documentType);
    const effectiveCanScan = canScan && allowScan !== false;
    const effectiveCanUpload = canUpload && allowUpload !== false;
    const effectiveCanDownload = canDownload && allowDownload !== false;
    const latest = documents.filter((d) => d.documentType === documentType && !d.isDeleted);

    const appendMeta = (fd) => {
        // Exact backend enum value (e.g. pan_card) — must be present on multipart body
        fd.append('documentType', String(documentType || '').trim());
        if (companyId) fd.append('companyId', companyId);
        if (financialYearId) fd.append('financialYearId', financialYearId);
        if (showExpiry && expiryDate) fd.append('expiryDate', expiryDate);
        if (showExpiry && reminderDays !== '') fd.append('reminderDays', reminderDays);
    };

    const resolveDocUrl = (doc) => {
        if (doc?.signedUrl) return doc.signedUrl;
        return getCustomerDocumentDownloadUrl(doc?.fileUrl);
    };

    const handleUpload = async (file, source = 'upload') => {
        if (!customerId) {
            toast.error('Save the customer first before uploading documents.');
            return;
        }
        if (!file) return;
        if (!documentType) {
            toast.error('Document type is missing. Please refresh and try again.');
            return;
        }
        setBusy(true);
        try {
            const fd = new FormData();
            fd.append('file', file);
            fd.append('source', source);
            appendMeta(fd);
            // Guarantees documentType is on the outbound FormData before request leaves browser
            if (!fd.get('documentType')) {
                throw new Error('documentType was not attached to the upload request');
            }
            if (replaceId) {
                await replaceCustomerDocument(replaceId, fd);
                toast.success('Document replaced');
                setReplaceId(null);
            } else {
                await uploadCustomerDocument(customerId, fd);
                toast.success('Document uploaded');
            }
            onRefresh?.();
        } catch (e) {
            const msg = e.response?.data?.message || e.message || 'Upload failed';
            toast.error(String(msg).replace(/^DEBUG:\s*/i, ''));
        } finally {
            setBusy(false);
            if (pdfInputRef.current) pdfInputRef.current.value = '';
            if (imageInputRef.current) imageInputRef.current.value = '';
            if (cameraInputRef.current) cameraInputRef.current.value = '';
            if (replaceInputRef.current) replaceInputRef.current.value = '';
        }
    };

    const handleDelete = async (docId) => {
        if (!window.confirm('Delete this document?')) return;
        setBusy(true);
        try {
            await deleteCustomerDocument(docId);
            toast.success('Document deleted');
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
                {effectiveCanScan && (
                    <>
                        <input
                            ref={cameraInputRef}
                            type="file"
                            accept="image/*"
                            capture="environment"
                            style={{ display: 'none' }}
                            onChange={(e) => handleUpload(e.target.files?.[0], 'mobile_scan')}
                        />
                        <button type="button" style={btn} disabled={busy || !effectiveCanUpload} onClick={() => cameraInputRef.current?.click()}>
                            Scan from Mobile
                        </button>
                    </>
                )}
                {effectiveCanUpload && (
                    <>
                        <input ref={pdfInputRef} type="file" accept=".pdf,application/pdf" multiple style={{ display: 'none' }} onChange={(e) => {
                            const files = [...(e.target.files || [])];
                            files.forEach((f) => handleUpload(f, 'upload'));
                        }} />
                        <input ref={imageInputRef} type="file" accept="image/jpeg,image/png,image/jpg" multiple style={{ display: 'none' }} onChange={(e) => {
                            const files = [...(e.target.files || [])];
                            files.forEach((f) => handleUpload(f, 'upload'));
                        }} />
                        <button type="button" style={btn} disabled={busy} onClick={() => pdfInputRef.current?.click()}>Upload PDF</button>
                        <button type="button" style={btn} disabled={busy} onClick={() => imageInputRef.current?.click()}>Upload Image</button>
                        <input ref={replaceInputRef} type="file" accept=".pdf,image/jpeg,image/png,image/jpg" style={{ display: 'none' }} onChange={(e) => handleUpload(e.target.files?.[0], 'replace')} />
                    </>
                )}
            </div>

            {showExpiry && effectiveCanUpload && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8, fontSize: 12 }}>
                    <label>
                        Expiry{' '}
                        <input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} style={{ marginLeft: 4 }} />
                    </label>
                    <label>
                        Remind (days before){' '}
                        <input type="number" min="0" value={reminderDays} onChange={(e) => setReminderDays(e.target.value)} style={{ width: 64, marginLeft: 4 }} />
                    </label>
                </div>
            )}

            {latest.length === 0 ? (
                <p style={{ margin: 0, fontSize: 12, color: '#94a3b8' }}>No file uploaded yet.</p>
            ) : (
                <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                    {latest.map((doc) => (
                        <li key={doc._id} style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', padding: '6px 0', borderTop: '1px solid #f1f5f9' }}>
                            <span style={{ fontSize: 12, fontWeight: 600, flex: 1 }}>{doc.originalName || doc.fileName}</span>
                            {doc.expiryDate && (
                                <span style={{ fontSize: 11, color: '#b45309' }}>Exp: {new Date(doc.expiryDate).toLocaleDateString()}</span>
                            )}
                            <button type="button" style={btn} onClick={() => window.open(resolveDocUrl(doc), '_blank')}>View</button>
                            {effectiveCanDownload && (
                                <a href={resolveDocUrl(doc)} download style={{ ...btn, textDecoration: 'none' }}>Download</a>
                            )}
                            {effectiveCanUpload && (
                                <button type="button" style={btn} disabled={busy} onClick={() => { setReplaceId(doc._id); replaceInputRef.current?.click(); }}>Replace</button>
                            )}
                            {canDelete && (
                                <button type="button" style={{ ...btn, color: '#b91c1c', borderColor: '#fecaca' }} disabled={busy} onClick={() => handleDelete(doc._id)}>Delete</button>
                            )}
                        </li>
                    ))}
                </ul>
            )}
            <p style={{ margin: '8px 0 0', fontSize: 10, color: '#94a3b8' }}>OCR auto-fill coming soon — upload and verify manually for now.</p>
        </div>
    );
}
