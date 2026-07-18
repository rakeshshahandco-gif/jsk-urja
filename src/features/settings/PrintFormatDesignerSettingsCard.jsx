import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PATHS } from '@/routes/paths';
import { getPrintDesignerSettings, updatePrintDesignerSettings } from '@/services/printFormatApi';
import toast from 'react-hot-toast';

export default function PrintFormatDesignerSettingsCard() {
    const navigate = useNavigate();
    const [enabled, setEnabled] = useState(false);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        getPrintDesignerSettings()
            .then((s) => setEnabled(!!s?.enableCustomPrintDesigner))
            .catch(() => setEnabled(false))
            .finally(() => setLoading(false));
    }, []);

    const save = async (nextEnabled) => {
        setSaving(true);
        try {
            const data = await updatePrintDesignerSettings({ enableCustomPrintDesigner: nextEnabled });
            setEnabled(!!data?.enableCustomPrintDesigner);
            toast.success(
                data?.enableCustomPrintDesigner
                    ? 'Custom Print Format Designer enabled'
                    : 'Custom Print Format Designer disabled — live print uses built-in formats',
            );
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Save failed');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div style={{ marginTop: 28, padding: 20, background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0' }}>
            <h2 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 800 }}>Print Format Designer</h2>
            <p style={{ margin: '0 0 16px', fontSize: 13, color: '#64748b', lineHeight: 1.45 }}>
                When disabled (default), Sales Invoice and Sales Order print/PDF always use the locked built-in formats.
                Custom layouts apply only when enabled and a format is Approved + Active Default.
            </p>
            {loading ? (
                <div style={{ fontSize: 13, color: '#94a3b8' }}>Loading…</div>
            ) : (
                <>
                    <label style={{ fontSize: 12, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 8, textTransform: 'uppercase' }}>
                        Enable Custom Print Format Designer
                    </label>
                    <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer' }}>
                            <input
                                type="radio"
                                name="printDesignerEnabled"
                                checked={!enabled}
                                disabled={saving}
                                onChange={() => save(false)}
                            />
                            Disabled
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer' }}>
                            <input
                                type="radio"
                                name="printDesignerEnabled"
                                checked={enabled}
                                disabled={saving}
                                onChange={() => save(true)}
                            />
                            Enabled
                        </label>
                    </div>
                    <div style={{
                        padding: '10px 12px',
                        borderRadius: 8,
                        fontSize: 13,
                        background: enabled ? '#ecfdf5' : '#fef2f2',
                        border: `1px solid ${enabled ? '#6ee7b7' : '#fecaca'}`,
                        color: enabled ? '#065f46' : '#991b1b',
                    }}>
                        {enabled
                            ? 'Enabled: Approved + Active Default custom formats can override built-in print/PDF. Draft formats never affect live print.'
                            : 'Disabled: All custom designer layouts are ignored. Live print/PDF uses locked built-in Sales Invoice and Sales Order formats only.'}
                    </div>
                    <button
                        type="button"
                        onClick={() => navigate(PATHS.SETTINGS.PRINT_FORMAT_DESIGNER)}
                        style={{
                            marginTop: 14,
                            padding: '8px 14px',
                            background: '#f1f5f9',
                            color: '#334155',
                            border: '1px solid #e2e8f0',
                            borderRadius: 8,
                            fontWeight: 700,
                            fontSize: 13,
                            cursor: 'pointer',
                        }}
                    >
                        Open Print Format Designer
                    </button>
                </>
            )}
        </div>
    );
}
