import React, { useCallback, useEffect, useState } from 'react';
import { CUSTOMER_DOCUMENT_TYPES } from '@/config/customerKyc.config';
import { listCustomerDocuments } from '@/services/customerDocumentApi';
import { CustomerDocumentActions } from './CustomerDocumentActions';
import { useAuth } from '@/hooks/useAuth';

export function CustomerDocumentsKycTab({ customerId, companyId, financialYearId, fieldCtrl, docCtrl }) {
    const { hasPermission } = useAuth();
    const [documents, setDocuments] = useState([]);
    const [loading, setLoading] = useState(false);

    const canView = hasPermission('customers.customer_documents.view');
    const canUpload = hasPermission('customers.customer_documents.upload');
    const canDelete = hasPermission('customers.customer_documents.delete');
    const canDownload = hasPermission('customers.customer_documents.download');
    const canScan = hasPermission('customers.customer_documents.scan');

    const load = useCallback(async () => {
        if (!customerId || !canView) return;
        setLoading(true);
        try {
            const list = await listCustomerDocuments(customerId);
            setDocuments(list);
        } catch {
            setDocuments([]);
        } finally {
            setLoading(false);
        }
    }, [customerId, canView]);

    useEffect(() => {
        load();
    }, [load]);

    const visibleDocTypes = docCtrl
        ? docCtrl.getVisibleTypes(CUSTOMER_DOCUMENT_TYPES)
        : CUSTOMER_DOCUMENT_TYPES.filter(({ id }) => {
            if (!fieldCtrl) return true;
            return true;
        });

    const missingRequired = docCtrl?.missingRequired(documents) || [];

    if (!customerId) {
        return (
            <p style={{ padding: 16, color: '#64748b', fontSize: 14 }}>
                Save the customer record first, then upload KYC documents here.
            </p>
        );
    }

    if (!canView) {
        return <p style={{ padding: 16, color: '#b91c1c' }}>You do not have permission to view customer documents.</p>;
    }

    return (
        <div className="customer-kyc-documents" style={{ padding: '8px 0' }}>
            <p style={{ fontSize: 13, color: '#64748b', marginBottom: 16 }}>
                Upload PDF or images. Use mobile scan for camera capture. Multiple files allowed per document type.
            </p>
            {missingRequired.length > 0 && (
                <div style={{ marginBottom: 12, padding: 10, background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 8, fontSize: 12, color: '#9a3412' }}>
                    Required documents missing: {missingRequired.map((id) => CUSTOMER_DOCUMENT_TYPES.find((t) => t.id === id)?.label || id).join(', ')}
                </div>
            )}
            {loading && <p style={{ fontSize: 12, color: '#94a3b8' }}>Loading documents…</p>}
            {visibleDocTypes.map(({ id, label }) => (
                <div key={id} style={{ marginBottom: 16 }}>
                    <h4 style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 800, color: '#1e293b' }}>
                        {label}
                        {docCtrl?.isRequired(id) && <span style={{ color: '#b45309', marginLeft: 6, fontSize: 11 }}>(Required)</span>}
                    </h4>
                    <CustomerDocumentActions
                        customerId={customerId}
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
