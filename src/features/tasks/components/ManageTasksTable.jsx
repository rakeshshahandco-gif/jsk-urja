import React from 'react';
import { TaskTableRow } from './TaskTableRow';
import { TaskHubColGroup, TaskHubTableHead } from './TaskHubTableHead';
import styles from './TaskHubTable.module.scss';

const CATEGORY_LABELS = {
    OVERDUE: { text: 'Overdue', color: '#dc2626', bg: '#fef2f2' },
    TODAY: { text: 'Due today', color: '#16a34a', bg: '#f0fdf4' },
    UPCOMING: { text: 'Upcoming', color: '#2563eb', bg: '#eff6ff' },
    CLOSED: { text: 'Closed', color: '#6b7280', bg: '#f9fafb' },
    NO_DATE: { text: 'No due date', color: '#94a3b8', bg: '#f8f9fa' },
};

const COL_COUNT = 5;

export const ManageTasksTable = ({ tasks, loading, onExtend, onCloseTask, onEdit, onDelete, onTaskClick }) => {
    if (loading) {
        return (
            <div className={styles.wrap}>
                <div className={styles.loading}>
                    <div className={styles.spinner} />
                    Loading tasks…
                </div>
            </div>
        );
    }

    if (!tasks?.length) {
        return (
            <div className={styles.wrap}>
                <div className={styles.empty}>No tasks found matching the selected filters.</div>
            </div>
        );
    }

    let lastCategory = null;
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const endOfToday = new Date(now);
    endOfToday.setHours(23, 59, 59, 999);

    const rows = [];
    tasks.forEach((task) => {
        const due = task.dueDate ? new Date(task.dueDate) : null;
        const done = task.status === 'COMPLETED' || task.status === 'CANCELLED';

        let category = 'UPCOMING';
        if (done) category = 'CLOSED';
        else if (!due) category = 'NO_DATE';
        else if (due < now) category = 'OVERDUE';
        else if (due <= endOfToday) category = 'TODAY';

        if (category !== lastCategory) {
            lastCategory = category;
            const head = CATEGORY_LABELS[category];
            if (head) {
                rows.push(
                    <tr key={`header-${category}-${task._id}`} className={styles.categoryRow}>
                        <td colSpan={COL_COUNT} style={{ background: head.bg }}>
                            <div className={styles.categoryLabel} style={{ color: head.color }}>
                                {head.text}
                            </div>
                        </td>
                    </tr>
                );
            }
        }

        rows.push(
            <TaskTableRow
                key={task._id}
                task={task}
                onExtend={onExtend}
                onCloseTask={onCloseTask}
                onEdit={onEdit}
                onDelete={onDelete}
                onOpen={onTaskClick}
                showComplete={!done}
            />
        );
    });

    return (
        <div className={styles.wrap}>
            <div className={styles.scroll}>
                <table className={styles.table}>
                    <TaskHubColGroup />
                    <TaskHubTableHead />
                    <tbody>{rows}</tbody>
                </table>
            </div>
        </div>
    );
};
