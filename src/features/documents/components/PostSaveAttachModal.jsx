import React, { useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { PATHS } from '@/routes/paths';

export default function PostSaveAttachModal({ open, voucherType, voucherId, onSkip }) {
    const navigate = useNavigate();
    const fileRef = useRef(null);

    if (!open || !voucherId) return null;

    const overlay = {
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2000,
        padding: 16,
    };

    const modal = {
        background: '#fff',
        borderRadius: 14,
        padding: '24px 28px',
        maxWidth: 440,
        width: '100%',
        boxShadow: '0 20px 40px rgba(0,0,0,0.15)',
    };

    return (
        <div style={overlay}>
            <div style={modal}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#16a34a', marginBottom: 6 }}>Saved</div>
                <h2 style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 800 }}>Invoice Saved Successfully</h2>
                <p style={{ margin: '0 0 20px', color: '#64748b', fontSize: 14 }}>Do you want to attach supplier bill?</p>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <button
                        type="button"
                        onClick={() => navigate(`${PATHS.DOCUMENTS.MOBILE_SCAN}?voucherType=${voucherType}&voucherId=${voucherId}`)}
                        style={{ padding: '10px 16px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer' }}
                    >
                        Scan Now
                    </button>
                    <button
                        type="button"
                        onClick={() => fileRef.current?.click()}
                        style={{ padding: '10px 16px', background: '#f1f5f9', color: '#1e293b', border: '1px solid #e2e8f0', borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}
                    >
                        Upload
                    </button>
                    <button
                        type="button"
                        onClick={onSkip}
                        style={{ padding: '10px 16px', background: 'transparent', color: '#64748b', border: 'none', fontWeight: 600, cursor: 'pointer' }}
                    >
                        Skip
                    </button>
                </div>
                <input
                    ref={fileRef}
                    type="file"
                    accept="application/pdf,image/*"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        navigate(`${PATHS.DOCUMENTS.SCAN_BILLS}?voucherType=${voucherType}&voucherId=${voucherId}&upload=1`, {
                            state: { pendingFile: file },
                        });
                    }}
                />
            </div>
        </div>
    );
}
