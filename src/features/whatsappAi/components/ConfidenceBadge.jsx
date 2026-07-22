import React from 'react';
import { confidenceTone } from '../constants';

export { confidenceTone } from '../constants';

/**
 * Confidence display foundation (Phase 1A - no AI decisions yet).
 * Green 80-100, Yellow 60-79, Red below 60.
 */
export default function ConfidenceBadge({ value, label = 'Confidence' }) {
    if (value == null || Number.isNaN(Number(value))) {
        return (
            <span style={badgeStyle('#94a3b8', '#f1f5f9')}>
                {label}: —
            </span>
        );
    }
    const n = Number(value);
    const tone = confidenceTone(n);
    let bg = '#fee2e2';
    let fg = '#b91c1c';
    if (tone === 'green') {
        bg = '#dcfce7';
        fg = '#15803d';
    } else if (tone === 'yellow') {
        bg = '#fef9c3';
        fg = '#a16207';
    }
    return (
        <span style={badgeStyle(fg, bg)} title={`${label}: ${n}%`}>
            {label}: {Math.round(n)}%
        </span>
    );
}

function badgeStyle(color, background) {
    return {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 10px',
        borderRadius: 8,
        fontSize: 12,
        fontWeight: 700,
        color,
        background,
        border: `1px solid ${color}33`,
    };
}
