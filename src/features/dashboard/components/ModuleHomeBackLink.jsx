import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';

/** Lightweight back link for nested Module Home pages — navigation only. */
export default function ModuleHomeBackLink({ to, label = 'Back to Module Home' }) {
    const navigate = useNavigate();
    if (!to) return null;
    return (
        <button
            type="button"
            onClick={() => navigate(to)}
            style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                marginBottom: 12,
                padding: '6px 10px',
                border: '1px solid #e2e8f0',
                borderRadius: 8,
                background: '#fff',
                color: '#334155',
                fontSize: 12,
                fontWeight: 650,
                cursor: 'pointer',
            }}
        >
            <ChevronLeft size={14} strokeWidth={2.4} />
            {label}
        </button>
    );
}
