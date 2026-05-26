import React from 'react';
import { X } from 'lucide-react';
import styles from './FilterChips.module.scss';

export function FilterChips({ chips = [], onClearAll, label = 'Active:' }) {
    if (!chips.length) return null;
    return (
        <div className={styles.wrap}>
            <span className={styles.label}>{label}</span>
            {chips.map((chip) => (
                <span key={chip.key} className={styles.chip}>
                    {chip.label}
                    <button
                        type="button"
                        className={styles.removeBtn}
                        onClick={chip.clear}
                        aria-label={`Remove ${chip.key} filter`}
                    >
                        <X size={10} />
                    </button>
                </span>
            ))}
            {onClearAll && (
                <button type="button" className={styles.clearAll} onClick={onClearAll}>
                    Clear all
                </button>
            )}
        </div>
    );
}