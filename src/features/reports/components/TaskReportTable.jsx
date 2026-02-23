import React from 'react';
import { format } from 'date-fns';
import { Clock, User, Flag, CheckCircle2, MoreHorizontal, Check } from 'lucide-react';
import { Button } from '@/components/ui';

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

export const TaskReportTable = ({ tasks, loading, onExtend, onCloseTask }) => {
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
                        <th className="px-6 py-3 font-bold">Task Title</th>
                        <th className="px-6 py-3 font-bold">Task Type</th>
                        <th className="px-6 py-3 font-bold">Group</th>
                        <th className="px-6 py-3 font-bold">Priority</th>
                        <th className="px-6 py-3 font-bold">Status</th>
                        <th className="px-6 py-3 font-bold">Due Date</th>
                        <th className="px-6 py-3 font-bold">Created By</th>
                        <th className="px-6 py-3 font-bold text-center">Actions</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                    {tasks.map((task) => {
                        const dueDate = new Date(task.dueDate);

                        return (
                            <tr key={task._id} className="hover:bg-gray-50/70 transition-colors group align-middle">
                                <td className="px-6 py-4">
                                    <div className="font-bold text-gray-900 leading-tight">{task.title}</div>
                                    <div className="text-[11px] text-gray-400 mt-0.5">{task.taskCategoryId?.name || 'General task'}</div>
                                </td>

                                <td className="px-6 py-4">
                                    <div className="text-gray-600 font-medium">{task.taskCategoryId?.name || 'General task'}</div>
                                </td>

                                <td className="px-6 py-4">
                                    {task.groupId?.name ? (
                                        <div className="text-gray-600 font-medium">{task.groupId.name}</div>
                                    ) : (
                                        <div className="text-gray-400 italic">No group</div>
                                    )}
                                </td>

                                <td className="px-6 py-4">
                                    <span className={`inline-flex items-center px-3 py-1 rounded-md text-[10px] font-bold border ${priorityColors[task.priority] || priorityColors.MEDIUM}`}>
                                        <span className={`w-2 h-2 rounded-full mr-2 ${task.priority === 'HIGH' || task.priority === 'URGENT' || task.priority === 'CRITICAL' ? 'bg-red-500' : 'bg-yellow-500'}`}></span>
                                        {task.priority || 'MEDIUM'}
                                    </span>
                                </td>

                                <td className="px-6 py-4">
                                    <span className={`px-3 py-1 rounded-md text-[10px] font-bold border ${statusColors[task.status] || statusColors.OPEN}`}>
                                        {task.status?.replace('_', ' ') || 'OPEN'}
                                    </span>
                                </td>

                                <td className="px-6 py-4 whitespace-nowrap">
                                    <div className="flex flex-col">
                                        <div className={`font-bold ${new Date() > dueDate && task.status !== 'COMPLETED' ? 'text-red-600' : 'text-gray-700'}`}>
                                            {format(dueDate, 'dd/MM/yyyy')}
                                        </div>
                                        <div className="text-[11px] text-gray-400">{format(dueDate, 'HH:mm')}</div>
                                    </div>
                                </td>

                                <td className="px-6 py-4">
                                    <div className="text-gray-700 font-medium">{task.createdBy?.name || 'Unknown'}</div>
                                </td>

                                <td className="px-6 py-4">
                                    <div className="flex items-center justify-center gap-2">
                                        {task.status !== 'COMPLETED' ? (
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
                                        <button
                                            onClick={() => onExtend(task)}
                                            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                                            title="Extend due date"
                                        >
                                            <MoreHorizontal size={18} />
                                        </button>
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
