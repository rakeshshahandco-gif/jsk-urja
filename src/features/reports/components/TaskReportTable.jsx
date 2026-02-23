import React from 'react';
import { format } from 'date-fns';
import { Clock, User, Flag, CheckCircle2, Circle } from 'lucide-react';

const priorityColors = {
    LOW: 'bg-blue-50 text-blue-700 border-blue-200',
    MEDIUM: 'bg-green-50 text-green-700 border-green-200',
    HIGH: 'bg-orange-50 text-orange-700 border-orange-200',
    URGENT: 'bg-red-50 text-red-700 border-red-200',
    CRITICAL: 'bg-purple-50 text-purple-700 border-purple-200'
};

const statusColors = {
    OPEN: 'bg-gray-50 text-gray-700 border-gray-200',
    IN_PROGRESS: 'bg-blue-50 text-blue-700 border-blue-200',
    COMPLETED: 'bg-green-50 text-green-700 border-green-200',
    OVERDUE: 'bg-red-50 text-red-700 border-red-200',
    CANCELLED: 'bg-gray-100 text-gray-500 border-gray-300'
};

export const TaskReportTable = ({ tasks, loading }) => {
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
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
            <table className="w-full text-sm text-left">
                <thead className="bg-gray-50 text-xs uppercase text-gray-700 border-b border-gray-200">
                    <tr>
                        <th className="px-6 py-4 font-bold tracking-wider">Task Info</th>
                        <th className="px-6 py-4 font-bold tracking-wider">Priority & Status</th>
                        <th className="px-6 py-4 font-bold tracking-wider">Timing</th>
                        <th className="px-6 py-4 font-bold tracking-wider">Assignees</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                    {tasks.map((task) => {
                        const dueDate = new Date(task.dueDate);

                        return (
                            <tr key={task._id} className="hover:bg-gray-50/50 transition-colors align-top">
                                {/* Task Title & Description */}
                                <td className="px-6 py-5 min-w-[300px]">
                                    <div className="flex items-start gap-3">
                                        {task.status === 'COMPLETED' ? (
                                            <CheckCircle2 className="w-5 h-5 text-green-500 mt-0.5 shrink-0" />
                                        ) : (
                                            <Circle className="w-5 h-5 text-gray-300 mt-0.5 shrink-0" />
                                        )}
                                        <div>
                                            <div className="font-bold text-gray-900 text-base leading-tight">{task.title}</div>
                                            {task.description && (
                                                <div className="text-sm text-gray-500 mt-2 line-clamp-2 italic">
                                                    {task.description}
                                                </div>
                                            )}
                                            {task.taskCategoryId?.name && (
                                                <div className="mt-3">
                                                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-100 uppercase tracking-wider">
                                                        {task.taskCategoryId.name}
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </td>

                                {/* Priority & Status */}
                                <td className="px-6 py-5">
                                    <div className="flex flex-col gap-2">
                                        <div className="flex items-center gap-2">
                                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border ${priorityColors[task.priority] || priorityColors.MEDIUM}`}>
                                                <Flag className="w-3 h-3 mr-1" />
                                                {task.priority || 'MEDIUM'}
                                            </span>
                                        </div>
                                        <div>
                                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border ${statusColors[task.status] || statusColors.OPEN}`}>
                                                {task.status?.replace('_', ' ') || 'OPEN'}
                                            </span>
                                        </div>
                                    </div>
                                </td>

                                {/* Timing */}
                                <td className="px-6 py-5 whitespace-nowrap">
                                    <div className="flex flex-col gap-1.5">
                                        <div className="flex items-center gap-2 font-bold text-gray-900">
                                            <Clock className="w-4 h-4 text-gray-400" />
                                            {format(dueDate, 'dd MMM yyyy')}
                                        </div>
                                        <div className="text-xs text-gray-500 pl-6">
                                            {format(dueDate, 'hh:mm a')}
                                        </div>
                                        {task.recurrence?.enabled && (
                                            <div className="mt-2 pl-6">
                                                <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded uppercase tracking-wider">
                                                    Recurring: {task.recurrence.frequency}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                </td>

                                {/* Assignees */}
                                <td className="px-6 py-5">
                                    <div className="flex flex-col gap-3">
                                        {task.assigneeIds && task.assigneeIds.length > 0 ? (
                                            <div className="flex flex-wrap gap-2">
                                                {task.assigneeIds.map(user => (
                                                    <div key={user._id} className="flex items-center gap-1.5 bg-gray-100 px-2 py-1 rounded text-xs font-medium text-gray-700 border border-gray-200">
                                                        <User className="w-3 h-3" />
                                                        {user.name}
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <span className="text-xs text-gray-400 italic">No specific assignees</span>
                                        )}

                                        <div className="flex items-center gap-1.5 pt-2 border-t border-gray-50">
                                            <span className="text-[10px] text-gray-400">Owner:</span>
                                            <span className="text-[10px] font-medium text-gray-600 truncate max-w-[120px]">
                                                {task.createdBy?.name || 'Unknown'}
                                            </span>
                                        </div>

                                        {task.groupId?.name && (
                                            <div className="mt-1">
                                                <span className="text-[10px] text-gray-400 italic">
                                                    Group: {task.groupId.name}
                                                </span>
                                            </div>
                                        )}
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
