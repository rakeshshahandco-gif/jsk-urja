import React, { useState } from 'react';
import { createCustomerTypeMaster } from '@/services/sundryDebtorSettingsApi';
import toast from 'react-hot-toast';

export const AddCustomerTypeModal = ({ isOpen, onClose, onSave }) => {
    const [submitting, setSubmitting] = useState(false);
    const [name, setName] = useState('');

    if (!isOpen) return null;

    const handleSave = async (e) => {
        e.preventDefault();
        const trimmed = name.trim();
        if (!trimmed) return toast.error('Customer type name is required');

        setSubmitting(true);
        try {
            const res = await createCustomerTypeMaster(trimmed);
            toast.success('Customer type added');
            onSave(res);
            setName('');
            onClose();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to add customer type');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, backdropFilter: 'blur(4px)' }}>
            <div style={{ background: '#fff', padding: 24, borderRadius: 12, width: 400, boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
                <h3 style={{ margin: '0 0 20px', fontSize: 16, fontWeight: 700 }}>+ Add Customer Type</h3>
                <div style={{ marginBottom: 16 }}>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 6 }}>TYPE NAME *</label>
                    <input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 13 }}
                        placeholder="e.g. Retailer, Distributor"
                        autoFocus
                    />
                </div>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <button type="button" onClick={onClose} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer' }}>
                        Cancel
                    </button>
                    <button type="button" onClick={handleSave} disabled={submitting} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#2563eb', color: '#fff', fontWeight: 600, cursor: 'pointer' }}>
                        {submitting ? 'Saving…' : 'Add'}
                    </button>
                </div>
            </div>
        </div>
    );
};
