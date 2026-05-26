import { AlertTriangle, Clock, CalendarDays, CalendarRange } from 'lucide-react';

export const PRIORITY_ORDER = { CRITICAL: 0, URGENT: 1, HIGH: 2, MEDIUM: 3, LOW: 4 };

export const PRIORITY_BADGE = {
    CRITICAL: { bg: '#fef2f2', color: '#991b1b' },
    URGENT: { bg: '#fef2f2', color: '#b91c1c' },
    HIGH: { bg: '#fff7ed', color: '#c2410c' },
    MEDIUM: { bg: '#fefce8', color: '#92400e' },
    LOW: { bg: '#f0fdf4', color: '#15803d' },
};

export const STATUS_BADGE = {
    OPEN: { bg: '#eff6ff', color: '#1d4ed8', label: 'Open' },
    IN_PROGRESS: { bg: '#eef2ff', color: '#4338ca', label: 'In Progress' },
    COMPLETED: { bg: '#f0fdf4', color: '#15803d', label: 'Completed' },
    OVERDUE: { bg: '#fff1f2', color: '#be123c', label: 'Overdue' },
    CANCELLED: { bg: '#f9fafb', color: '#6b7280', label: 'Cancelled' },
};

export const WORKBOARD_SECTIONS = [
    {
        key: 'overdue',
        label: 'Overdue',
        headerBg: '#fee2e2',
        headerText: '#b91c1c',
        border: '#fca5a5',
        icon: AlertTriangle,
        emptyMsg: 'No overdue tasks.',
    },
    {
        key: 'today',
        label: 'Due today',
        headerBg: '#ffedd5',
        headerText: '#c2410c',
        border: '#fdba74',
        icon: Clock,
        emptyMsg: 'No tasks due today.',
    },
    {
        key: 'week',
        label: 'Upcoming (7 days)',
        headerBg: '#fef9c3',
        headerText: '#92400e',
        border: '#fde047',
        icon: CalendarDays,
        emptyMsg: 'No tasks in the next 7 days.',
    },
    {
        key: 'future',
        label: 'Later',
        headerBg: '#dbeafe',
        headerText: '#1d4ed8',
        border: '#93c5fd',
        icon: CalendarRange,
        emptyMsg: 'No tasks scheduled beyond 7 days.',
    },
];

export const TABLE_TABS = [
    { id: 'overdue', api: 'OVERDUE', label: 'Overdue' },
    { id: 'today', api: 'TODAY', label: 'Today' },
    { id: 'upcoming', api: 'UPCOMING', label: 'Upcoming' },
    { id: 'all', api: 'ALL', label: 'All' },
    { id: 'closed', api: 'CLOSED', label: 'Closed' },
];

export const VIEW_MODES = [
    { id: 'workboard', label: 'Workboard' },
    { id: 'table', label: 'Table view' },
];

export const TASK_HUB_COLUMNS = [
    { key: 'task', label: 'Task', width: '38%' },
    { key: 'due', label: 'Due', width: '14%' },
    { key: 'assignee', label: 'Assignee', width: '18%' },
    { key: 'state', label: 'State', width: '16%' },
    { key: 'actions', label: '', width: '14%', center: true },
];

export const td = {
    padding: '4px 8px',
    verticalAlign: 'middle',
    color: '#374151',
    borderBottom: '1px solid #f1f5f9',
};

export const hubStyles = {
    sel: {
        height: 28,
        fontSize: 11,
        padding: '0 22px 0 6px',
        border: '1px solid #d1d5db',
        borderRadius: 5,
        background: '#fff',
        color: '#374151',
        outline: 'none',
        cursor: 'pointer',
        appearance: 'none',
        minWidth: 90,
        backgroundImage:
            "url(\"data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e\")",
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'right 3px center',
        backgroundSize: '0.9em',
    },
    inp: {
        height: 28,
        fontSize: 11,
        padding: '0 6px',
        border: '1px solid #d1d5db',
        color: '#374151',
        borderRadius: 5,
        background: '#fff',
        outline: 'none',
        width: 88,
    },
    tab: (active) => ({
        padding: '3px 10px',
        fontSize: 11,
        fontWeight: 600,
        borderRadius: 5,
        border: 'none',
        cursor: 'pointer',
        background: active ? '#fff' : 'transparent',
        color: active ? '#0d9488' : '#6b7280',
        boxShadow: active ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
        transition: 'all 0.15s',
    }),
    resetBtn: {
        height: 28,
        padding: '0 10px',
        fontSize: 11,
        fontWeight: 600,
        border: '1px solid #d1d5db',
        borderRadius: 5,
        background: '#fff',
        color: '#6b7280',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: 4,
    },
};
