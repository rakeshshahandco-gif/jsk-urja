import React from 'react';
import clsx from 'clsx';
import {
    LayoutDashboard,
    FileSpreadsheet,
    Landmark,
    FileOutput,
    FileBadge,
    Percent,
    Settings,
    BarChart3,
    AlertTriangle,
    IndianRupee,
} from 'lucide-react';
import styles from '../../TdsCompliancePage.module.scss';

export const TDS_TABS = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'deductions', label: 'Deductions', icon: FileSpreadsheet },
    { id: 'challans', label: 'Challans', icon: Landmark },
    { id: 'returns', label: 'Returns', icon: FileOutput },
    { id: 'form16a', label: 'Form 16A', icon: FileBadge },
    { id: 'master', label: 'Section rates', icon: Percent },
    { id: 'settings', label: 'Settings', icon: Settings },
    { id: 'reports', label: 'Reports', icon: BarChart3 },
];

export function formatInr(n) {
    const x = Number(n);
    if (Number.isNaN(x)) return '—';
    return x.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function TdsPageShell({ fy, tab, onTab, children }) {
    return (
        <div className={styles.page}>
            <header className={styles.hero}>
                <div className={styles.heroInner}>
                    <div className={styles.heroTop}>
                        <div>
                            <h1 className={styles.heroTitle}>
                                <span className={styles.heroIcon} aria-hidden>
                                    <IndianRupee size={20} strokeWidth={2.2} />
                                </span>
                                TDS Compliance
                            </h1>
                            <p className={styles.heroSubtitle}>
                                Deduction register, challan deposits, returns, and Form 16A for the selected company and financial year.
                                Rates and payable ledgers are configured under Section rates.
                            </p>
                        </div>
                        <div className={styles.fyBadge}>
                            <span>
                                <span className={styles.fyBadgeLabel}>Financial year</span>
                                <br />
                                {fy}
                            </span>
                        </div>
                    </div>
                </div>
            </header>

            <nav className={styles.tabsShell} aria-label="TDS sections">
                <div className={styles.tabs} role="tablist">
                    {TDS_TABS.map(({ id, label, icon: Icon }) => (
                        <button
                            key={id}
                            type="button"
                            role="tab"
                            aria-selected={tab === id}
                            className={clsx(styles.tab, tab === id && styles.tabActive)}
                            onClick={() => onTab(id)}
                        >
                            <Icon size={14} strokeWidth={2.2} />
                            {label}
                        </button>
                    ))}
                </div>
            </nav>

            <main className={styles.content}>{children}</main>
        </div>
    );
}

export function TdsStatGrid({ children }) {
    return <div className={styles.statGrid}>{children}</div>;
}

export function TdsStatCard({ label, value, accent = '#1d4ed8' }) {
    return (
        <div className={styles.statCard} style={{ '--tds-accent': accent }}>
            <div className={styles.statLabel}>{label}</div>
            <div className={styles.statValue}>{value}</div>
        </div>
    );
}

export function TdsPanel({ title, children, action, padded }) {
    return (
        <section className={styles.panel}>
            {title && (
                <div className={styles.panelHeader}>
                    <h3 className={styles.panelTitle}>{title}</h3>
                    {action}
                </div>
            )}
            <div className={padded ? styles.panelBodyPadded : styles.panelBody}>{children}</div>
        </section>
    );
}

export function TdsTableWrap({ children }) {
    return (
        <div className={styles.tableWrap}>
            <table className={styles.dataTable}>{children}</table>
        </div>
    );
}

export function TdsSubTabs({ items, active, onChange }) {
    return (
        <div className={styles.subTabs}>
            {items.map(([key, label]) => (
                <button
                    key={key}
                    type="button"
                    className={clsx(styles.subTab, active === key && styles.subTabActive)}
                    onClick={() => onChange(key)}
                >
                    {label}
                </button>
            ))}
        </div>
    );
}

export function TdsAlerts({ alerts }) {
    if (!alerts?.length) {
        return (
            <p className={styles.empty} style={{ padding: '16px 0' }}>
                No alerts for this period.
            </p>
        );
    }
    return (
        <div className={styles.alerts}>
            {alerts.map((text, i) => (
                <div key={i} className={styles.alertItem}>
                    <AlertTriangle size={16} className={styles.alertIcon} />
                    <span>{text}</span>
                </div>
            ))}
        </div>
    );
}

export function TdsEmpty({ children }) {
    return <div className={styles.empty}>{children}</div>;
}

export function TdsField({ label, children, style }) {
    return (
        <label style={style}>
            <span className={styles.fieldLabel}>{label}</span>
            {children}
        </label>
    );
}

export function TdsSelect(props) {
    return <select className={styles.select} {...props} />;
}
