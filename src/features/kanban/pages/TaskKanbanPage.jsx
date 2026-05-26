import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { getTasks, updateTaskStatus } from '@/services/taskApi';
import KanbanBoard from '../components/KanbanBoard';
import KanbanColumn from '../components/KanbanColumn';
import TaskKanbanCard from '../components/TaskKanbanCard';
import { useKanbanDnd } from '../hooks/useKanbanDnd';

// Columns match the existing Task status enum from backend/src/models/task.model.js
// and backend/src/validations/task.validation.js (updateTaskStatus body).
// Do NOT add new values without extending both files atomically.
const COLUMNS = [
    { id: 'OPEN',        title: 'Open',        accent: '#3b82f6' },
    { id: 'IN_PROGRESS', title: 'In Progress', accent: '#8b5cf6' },
    { id: 'OVERDUE',     title: 'Overdue',     accent: '#f97316' },
    { id: 'COMPLETED',   title: 'Completed',   accent: '#16a34a' },
    { id: 'CANCELLED',   title: 'Cancelled',   accent: '#dc2626' },
];

const pageStyle = {
    padding: 16,
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    boxSizing: 'border-box',
};

const headerStyle = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    flexWrap: 'wrap',
    gap: 8,
};

const titleStyle = { margin: 0, fontSize: 18, color: '#0f172a' };
const subtitleStyle = { fontSize: 12, color: '#64748b', marginTop: 2 };

const btnStyle = {
    background: '#1e3a8a',
    color: 'white',
    padding: '7px 12px',
    border: 'none',
    borderRadius: 6,
    fontSize: 13,
    cursor: 'pointer',
};

const linkBtnStyle = {
    background: 'transparent',
    color: '#1e3a8a',
    padding: '7px 12px',
    border: '1px solid #1e3a8a',
    borderRadius: 6,
    fontSize: 13,
    cursor: 'pointer',
};

const errorBoxStyle = {
    background: '#fee2e2',
    color: '#991b1b',
    padding: '8px 12px',
    borderRadius: 6,
    marginBottom: 12,
    fontSize: 13,
};

const loadingStyle = { padding: 40, textAlign: 'center', color: '#64748b', fontSize: 14 };

const VIEW_OPTIONS = [
    { value: 'assigned_to_me', label: 'Assigned to me' },
    { value: 'created_by_me', label: 'Created by me' },
    { value: 'all', label: 'All tasks' },
];

function groupByStatus(tasks) {
    const acc = {};
    for (const col of COLUMNS) acc[col.id] = [];
    for (const task of tasks || []) {
        const s = String(task?.status || '').toUpperCase();
        if (acc[s]) acc[s].push(task);
        else acc.OPEN.push(task);
    }
    return acc;
}

export default function TaskKanbanPage() {
    const navigate = useNavigate();
    const [tasks, setTasks] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [view, setView] = useState('assigned_to_me');
    const [pendingIds, setPendingIds] = useState(() => new Set());

    const load = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const data = await getTasks({ view, limit: 500 });
            const rows = Array.isArray(data) ? data : (data?.results || []);
            setTasks(rows);
        } catch (e) {
            setError(e.response?.data?.message || e.message || 'Failed to load tasks');
        } finally {
            setLoading(false);
        }
    }, [view]);

    useEffect(() => { load(); }, [load]);

    const grouped = useMemo(() => groupByStatus(tasks), [tasks]);

    const handleDrop = useCallback(async (cardId, fromColumn, toColumn) => {
        if (!cardId || !toColumn || fromColumn === toColumn) return;
        const prevList = tasks;
        setTasks((curr) => curr.map((t) => (
            String(t._id) === String(cardId) ? { ...t, status: toColumn } : t
        )));
        setPendingIds((s) => {
            const next = new Set(s);
            next.add(String(cardId));
            return next;
        });
        try {
            await updateTaskStatus(cardId, toColumn);
            const colTitle = (COLUMNS.find((c) => c.id === toColumn) || {}).title || toColumn;
            toast.success(`Moved to ${colTitle}`);
        } catch (e) {
            setTasks(prevList);
            const msg = e.response?.data?.message || e.message || 'Failed to update task status';
            toast.error(msg);
        } finally {
            setPendingIds((s) => {
                const next = new Set(s);
                next.delete(String(cardId));
                return next;
            });
        }
    }, [tasks]);

    const dnd = useKanbanDnd({ onDrop: handleDrop });

    const openTask = useCallback((task) => {
        if (task && task._id) navigate(`/tasks/edit/${task._id}`);
    }, [navigate]);

    return (
        <div style={pageStyle}>
            <div style={headerStyle}>
                <div>
                    <h2 style={titleStyle}>Task Kanban</h2>
                    <div style={subtitleStyle}>
                        Drag a task card to change its status. Total: {tasks.length}
                    </div>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <select
                        value={view}
                        onChange={(e) => setView(e.target.value)}
                        style={{ padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 13 }}
                        title="Filter task view"
                    >
                        {VIEW_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                    </select>
                    <button onClick={load} style={linkBtnStyle} disabled={loading}>
                        {loading ? 'Refreshing...' : 'Refresh'}
                    </button>
                    <button onClick={() => navigate('/tasks/list')} style={btnStyle}>
                        Open List View
                    </button>
                </div>
            </div>

            {error ? <div style={errorBoxStyle}>{error}</div> : null}

            {loading && tasks.length === 0 ? (
                <div style={loadingStyle}>Loading tasks...</div>
            ) : (
                <KanbanBoard>
                    {COLUMNS.map((col) => {
                        const items = grouped[col.id] || [];
                        return (
                            <KanbanColumn
                                key={col.id}
                                id={col.id}
                                title={col.title}
                                accent={col.accent}
                                count={items.length}
                                isEmpty={items.length === 0}
                                emptyHint="Drop tasks here"
                                droppableProps={dnd.columnProps(col.id)}
                            >
                                {items.map((task) => (
                                    <TaskKanbanCard
                                        key={task._id}
                                        task={task}
                                        dragProps={dnd.cardProps(task._id, col.id)}
                                        onOpen={openTask}
                                        isPending={pendingIds.has(String(task._id))}
                                    />
                                ))}
                            </KanbanColumn>
                        );
                    })}
                </KanbanBoard>
            )}
        </div>
    );
}
