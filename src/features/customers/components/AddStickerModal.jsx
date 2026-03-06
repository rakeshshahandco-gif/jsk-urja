import React, { useState } from 'react';
import { createSticker } from '@/services/stickerApi';
import toast from 'react-hot-toast';

export const AddStickerModal = ({ isOpen, onClose, onSave }) => {
    const [submitting, setSubmitting] = useState(false);
    const [data, setData] = useState({
        name: '',
        color: '#64748b', // Default slate-500
        description: '',
    });

    if (!isOpen) return null;

    const handleSave = async (e) => {
        e.preventDefault();
        if (!data.name) return toast.error('Sticker name is required');

        setSubmitting(true);
        try {
            const res = await createSticker(data);
            toast.success('Sticker created!');
            onSave(res);
            onClose();
        } catch (e) {
            toast.error(e.response?.data?.message || 'Failed to create sticker');
        } finally {
            setSubmitting(false);
        }
    };

    const colorPresets = [
        '#64748b', // Slate
        '#ef4444', // Red
        '#f59e0b', // Amber
        '#10b981', // Emerald
        '#3b82f6', // Blue
        '#8b5cf6', // Violet
        '#ec4899', // Pink
        '#000000', // Black
    ];

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, backdropFilter: 'blur(4px)' }}>
            <div style={{ background: '#fff', padding: 24, borderRadius: 12, width: 400, boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
                <h3 style={{ margin: '0 0 20px', fontSize: 16, fontWeight: 700 }}>+ Create New Sticker</h3>
                <div style={{ marginBottom: 16 }}>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 6 }}>STICKER NAME *</label>
                    <input
                        value={data.name}
                        onChange={e => setData(p => ({ ...p, name: e.target.value.toUpperCase() }))}
                        style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 13 }}
                        placeholder="e.g. DEALER, DISTRIBUTOR"
                        autoFocus
                    />
                </div>

                <div style={{ marginBottom: 16 }}>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 6 }}>STICKER COLOR</label>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                        {colorPresets.map(c => (
                            <button
                                key={c}
                                type="button"
                                onClick={() => setData(p => ({ ...p, color: c }))}
                                style={{
                                    width: 24,
                                    height: 24,
                                    borderRadius: '50%',
                                    background: c,
                                    border: data.color === c ? '2px solid #000' : '2px solid transparent',
                                    cursor: 'pointer',
                                    padding: 0
                                }}
                            />
                        ))}
                        <input
                            type="color"
                            value={data.color}
                            onChange={e => setData(p => ({ ...p, color: e.target.value }))}
                            style={{ width: 24, height: 24, padding: 0, border: 'none', background: 'none', cursor: 'pointer' }}
                        />
                    </div>
                </div>

                <div style={{ marginBottom: 20 }}>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 6 }}>DESCRIPTION / NOTES</label>
                    <textarea
                        value={data.description}
                        onChange={e => setData(p => ({ ...p, description: e.target.value }))}
                        style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 13, resize: 'vertical' }}
                        placeholder="Optional notes about this sticker"
                        rows={2}
                    />
                </div>

                <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                    <button type="button" onClick={onClose} style={{ padding: '8px 16px', background: '#f1f5f9', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>Cancel</button>
                    <button type="button" onClick={handleSave} disabled={submitting} style={{ padding: '8px 24px', background: '#0d9488', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>
                        {submitting ? 'Creating...' : 'CREATE & ADD'}
                    </button>
                </div>
            </div>
        </div>
    );
};
