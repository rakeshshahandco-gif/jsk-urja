import React from 'react';
import { Star, Calendar, ChevronRight, Settings2 } from 'lucide-react';
import styles from './HighlightedGroupsStrip.module.scss';
import clsx from 'clsx';

const STYLE_MAP = {
    blue: { accent: '#2563eb', soft: '#eff6ff', iconBg: '#dbeafe' },
    teal: { accent: '#0d9488', soft: '#f0fdfa', iconBg: '#ccfbf1' },
    indigo: { accent: '#4f46e5', soft: '#eef2ff', iconBg: '#e0e7ff' },
    amber: { accent: '#d97706', soft: '#fffbeb', iconBg: '#fef3c7' },
    rose: { accent: '#e11d48', soft: '#fff1f2', iconBg: '#ffe4e6' },
    violet: { accent: '#7c3aed', soft: '#f5f3ff', iconBg: '#ede9fe' },
    emerald: { accent: '#059669', soft: '#ecfdf5', iconBg: '#d1fae5' },
    slate: { accent: '#475569', soft: '#f8fafc', iconBg: '#e2e8f0' },
};

function recurrenceLabel(type) {
    if (!type || type === 'NONE') return 'Ad-hoc';
    return String(type).charAt(0) + String(type).slice(1).toLowerCase();
}

export function HighlightedGroupsStrip({
    groups = [],
    selectedGroupId,
    onSelect,
    onManage,
    canManage = false,
    loading = false,
}) {
    if (!loading && (!groups || groups.length === 0)) return null;

    return (
        <section className={styles.section} aria-label="Highlighted Groups">
            <div className={styles.header}>
                <div>
                    <h2 className={styles.title}>Highlighted Groups</h2>
                    <p className={styles.subtitle}>Important recurring groups pinned for quick access.</p>
                </div>
                {canManage && (
                    <button type="button" className={styles.manageBtn} onClick={onManage}>
                        <Settings2 size={14} /> Manage Highlights
                    </button>
                )}
            </div>

            <div className={styles.scroller}>
                {loading ? (
                    <div className={styles.loading}>Loading highlighted groups…</div>
                ) : (
                    groups.map((g) => {
                        const style = STYLE_MAP[g.highlightStyle] || STYLE_MAP.blue;
                        const selected = String(selectedGroupId) === String(g._id);
                        return (
                            <button
                                key={g._id}
                                type="button"
                                className={clsx(styles.card, selected && styles.cardSelected)}
                                style={{
                                    borderColor: selected ? style.accent : '#e2e8f0',
                                    background: selected ? style.soft : '#fff',
                                    boxShadow: selected ? `0 0 0 1px ${style.accent}33` : undefined,
                                }}
                                onClick={() => onSelect?.(g)}
                            >
                                <div className={styles.cardTop}>
                                    <span className={styles.iconWrap} style={{ background: style.iconBg, color: style.accent }}>
                                        <Calendar size={16} />
                                    </span>
                                    <Star size={14} fill={style.accent} color={style.accent} />
                                </div>
                                <div className={styles.cardName}>{g.name}</div>
                                <div className={styles.cardMeta}>Recurring · {recurrenceLabel(g.recurrenceType)}</div>
                                <div className={styles.cardFooter}>
                                    <span className={styles.count}>{g.taskCount || 0} tasks</span>
                                    {(g.overdueCount > 0) && (
                                        <span className={styles.overdue}>{g.overdueCount} overdue</span>
                                    )}
                                    <ChevronRight size={14} className={styles.chevron} />
                                </div>
                            </button>
                        );
                    })
                )}
            </div>
        </section>
    );
}

export function SelectedGroupSummary({ groupDetail, onClear }) {
    if (!groupDetail?.group) return null;
    const g = groupDetail.group;
    const p = groupDetail.progress || {};
    const members = Array.isArray(g.userIds) ? g.userIds : [];

    return (
        <div className={styles.summary}>
            <div className={styles.summaryHead}>
                <div>
                    <h3 className={styles.summaryTitle}>{g.name} Recurring Tasks</h3>
                    <p className={styles.summarySub}>
                        Recurrence: {recurrenceLabel(g.recurrenceType)} · Visible to all mapped group members
                    </p>
                </div>
                <button type="button" className={styles.clearBtn} onClick={onClear}>Clear selection</button>
            </div>

            <div className={styles.summaryStats}>
                <div className={styles.stat}>
                    <span className={styles.statLabel}>Members</span>
                    <div className={styles.avatars}>
                        {members.slice(0, 5).map((u) => (
                            <span key={u._id || u} className={styles.avatar} title={u.name || ''}>
                                {(u.name || '?').slice(0, 1).toUpperCase()}
                            </span>
                        ))}
                        {members.length > 5 && <span className={styles.avatarMore}>+{members.length - 5}</span>}
                    </div>
                </div>
                <div className={styles.stat}><span className={styles.statLabel}>Total</span><strong>{p.total || 0}</strong></div>
                <div className={styles.stat}><span className={styles.statLabel}>Due this month</span><strong>{p.dueThisMonth || 0}</strong></div>
                <div className={styles.stat}><span className={styles.statLabel}>Overdue</span><strong className={p.overdue ? styles.danger : undefined}>{p.overdue || 0}</strong></div>
                <div className={styles.stat}><span className={styles.statLabel}>Completion</span><strong>{p.completionPct || 0}%</strong></div>
                <div className={styles.stat}><span className={styles.statLabel}>Status</span><strong>{g.isActive === false ? 'Inactive' : 'Active'}</strong></div>
            </div>
        </div>
    );
}
