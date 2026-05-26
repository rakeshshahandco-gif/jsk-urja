import React, { useState, useRef, useEffect } from 'react';
import { format, parseISO, startOfDay, isPast } from 'date-fns';
import { MoreHorizontal, Pencil, Eye, Clock3, Trash2 } from 'lucide-react';
import { PRIORITY_BADGE, STATUS_BADGE } from './taskHubConstants';
import styles from './TaskHubTable.module.scss';

export const AssigneeCell = ({ assignees }) => {
    const [showTooltip, setShowTooltip] = useState(false);
    const list = assignees || [];

    if (list.length === 0) {
        return <span className={styles.assigneeUnassigned}>Unassigned</span>;
    }

    const first = list[0];
    const extra = list.length - 1;

    return (
        <span
            className={styles.assigneeWrap}
            onMouseEnter={() => extra > 0 && setShowTooltip(true)}
            onMouseLeave={() => setShowTooltip(false)}
            onClick={(e) => e.stopPropagation()}
        >
            <span className={styles.assigneeName}>{first?.name || 'Unknown'}</span>
            {extra > 0 && <span className={styles.assigneeExtra}>+{extra}</span>}
            {showTooltip && extra > 0 && (
                <span className={styles.assigneeTooltip}>
                    {list.map((a, i) => (
                        <span key={i} style={{ display: 'block' }}>
                            {a?.name || 'Unknown'}
                        </span>
                    ))}
                </span>
            )}
        </span>
    );
};

export const TaskPrimaryCell = ({ task }) => {
    const pb = PRIORITY_BADGE[task.priority] || { bg: '#f1f5f9', color: '#475569' };
    const groupName = task.groupId?.name;
    const tooltip = [task.title, task.description].filter(Boolean).join('\n');

    return (
        <div>
            <div className={styles.taskTitle} title={tooltip || undefined}>
                {task.title || '-'}
            </div>
            <div className={styles.taskMeta}>
                {groupName ? (
                    <span title={groupName}>{groupName}</span>
                ) : (
                    <span style={{ fontStyle: 'italic' }}>No group</span>
                )}
                <span className={styles.taskMetaSep}>&middot;</span>
                <span
                    className={styles.priorityChip}
                    style={{ background: pb.bg, color: pb.color, border: `1px solid ${pb.color}33` }}
                >
                    {task.priority || 'LOW'}
                </span>
            </div>
        </div>
    );
};

export const DueCell = ({ task }) => {
    const due = task.dueDate ? parseISO(task.dueDate) : null;
    const isOverdue = due && isPast(startOfDay(due)) && task.status !== 'COMPLETED' && task.status !== 'CANCELLED';

    if (!due) {
        return <span className={styles.dueEmpty}>-</span>;
    }

    return (
        <span className={`${styles.dueDate} ${isOverdue ? styles.overdue : styles.normal}`}>
            {format(due, 'dd MMM yyyy')}
        </span>
    );
};

export const StateCell = ({ task }) => {
    const sb = STATUS_BADGE[task.status] || STATUS_BADGE.OPEN;
    const pb = PRIORITY_BADGE[task.priority] || { color: '#94a3b8' };

    return (
        <div className={styles.stateCell}>
            <span className={styles.statusBadge} style={{ background: sb.bg, color: sb.color }}>
                {sb.label}
            </span>
            <span className={styles.priorityDot}>
                <span className={styles.priorityDotIcon} style={{ background: pb.color }} />
                {task.priority || 'LOW'}
            </span>
        </div>
    );
};

export const TaskHubActionsMenu = ({ task, onOpen, onEdit, onExtend, onDelete, showComplete, onCloseTask }) => {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);

    useEffect(() => {
        const handler = (e) => {
            if (ref.current && !ref.current.contains(e.target)) setOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    return (
        <div className={styles.actionsInner} onClick={(e) => e.stopPropagation()}>
            {showComplete && task.status !== 'COMPLETED' && (
                <button
                    type="button"
                    className={styles.completeBtn}
                    onClick={() => onCloseTask(task._id)}
                    title="Mark complete"
                >
                    Complete
                </button>
            )}
            <div className={styles.menuWrap} ref={ref}>
                <button
                    type="button"
                    className={styles.menuTrigger}
                    onClick={() => setOpen((o) => !o)}
                    title="More actions"
                    aria-expanded={open}
                    aria-haspopup="menu"
                >
                    <MoreHorizontal size={16} />
                </button>
                {open && (
                    <div className={styles.menuDropdown} role="menu">
                        <button type="button" className={styles.menuItem} role="menuitem" onClick={() => { onOpen(task); setOpen(false); }}>
                            <Eye size={14} />
                            Open
                        </button>
                        <button type="button" className={styles.menuItem} role="menuitem" onClick={() => { onEdit(task); setOpen(false); }}>
                            <Pencil size={14} />
                            Edit
                        </button>
                        <button type="button" className={styles.menuItem} role="menuitem" onClick={() => { onExtend(task); setOpen(false); }}>
                            <Clock3 size={14} />
                            Extend due date
                        </button>
                        <div className={styles.menuDivider} />
                        <button
                            type="button"
                            className={`${styles.menuItem} ${styles.danger}`}
                            role="menuitem"
                            onClick={() => { onDelete(task._id); setOpen(false); }}
                        >
                            <Trash2 size={14} />
                            Delete
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};