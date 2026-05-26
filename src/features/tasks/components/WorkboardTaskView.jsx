import React, { useState, useEffect, useCallback } from 'react';
import { useGlobalSync } from '@/hooks/useGlobalSync';
import { apiClient as api } from '@/lib/apiClient';
import { useToast } from '@/components/ui/Toast';
import { ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { WORKBOARD_SECTIONS } from './taskHubConstants';
import { TaskTableRow } from './TaskTableRow';
import { TaskHubColGroup, TaskHubTableHead } from './TaskHubTableHead';
import { groupTasksForWorkboard, workboardStatsFromGroups } from './taskHubGrouping';
import hubStyles from './TaskHubTable.module.scss';
import wbStyles from './WorkboardTaskView.module.scss';

const COL_COUNT = 5;

const SectionHeader = ({ config, count, collapsed, onToggle }) => {
    const Icon = config.icon;
    return (
        <tr
            onClick={onToggle}
            className={wbStyles.sectionRow}
            style={{ background: config.headerBg, borderBottomColor: config.border }}
        >
            <td colSpan={COL_COUNT}>
                <div className={wbStyles.sectionInner}>
                    <Icon size={12} color={config.headerText} />
                    <span className={wbStyles.sectionLabel} style={{ color: config.headerText }}>
                        {config.label}
                    </span>
                    <span
                        className={wbStyles.sectionCount}
                        style={{ background: `${config.headerText}22`, color: config.headerText }}
                    >
                        {count}
                    </span>
                    <span style={{ color: config.headerText }}>{collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}</span>
                </div>
            </td>
        </tr>
    );
};

const WorkboardTaskView = ({
    searchTerm,
    priorityFilter,
    groupFilter,
    assigneeFilter,
    onExtend,
    onCloseTask,
    onEdit,
    onDelete,
    onOpen,
    onSummaryChange,
    refreshToken = 0,
}) => {
    const { addToast } = useToast();
    const [loading, setLoading] = useState(true);
    const [groups, setGroups] = useState({ overdue: [], today: [], week: [], future: [] });
    const [collapsedStates, setCollapsedStates] = useState({
        overdue: false,
        today: false,
        week: false,
        future: false,
    });

    const fetchAll = useCallback(async () => {
        setLoading(true);
        try {
            const params = {
                tab: 'ALL',
                limit: 200,
                page: 1,
                search: searchTerm || undefined,
                priority: priorityFilter || undefined,
                groupId: groupFilter || undefined,
                assigneeId: assigneeFilter || undefined,
            };
            const res = await api.get('/reports/manage-tasks', { params });
            const all = (res.data.data || []).filter((t) => t.status !== 'COMPLETED' && t.status !== 'CANCELLED');
            const grouped = groupTasksForWorkboard(all);
            setGroups(grouped);
            onSummaryChange?.(workboardStatsFromGroups(grouped));
        } catch {
            addToast('Failed to load workboard.', 'error');
            onSummaryChange?.({ overdue: 0, today: 0, week: 0, open: 0 });
        } finally {
            setLoading(false);
        }
    }, [searchTerm, priorityFilter, groupFilter, assigneeFilter, addToast, onSummaryChange]);

    useEffect(() => {
        fetchAll();
    }, [fetchAll, refreshToken]);

    useGlobalSync('task', (payload) => {
        if (payload.action === 'create' || payload.action === 'delete') {
            fetchAll();
        } else if (payload.action === 'update' || payload.action === 'assigned') {
            const isCompleted = payload.data?.status === 'COMPLETED' || payload.data?.status === 'CANCELLED';
            const groupFieldsChanged = payload.changedFields?.some((f) =>
                ['dueDate', 'priority', 'groupId', 'assigneeIds'].includes(f)
            );
            if (isCompleted || groupFieldsChanged) {
                fetchAll();
            } else {
                setGroups((prev) => {
                    const next = { ...prev };
                    Object.keys(next).forEach((k) => {
                        next[k] = next[k].map((t) => (t._id === payload.recordId ? { ...t, ...payload.data } : t));
                    });
                    onSummaryChange?.(workboardStatsFromGroups(next));
                    return next;
                });
            }
        }
    });

    const toggleSection = (key) => {
        setCollapsedStates((prev) => ({ ...prev, [key]: !prev[key] }));
    };

    if (loading) {
        return (
            <div className={wbStyles.loading}>
                <Loader2 size={26} className={wbStyles.spin} />
                <span className={wbStyles.loadingText}>Loading workboard…</span>
            </div>
        );
    }

    return (
        <div className={wbStyles.panel}>
            <div className={hubStyles.scroll}>
                <table className={hubStyles.table}>
                    <TaskHubColGroup />
                    <TaskHubTableHead />
                    <tbody>
                        {WORKBOARD_SECTIONS.map((cfg) => {
                            const tasks = groups[cfg.key];
                            const isCollapsed = collapsedStates[cfg.key];
                            return (
                                <React.Fragment key={cfg.key}>
                                    <SectionHeader
                                        config={cfg}
                                        count={tasks.length}
                                        collapsed={isCollapsed}
                                        onToggle={() => toggleSection(cfg.key)}
                                    />
                                    {!isCollapsed &&
                                        (tasks.length === 0 ? (
                                            <tr>
                                                <td colSpan={COL_COUNT} className={wbStyles.emptyCell}>
                                                    {cfg.emptyMsg}
                                                </td>
                                            </tr>
                                        ) : (
                                            tasks.map((t, i) => (
                                                <TaskTableRow
                                                    key={t._id}
                                                    task={t}
                                                    zebra={i % 2 === 1}
                                                    onExtend={onExtend}
                                                    onCloseTask={onCloseTask}
                                                    onEdit={onEdit}
                                                    onDelete={onDelete}
                                                    onOpen={onOpen}
                                                />
                                            ))
                                        ))}
                                </React.Fragment>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default WorkboardTaskView;
