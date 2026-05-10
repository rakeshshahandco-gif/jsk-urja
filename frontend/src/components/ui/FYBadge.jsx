/**
 * FYBadge — shows the currently selected financial year.
 * Used only in ACCOUNTING pages (Sales Register, Purchase Register,
 * Ledger, Day Book, Vouchers, etc.).
 *
 * NOT used in Customers, Tasks, Follow-ups or any CRM module.
 */
import React from 'react';
import { useFinancialYear } from '@/contexts/FinancialYearContext';
import { Calendar } from 'lucide-react';

const FYBadge = () => {
    const { selectedFY, selectedFYObject } = useFinancialYear();

    if (!selectedFY) return null;

    const isCurrent = selectedFYObject?.isCurrent;

    return (
        <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            background: isCurrent
                ? 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)'
                : 'linear-gradient(135deg, #fffbeb 0%, #fef9c3 100%)',
            border: `1.5px solid ${isCurrent ? '#bbf7d0' : '#fde68a'}`,
            borderRadius: '8px',
            padding: '4px 12px',
            fontSize: '11px',
            fontWeight: 700,
            color: isCurrent ? '#166534' : '#92400e',
            letterSpacing: '0.04em',
            whiteSpace: 'nowrap',
        }}
            title="This report is filtered by the selected Financial Year. Switch F.Y. in the header to view another year."
        >
            <Calendar size={12} style={{ color: isCurrent ? '#16a34a' : '#d97706' }} />
            FY {selectedFY}
            {isCurrent && (
                <span style={{
                    background: '#16a34a',
                    color: '#fff',
                    fontSize: '9px',
                    fontWeight: 800,
                    padding: '1px 5px',
                    borderRadius: '4px',
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                }}>
                    Active
                </span>
            )}
        </div>
    );
};

export default FYBadge;
