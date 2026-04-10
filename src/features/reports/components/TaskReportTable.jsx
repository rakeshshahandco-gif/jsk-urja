import React, { useState, useRef, useEffect } from 'react';
import { format } from 'date-fns';
import { CheckCircle2, MoreHorizontal, Check, Pencil, Trash2, Eye } from 'lucide-react';
import { Button } from '@/components/ui';
import { useNavigate } from 'react-router-dom';
import { deleteTask } from '@/services/taskApi';
import { useToast } from '@/components/ui/Toast';

const priorityColors = {
    LOW: 'bg-yellow-50 text-yellow-700 border-yellow-200',
    MEDIUM: 'bg-orange-50 text-orange-700 border-orange-200',
    HIGH: 'bg-red-50 text-red-700 border-red-200',
    URGENT: 'bg-red-100 text-red-800 border-red-300',
    CRITICAL: 'bg-red-200 text-red-900 border-red-400'
};

const statusColors = {
    OPEN: 'bg-blue-50 text-blue-700 border-blue-200',
    IN_PROGRESS: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    COMPLETED: 'bg-green-50 text-green-700 border-green-200',
    OVERDUE: 'bg-red-50 text-red-700 border-red-200',
    CANCELLED: 'bg-gray-100 text-gray-500 border-gray-300'
};

// Assigned To cell with +N overflow and hover tooltip
const AssignedToCell = ({ assignees }) => {
    const [show, setShow] = useState(false);

    if (!assignees || assignees.length === 0) {
        return <div className="text-gray-400 italic">Unassigned</div>;
    }

    const first = assignees[0];
    const extra = assignees.length - 1;

    return (
        <div
            className="relative inline-flex items-center gap-1 cursor-default"
            onMouseEnter={() => setShow(true)}
            onMouseLeave={() => setShow(false)}
        >
            <span className="text-gray-700 font-medium">{first?.name || 'Unknown'}</span>
            {extra > 0 && (
                <span className="px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded-full text-[10px] font-bold">
                    +{extra}
                </span>
            )}
            {show && extra > 0 && (
                <div className="absolute left-0 top-6 z-50 bg-gray-900 text-white text-xs rounded-lg p-2 shadow-xl min-w-[120px] whitespace-nowrap">
                    {assignees.map((a, i) => (
                        <div key={i} className="py-0.5">{a?.name || 'Unknown'}</div>
                    ))}
                </div>
            )}
        </div>
    );
};

// Three-dot dropdown menu
const ActionsMenu = ({ task, onEdit, onDelete, onViewDetails }) => {
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
        <div className="relative" ref={ref}>
            <button
                onClick={() => setOpen(o => !o)}
                className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                title="More options"
            >
                <MoreHorizontal size={18} />
            </button>
            {open && (
                <div className="absolute right-0 top-8 z-50 bg-white rounded-xl shadow-xl border border-gray-100 py-1 min-w-[140px]">
                    <button
                        onClick={() => { onEdit(task); setOpen(false); }}
                        className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                        <Pencil size={13} className="text-gray-400" />
                        Edit
                    </button>
                    <button
                        onClick={() => { onViewDetails(task); setOpen(false); }}
                        className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                        <Eye size={13} className="text-blue-400" />
                        View Details
                    </button>
                    <div className="my-1 border-t border-gray-100" />
                    <button
                        onClick={() => { onDelete(task._id); setOpen(false); }}
                        className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                    >
                        <Trash2 size={13} className="text-red-400" />
                        Delete
                    </button>
                </div>
            )}
        </div>
    );
};

export const TaskReportTable = ({ tasks, loading, onExtend, onCloseTask, onRefresh }) => {
    const navigate = useNavigate();
    const { addToast } = useToast();

    const handleEdit = (task) => navigate(`/tasks/edit/${task._id}`);
    const handleViewDetails = (task) => navigate(`/tasks/${task._id}`);
    const handleDelete = async (taskId) => {
        if (!window.confirm('Are you sure you want to delete this task?')) return;
        try {
            await deleteTask(taskId);
            addToast('Task deleted successfully.', 'success');
            if (onRefresh) onRefresh();
        } catch {
            addToast('Failed to delete task.', 'error');
        }
    };

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center p-12 text-gray-500">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mb-4"></div>
                <p>Fetching tasks...</p>
            </div>
        );
    }

    if (!tasks || tasks.length === 0) {
        return (
            <div className="p-12 text-center text-gray-500 bg-white rounded-lg border border-dashed border-gray-300">
                <p className="text-lg font-medium">No tasks found</p>
                <p className="text-sm mt-1">There are no tasks matching the selected criteria.</p>
            </div>
        );
    }

    return (
        <div className="overflow-x-auto bg-white shadow-sm">
            <table className="w-full text-sm text-left border-collapse">
                <thead className="bg-[#F8FAFC] text-[11px] uppercase text-gray-500 border-b border-gray-100">
                    <tr>
                        <th className="px-6 py-3 font-bold">Task Name</th>
                        <th className="px-6 py-3 font-bold">Group Name</th>
                        <th className="px-6 py-3 font-bold">Created By</th>
                        <th className="px-6 py-3 font-bold">Assigned To</th>
                        <th className="px-6 py-3 font-bold">Due Date & Time</th>
                        <th className="px-6 py-3 font-bold">Priority</th>
                        <th className="px-6 py-3 font-bold">Status</th>
                        <th className="px-6 py-3 font-bold text-center">Actions</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                    {tasks.map((task) => {
                        const dueDate = task.dueDate ? new Date(task.dueDate) : null;
                        const isOverdue = dueDate && new Date() > dueDate && task.status !== 'COMPLETED' && task.status !== 'CANCELLED';
                        const isClosed = task.status === 'COMPLETED' || task.status === 'CANCELLED';

                        return (
                            <tr key={task._id} className="hover:bg-gray-50/70 transition-colors group align-middle">

                                {/* Task Name */}
                                <td className="px-6 py-4 max-w-[200px]">
                                    <div
                                        className="font-bold text-gray-900 leading-tight truncate"
                                        title={task?.title || ''}
                                    >
                                        {task?.title || '—'}
                                    </div>
                                    {task?.description && (
                                        <div className="text-[11px] text-gray-400 mt-0.5 truncate" title={task.description}>
                                            {task.description}
                                        </div>
                                    )}
                                </td>

                                {/* Group Name */}
                                <td className="px-6 py-4">
                                    {task.groupId?.name ? (
                                        <div className="text-gray-600 font-medium">{task.groupId.name}</div>
                                    ) : (
                                        <div className="text-gray-400 italic">No Group</div>
                                    )}
                                </td>

                                {/* Created By */}
                                <td className="px-6 py-4">
                                    <div className="text-gray-700 font-medium">{task.createdBy?.name || '—'}</div>
                                </td>

                                {/* Assigned To */}
                                <td className="px-6 py-4">
                                    <AssignedToCell assignees={task.assigneeIds} />
                                </td>

                                {/* Due Date & Time */}
                                <td className="px-6 py-4 whitespace-nowrap">
                                    {dueDate && !isNaN(dueDate.getTime()) ? (
                                        <div className="flex flex-col">
                                            <div className={`font-bold ${isOverdue ? 'text-red-600' : 'text-gray-700'}`}>
                                                {format(dueDate, 'dd/MM/yyyy')}
                                            </div>
                                            <div className="text-[11px] text-gray-400">{format(dueDate, 'HH:mm')}</div>
                                        </div>
                                    ) : (
                                        <div className="text-gray-400 italic">No date</div>
                                    )}
                                </td>

                                {/* Priority */}
                                <td className="px-6 py-4">
                                    <span className={`inline-flex items-center px-3 py-1 rounded-md text-[10px] font-bold border ${priorityColors[task.priority] || priorityColors.MEDIUM}`}>
                                        <span className={`w-2 h-2 rounded-full mr-2 ${task.priority === 'HIGH' || task.priority === 'URGENT' || task.priority === 'CRITICAL' ? 'bg-red-500' : 'bg-yellow-500'}`}></span>
                                        {task.priority || 'MEDIUM'}
                                    </span>
                                </td>

                                {/* Status */}
                                <td className="px-6 py-4">
                                    <span className={`px-3 py-1 rounded-md text-[10px] font-bold border ${statusColors[task?.status] || statusColors.OPEN}`}>
                                        {task?.status?.replace('_', ' ') || 'OPEN'}
                                    </span>
                                </td>

                                {/* Actions */}
                                <td className="px-6 py-4">
                                    <div className="flex items-center justify-center gap-2">
                                        {!isClosed ? (
                                            <Button
                                                size="xs"
                                                variant="outline"
                                                onClick={() => onCloseTask(task._id)}
                                                className="h-8 px-3 border-green-200 text-green-700 hover:bg-green-50 font-bold text-[11px]"
                                            >
                                                <Check size={14} className="mr-1" />
                                                Close
                                            </Button>
                                        ) : (
                                            <div className="text-[11px] font-bold text-green-600 flex items-center">
                                                <CheckCircle2 size={14} className="mr-1" />
                                                DONE
                                            </div>
                                        )}

                                        {!isClosed && (
                                            <button
                                                onClick={() => onExtend(task)}
                                                className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                                                title="Extend due date"
                                            >
                                                <MoreHorizontal size={18} />
                                            </button>
                                        )}

                                        <ActionsMenu
                                            task={task}
                                            onEdit={handleEdit}
                                            onDelete={handleDelete}
                                            onViewDetails={handleViewDetails}
                                        />
                                    </div>
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
};
