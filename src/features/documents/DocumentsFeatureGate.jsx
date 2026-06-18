import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useFeatureSettings } from '@/contexts/FeatureSettingsContext';
import { PATHS } from '@/routes/paths';

export const DOCUMENT_ATTACHMENTS_FEATURE = 'purchase.enableDocumentAttachments';

export default function DocumentsFeatureGate({ children }) {
    const navigate = useNavigate();
    const { isFeatureEnabled, loading } = useFeatureSettings();

    if (loading) {
        return <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>Loading…</div>;
    }

    if (!isFeatureEnabled(DOCUMENT_ATTACHMENTS_FEATURE)) {
        return (
            <div style={{ padding: '32px 28px', maxWidth: 560, margin: '0 auto' }}>
                <h1 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8 }}>Document Attachment module is disabled</h1>
                <p style={{ color: '#64748b', fontSize: 14, lineHeight: 1.6 }}>
                    Enable <strong>Attachment &amp; Proof Storage</strong> under Admin → Feature / Compliance Settings → Purchase tab,
                    then save. When disabled, the system works exactly as before.
                </p>
                <div style={{ display: 'flex', gap: 10, marginTop: 20, flexWrap: 'wrap' }}>
                    <button
                        type="button"
                        onClick={() => navigate(PATHS.SETTINGS.FEATURE_COMPLIANCE)}
                        style={{ padding: '10px 18px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer' }}
                    >
                        Open Feature Settings
                    </button>
                    <button
                        type="button"
                        onClick={() => navigate(PATHS.DASHBOARD)}
                        style={{ padding: '10px 18px', background: '#f1f5f9', color: '#374151', border: '1px solid #e2e8f0', borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}
                    >
                        Back to Home
                    </button>
                </div>
            </div>
        );
    }

    return children;
}
