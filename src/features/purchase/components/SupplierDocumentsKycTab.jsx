import React, { useCallback, useEffect, useState } from 'react';
import { SUPPLIER_DOCUMENT_TYPES } from '@/config/supplierKyc.config';
import { listSupplierDocuments } from '@/services/supplierDocumentApi';
import { SupplierDocumentActions } from './SupplierDocumentActions';
import { useAuth } from '@/hooks/useAuth';

export function SupplierDocumentsKycTab({ supplierId, companyId, financialYearId, docCtrl }) {
    const { hasPermission } = useAuth();
    const [documents, setDocuments] = useState([]);
    const [loading, setLoading] = useState(false);

    const canView = hasPermission('purchase.supplier_documents.view');
    const canUpload = hasPermission('purchase.supplier_documents.upload');
    const canDelete = hasPermission('purchase.supplier_documents.delete');
    const canDownload = hasPermission('purchase.supplier_documents.download');
    const canScan = hasPermission('purchase.supplier_documents.scan');

    const load = useCallback(async () => {
        if (!supplierId || !canView) return;
        setLoading(true);
        try {
            const list = await listSupplierDocuments(supplierId);
            setDocuments(list);
        } catch {
            setDocuments([]);
        } finally {
            setLoading(false);
        }
    }, [supplierId, canView]);

    useEffect(() => {
        load();
    }, [load]);

    const visibleDocTypes = docCtrl
        ? docCtrl.getVisibleTypes(SUPPLIER_DOCUMENT_TYPES)
        : SUPPLIER_DOCUMENT_TYPES;

    const missingRequired = docCtrl?.missingRequired(documents) || [];

    if (!supplierId) {
        return (
            <p style={{ padding: 16, color: '#64748b', fontSize: 14 }}>
                Save the supplier record first, then upload KYC documents here.
            </p>
        );
    }

    if (!canView) {
        return <p style={{ padding: 16, color: '#b91c1c' }}>You do not have permission to view supplier documents.</p>;
    }

    return (
        <div className="supplier-kyc-documents" style={{ padding: '8px 0' }}>
            <p style={{ fontSize: 13, color: '#64748b', marginBottom: 16 }}>
                Upload PDF or images. Use mobile scan for camera capture. Multiple files allowed per document type.
            </p>
            {missingRequired.length > 0 && (
                <div style={{ marginBottom: 12, padding: 10, background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 8, fontSize: 12, color: '#9a3412' }}>
                    Required documents missing: {missingRequired.map((id) => SUPPLIER_DOCUMENT_TYPES.find((t) => t.id === id)?.label || id).join(', ')}
                </div>
            )}
            {loading && <p style={{ fontSize: 12, color: '#94a3b8' }}>Loading documents…</p>}
            {visibleDocTypes.map(({ id, label }) => (
                <div key={id} style={{ marginBottom: 16 }}>
                    <h4 style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 800, color: '#1e293b' }}>
                        {label}
                        {docCtrl?.isRequired(id) && <span style={{ color: '#b45309', marginLeft: 6, fontSize: 11 }}>(Required)</span>}
                    </h4>
                    <SupplierDocumentActions
                        supplierId={supplierId}
                        documentType={id}
                        documents={documents}
                        canView={canView}
                        canUpload={canUpload}
                        canDelete={canDelete}
                        canDownload={canDownload}
                        canScan={canScan}
                        allowScan={docCtrl ? docCtrl.allowScan(id) : true}
                        allowUpload={docCtrl ? docCtrl.allowUpload(id) : true}
                        allowDownload={docCtrl ? docCtrl.allowDownload(id) : true}
                        trackExpiry={docCtrl ? docCtrl.trackExpiry(id) : undefined}
                        onRefresh={load}
                        companyId={companyId}
                        financialYearId={financialYearId}
                    />
                </div>
            ))}
        </div>
    );
}
