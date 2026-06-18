import React from 'react';
import { TEXTILE_JOB_WORK_PROCESS_TYPES } from '@/utils/textileJobWorkProcessConfig';

const f = {
    label: { display: 'block', fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 3 },
    input: { width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' },
};

export default function ProcessTypeSelect({ value, onChange, label = 'Process Type' }) {
    return (
        <label>
            <span style={f.label}>{label} *</span>
            <select value={value} onChange={(e) => onChange(e.target.value)} style={f.input} required>
                {TEXTILE_JOB_WORK_PROCESS_TYPES.map((pt) => (
                    <option key={pt} value={pt}>{pt}</option>
                ))}
            </select>
        </label>
    );
}
