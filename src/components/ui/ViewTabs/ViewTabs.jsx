import React from 'react';
import clsx from 'clsx';
import styles from './ViewTabs.module.scss';

export function ViewTabs({ value, onChange, items, variant = 'default', className = '' }) {
    return (
        <div className={clsx(styles.track, className)} role="tablist">
            {items.map((item) => {
                const active = value === item.id;
                const useAccent = variant === 'accent' && active;
                return (
                    <button
                        key={item.id}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        className={clsx(styles.tab, active && (useAccent ? styles.activeAccent : styles.active))}
                        onClick={() => onChange(item.id)}
                    >
                        {item.icon && <item.icon size={14} aria-hidden />}
                        {item.label}
                        {item.badge != null && <span className={styles.badge}>{item.badge}</span>}
                    </button>
                );
            })}
        </div>
    );
}