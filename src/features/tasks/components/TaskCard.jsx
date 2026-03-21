import React, { useState } from 'react';
import { Calendar, User, Users, CheckCircle, Clock, MoreVertical, Repeat, ListCheck } from 'lucide-react';
import { closeTask, getTaskGroup } from '@/services/taskApi';
import { Button, useModal } from '@/components/ui';
import { TaskExtendModal } from './TaskExtendModal';
import toast from 'react-hot-toast';

const GroupDetailModal = ({ groupId, onRefresh, onClose }) => {
    const [data, setData] = React.useState(null);
    const [loading, setLoading] = React.useState(true);

    React.useEffect(() => {
        getTaskGroup(groupId).then(res => {
            setData(res);
            setLoading(false);
        }).catch(() => toast.error('Failed to load group'));
    }, [groupId]);

    if (loading) return <div className="p-10 text-center animate-pulse font-bold text-gray-400">Loading group details...</div>;

    const { group, tasks, progress } = data;

    return (
        <div className="space-y-6">
            <div className="bg-blue-50 p-4 rounded-xl border border-blue-100">
                <h4 className="font-black text-blue-900 text-lg">{group.name}</h4>
                {group.notes && <p className="text-sm text-blue-700 italic mt-1">{group.notes}</p>}
                <div className="mt-4 flex items-center gap-4">
                    <div className="flex-1 bg-blue-200 h-2 rounded-full overflow-hidden">
                        <div
                            className="bg-blue-600 h-full transition-all duration-500"
                            style={{ width: `${(progress.closed / progress.total) * 100}%` }}
                        ></div>
                    </div>
                    <span className="text-xs font-black text-blue-800">
                        {progress.closed} / {progress.total} Tasks ({Math.round((progress.closed / progress.total) * 100)}%)
                    </span>
                </div>
            </div>

            <div className="space-y-3">
                <h5 className="text-xs font-black uppercase tracking-widest text-gray-400 flex items-center gap-2">
                    <ListCheck size={14} /> Child Tasks
                </h5>
                <div className="max-h-80 overflow-y-auto space-y-2 pr-2">
                    {tasks.map(t => (
                        <div key={t._id} className="p-3 border rounded-lg flex justify-between items-center bg-white shadow-sm">
                            <div>
                                <p className="text-sm font-bold text-gray-800">{t.title}</p>
                                <p className="text-[10px] text-gray-400">{new Date(t.dueDate).toLocaleDateString()}</p>
                            </div>
                            <span className={`text-[9px] font-black px-2 py-0.5 rounded-full border ${t.status === 'COMPLETED' ? 'bg-green-50 text-green-600 border-green-100' : 'bg-blue-50 text-blue-600 border-blue-100'
                                }`}>
                                {t.status}
                            </span>
                        </div>
                    ))}
                </div>
            </div>

            <div className="flex justify-end pt-4">
                <Button variant="outline" onClick={onClose} className="font-bold">Close</Button>
            </div>
        </div>
    );
};

export const TaskCard = ({ task, onEdit, onDelete, onRefresh }) => {
    const { openModal, closeModal } = useModal();
    const [actionLoading, setActionLoading] = useState(false);

    const getStatusColor = (status) => {
        switch (status) {
            case 'OPEN': return 'text-blue-600 bg-blue-50 border-blue-100';
            case 'IN_PROGRESS': return 'text-yellow-600 bg-yellow-50 border-yellow-100';
            case 'COMPLETED': return 'text-green-600 bg-green-50 border-green-100';
            case 'OVERDUE': return 'text-red-600 bg-red-50 border-red-100';
            case 'CANCELLED': return 'text-gray-600 bg-gray-50 border-gray-100';
            default: return 'text-gray-600 bg-gray-50 border-gray-100';
        }
    };

    const getPriorityColor = (priority) => {
        switch (priority) {
            case 'CRITICAL': return 'text-white bg-red-600 border-red-700 shadow-sm';
            case 'URGENT': return 'text-red-600 bg-red-50 border-red-100';
            case 'HIGH': return 'text-orange-600 bg-orange-50 border-orange-100';
            case 'MEDIUM': return 'text-blue-600 bg-blue-50 border-blue-100';
            case 'LOW': return 'text-gray-600 bg-gray-50 border-gray-100';
            default: return 'text-gray-600 bg-gray-50 border-gray-100';
        }
    };

    const formatDate = (date) => {
        if (!date) return 'No date';
        return new Date(date).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    };

    const handleClose = async () => {
        if (!window.confirm('Mark this task as completed?')) return;
        try {
            setActionLoading(true);
            await closeTask(task._id || task.id);
            toast.success('Task completed!');
            onRefresh();
        } catch (error) {
            toast.error('Failed to close task');
        } finally {
            setActionLoading(false);
        }
    };

    const handleExtend = () => {
        const modalId = openModal(
            TaskExtendModal,
            {
                title: 'Extend Due Date',
                task: task,
                onSuccess: () => { closeModal(modalId); onRefresh(); },
                onCancel: () => closeModal(modalId)
            }
        );
    };

    const handleViewGroup = () => {
        const modalId = openModal(
            GroupDetailModal,
            {
                title: 'Group Progress',
                groupId: task.groupId?._id || task.groupId,
                onRefresh: onRefresh,
                onClose: () => closeModal(modalId)
            }
        );
    };

    return (
        <div className={`bg-white border rounded-xl p-5 shadow-sm hover:shadow-md transition-all border-l-4 ${task.priority === 'CRITICAL' ? 'border-l-red-600' : 'border-l-transparent'}`}>
            <div className="flex flex-col gap-3">
                <div className="flex justify-between items-start">
                    <div className="space-y-1">
                        <div className="flex items-center gap-2">
                            <h3 className="text-base font-bold text-gray-900 leading-tight">
                                {task.title}
                            </h3>
                            {task.recurrence?.enabled && (
                                <span className="p-1 rounded bg-purple-50 text-purple-600" title="Recurring Task">
                                    <Repeat size={14} />
                                </span>
                            )}
                        </div>
                        {task.taskCategoryId?.name && (
                            <span className="text-[10px] uppercase tracking-wider font-black text-gray-400">
                                {task.taskCategoryId.name}
                            </span>
                        )}
                        {task.groupId?.name && (
                            <button
                                onClick={(e) => { e.stopPropagation(); handleViewGroup(); }}
                                className="text-[10px] uppercase tracking-wider font-black text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded ml-2 hover:bg-blue-100 transition-colors"
                            >
                                G: {task.groupId.name}
                            </button>
                        )}
                    </div>
                    <div className="flex flex-col items-end gap-2">
                        <span className={`px-2.5 py-1 rounded-full font-bold border text-[10px] tracking-wide ${getStatusColor(task.status)}`}>
                            {task.status}
                        </span>
                        <span className={`px-2.5 py-1 rounded-full font-bold border text-[10px] tracking-wide shadow-sm ${getPriorityColor(task.priority)}`}>
                            {task.priority}
                        </span>
                    </div>
                </div>

                {task.description && (
                    <p className="text-sm text-gray-600 line-clamp-2 bg-gray-50 p-2 rounded italic font-medium">
                        &quot;{task.description}&quot;
                    </p>
                )}

                {(task.amount > 0 || task.billNumber || task.isPaid) && (
                    <div className="flex flex-wrap items-center gap-2 py-2 border-y border-gray-50 bg-slate-50/50 px-2 rounded-lg">
                        {task.amount > 0 && (
                            <div className="flex items-center gap-1.5 px-2 py-0.5 bg-blue-600 text-white rounded text-[11px] font-black">
                                <Receipt size={12} /> ₹{task.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            </div>
                        )}
                        {task.billNumber && (
                            <div className="flex items-center gap-1 text-[10px] text-gray-500 font-bold">
                                <span className="text-gray-400 capitalize">Bill:</span> {task.billNumber}
                            </div>
                        )}
                        {task.referenceNumber && (
                            <div className="flex items-center gap-1 text-[10px] text-gray-500 font-bold border-l pl-2 border-gray-200">
                                <span className="text-gray-400 capitalize">Ref:</span> {task.referenceNumber}
                            </div>
                        )}
                        <div className={`ml-auto flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black border ${
                            task.isPaid ? 'bg-green-100 text-green-700 border-green-200' : 'bg-red-50 text-red-600 border-red-100'
                        }`}>
                            <CreditCard size={10} /> {task.isPaid ? 'PAID' : 'UNPAID'}
                        </div>
                    </div>
                )}

                <div className="grid grid-cols-2 gap-4 border-t pt-3 mt-1">
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                        <Calendar size={14} className="text-gray-400" />
                        <div>
                            <p className="font-medium text-gray-400 uppercase text-[9px]">Due Date</p>
                            <p className={`font-bold ${task.status === 'OVERDUE' ? 'text-red-600' : 'text-gray-700'}`}>
                                {formatDate(task.dueDate)}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                        {task.assignmentMode === 'GROUP' ? <Users size={14} className="text-gray-400" /> : <User size={14} className="text-gray-400" />}
                        <div>
                            <p className="font-medium text-gray-400 uppercase text-[9px]">Assignee</p>
                            <p className="font-bold text-gray-700 truncate w-32">
                                {task.assignmentMode === 'ALL' ? 'All Users' :
                                    task.assignmentMode === 'GROUP' ? (task.assignedGroupId?.name || 'Loading...') :
                                        (task.assigneeIds?.map(u => u.name).join(', ') || 'Unassigned')}
                            </p>
                        </div>
                    </div>
                </div>

                {task.remarks && (
                    <div className="text-[10px] text-gray-500 italic bg-amber-50/50 p-1.5 rounded border border-amber-100/50">
                        <span className="font-bold text-amber-700 not-italic mr-1">Note:</span> {task.remarks}
                    </div>
                )}

                {task.extensionHistory?.length > 0 && (
                    <div className="bg-amber-50 border border-amber-100 rounded p-2 text-[10px] flex items-start gap-2">
                        <Clock size={12} className="text-amber-500 mt-0.5 shrink-0" />
                        <div>
                            <p className="font-bold text-amber-800 uppercase tracking-tighter">Extension History</p>
                            {task.extensionHistory.slice(-1).map((h, i) => (
                                <p key={i} className="text-amber-700 italic">
                                    Last extended on {new Date(h.extendedAt).toLocaleDateString()} for: {h.reason}
                                </p>
                            ))}
                        </div>
                    </div>
                )}

                <div className="flex gap-2 pt-3 border-t border-gray-50 overflow-x-auto no-scrollbar">
                    {task.status !== 'COMPLETED' && (
                        <>
                            <button
                                onClick={handleClose}
                                disabled={actionLoading}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-black bg-green-600 text-white rounded-lg hover:bg-green-700 transition-all shadow-sm"
                            >
                                <span style={{ fontSize: '14px' }}>✅</span> Close Task
                            </button>
                            <button
                                onClick={handleExtend}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-black bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-all shadow-sm"
                            >
                                <Clock size={14} /> Extend
                            </button>
                        </>
                    )}
                    <button
                        onClick={() => onEdit(task)}
                        className="px-3 py-1.5 text-xs font-black bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-all"
                    >
                        Edit
                    </button>
                    <button
                        onClick={() => onDelete(task._id || task.id)}
                        className="px-3 py-1.5 text-xs font-black bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-all ml-auto"
                    >
                        Delete
                    </button>
                </div>
            </div>
        </div>
    );
};

