import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useFeatureSettings } from '@/contexts/FeatureSettingsContext';
import { PATHS } from '@/routes/paths';

const RFQ_FEATURE = 'purchase.enableRfqSupplierQuotation';

/**
 * Blocks RFQ UI when company setting is off — shows instructions instead of redirecting to Admin Home.
 */
export default function PurchaseRfqFeatureGate({ children }) {
    const navigate = useNavigate();
    const { isFeatureEnabled, loading } = useFeatureSettings();

    if (loading) {
        return <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>Loading…</div>;
    }

    if (!isFeatureEnabled(RFQ_FEATURE)) {
        return (
            <div style={{ padding: '32px 28px', maxWidth: 560, margin: '0 auto' }}>
                <h1 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8 }}>Purchase RFQ module is disabled</h1>
                <p style={{ color: '#64748b', fontSize: 14, lineHeight: 1.6 }}>
                    Enable <strong>Purchase RFQ / Supplier Quotation</strong> under Admin → Feature / Compliance Settings → Purchase tab,
                    then save. Existing Purchase Orders and GRN are not affected.
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
                        onClick={() => navigate(PATHS.PURCHASE.HOME)}
                        style={{ padding: '10px 18px', background: '#f1f5f9', color: '#374151', border: '1px solid #e2e8f0', borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}
                    >
                        Back to Purchase Home
                    </button>
                </div>
            </div>
        );
    }

    return children;
}
