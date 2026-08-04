import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { PATHS } from '@/routes/paths';

/** Lightweight back link for nested WhatsApp pages — navigation only. */
export default function WhatsAppHomeBackLink({ label = 'Back to WhatsApp Home' }) {
    const navigate = useNavigate();
    return (
        <button
            type="button"
            onClick={() => navigate(PATHS.SETTINGS.WHATSAPP_HOME)}
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
