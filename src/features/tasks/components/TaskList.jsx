import React, { useState, useEffect } from 'react';
import { getTasks, deleteTask, getTaskGroups, createTaskGroup } from '@/services/taskApi';
import { getTaskCategories } from '@/services/taskCategoryApi';
import { TaskForm } from './TaskForm';
import { GroupForm } from './GroupForm';
import { TaskCard } from './TaskCard';
import { Button, useModal } from '@/components/ui';
import { useAuth } from '@/hooks/useAuth';
import toast from 'react-hot-toast';
import { Plus, Search, Filter } from 'lucide-react';

export const TaskList = () => {
    const [tasks, setTasks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [view, setView] = useState('today');
    const [filter, setFilter] = useState({
        status: '',
        priority: '',
        taskCategoryId: '',
        group: '',
        search: '',
        assigneeType: 'assigned_to_me' // New secondary filter
    });
    const [groups, setGroups] = useState([]);
    const [categories, setCategories] = useState([]);
    const { user } = useAuth();
    const { openModal, closeModal } = useModal();

    useEffect(() => {
        const fetchMetadata = async () => {
            try {
                const [groupsData, catsData] = await Promise.all([
                    getTaskGroups(),
                    getTaskCategories()
                ]);
                setGroups(Array.isArray(groupsData) ? groupsData : []);
                setCategories(Array.isArray(catsData?.data) ? catsData.data : []);
            } catch (e) {
                console.error('Failed to load metadata');
            }
        };
        fetchMetadata();
    }, []);

    useEffect(() => {
        fetchTasks();
    }, [view, filter.status, filter.priority, filter.taskCategoryId, filter.group, filter.assigneeType]);

    const fetchTasks = async () => {
        try {
            setLoading(true);
            const params = {
                view, // today, upcoming, overdue, closed
                status: filter.status || undefined,
                priority: filter.priority || undefined,
                taskCategoryId: filter.taskCategoryId || undefined,
                groupId: filter.group || undefined,
                search: filter.search || undefined,
                assigneeType: filter.assigneeType // assigned_to_me, created_by_me, all
            };

            const data = await getTasks(params);
            setTasks(Array.isArray(data) ? data : (data.results || []));
        } catch (error) {
            console.error('Fetch Tasks Error:', error);
            toast.error('Failed to load tasks');
        } finally {
            setLoading(false);
        }
    };

    const handleCreate = () => {
        openModal({
            title: 'Create Task',
            content: <TaskForm onSuccess={() => { closeModal(); fetchTasks(); }} onCancel={closeModal} />
        });
    };

    const handleCreateGroup = () => {
        openModal({
            title: 'Create New Group',
            content: (
                <GroupForm
                    onSuccess={() => {
                        closeModal();
                        getTaskGroups().then(data => setGroups(data));
                    }}
                    onCancel={closeModal}
                />
            )
        });
    };

    const handleEdit = (task) => {
        openModal({
            title: 'Edit Task',
            content: <TaskForm task={task} onSuccess={() => { closeModal(); fetchTasks(); }} onCancel={closeModal} />
        });
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Delete this task?')) return;
        try {
            await deleteTask(id);
            toast.success('Task deleted');
            fetchTasks();
        } catch (error) {
            toast.error('Failed to delete');
        }
    };

    const filteredTasksBySearch = tasks.filter(t =>
        !filter.search ||
        t.title.toLowerCase().includes(filter.search.toLowerCase()) ||
        (t.description && t.description.toLowerCase().includes(filter.search.toLowerCase()))
    );

    return (
        <div className="bg-gray-50 min-h-screen p-4 md:p-8">
            <div className="max-w-6xl mx-auto bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="p-6 border-b border-gray-100 bg-white">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
                        <h1 className="text-2xl font-black text-gray-900 tracking-tight">Task Management</h1>
                        <div className="flex gap-2">
                            <Button onClick={handleCreateGroup} variant="outline" className="flex items-center gap-2 font-bold px-4">
                                <Plus size={18} /> New Group
                            </Button>
                            <Button onClick={handleCreate} className="flex items-center gap-2 font-bold px-6">
                                <Plus size={18} /> New Task
                            </Button>
                        </div>
                    </div>

                    {/* Category Tabs */}
                    <div className="flex flex-wrap gap-2 mb-6 p-1 bg-gray-50 rounded-lg">
                        {[
                            { id: 'today', label: 'Today', color: 'text-blue-600' },
                            { id: 'upcoming', label: 'Upcoming', color: 'text-purple-600' },
                            { id: 'overdue', label: 'Overdue', color: 'text-red-600' },
                            { id: 'closed', label: 'Closed', color: 'text-green-600' }
                        ].map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setView(tab.id)}
                                className={`px-6 py-2 text-sm font-bold rounded-md transition-all ${view === tab.id
                                    ? 'bg-white text-primary shadow-sm ring-1 ring-gray-200'
                                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                                    }`}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>

                    {/* Filters & Search */}
                    <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
                        <div className="md:col-span-2 relative">
                            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                            <input
                                placeholder="Search tasks..."
                                value={filter.search}
                                onChange={(e) => setFilter({ ...filter, search: e.target.value })}
                                className="w-full pl-10 pr-4 py-2 bg-gray-50 border-0 focus:ring-2 focus:ring-primary rounded-lg text-sm font-medium"
                            />
                        </div>

                        <select
                            value={filter.assigneeType}
                            onChange={(e) => setFilter({ ...filter, assigneeType: e.target.value })}
                            className="bg-gray-50 border-0 focus:ring-2 focus:ring-primary rounded-lg text-sm font-bold py-2"
                        >
                            <option value="assigned_to_me">Assigned to Me</option>
                            <option value="created_by_me">Created by Me</option>
                            {user?.role !== 'staff' && <option value="all">All Access</option>}
                        </select>

                        <select
                            value={filter.group}
                            onChange={(e) => setFilter({ ...filter, group: e.target.value })}
                            className="bg-gray-50 border-0 focus:ring-2 focus:ring-primary rounded-lg text-sm font-bold py-2"
                        >
                            <option value="">All Groups</option>
                            {groups.map(g => <option key={g._id || g.id} value={g._id || g.id}>{g.name}</option>)}
                        </select>

                        <select
                            value={filter.priority}
                            onChange={(e) => setFilter({ ...filter, priority: e.target.value })}
                            className="bg-gray-50 border-0 focus:ring-2 focus:ring-primary rounded-lg text-sm font-bold py-2"
                        >
                            <option value="">All Priority</option>
                            <option value="CRITICAL">Critical</option>
                            <option value="URGENT">Urgent</option>
                            <option value="HIGH">High</option>
                            <option value="MEDIUM">Medium</option>
                            <option value="LOW">Low</option>
                        </select>
                    </div>
                </div>

                <div className="p-6">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-20 space-y-4">
                            <div className="animate-spin rounded-full h-10 w-10 border-4 border-gray-100 border-t-primary"></div>
                            <p className="text-gray-400 font-bold text-sm">Loading tasks...</p>
                        </div>
                    ) : filteredTasksBySearch.length === 0 ? (
                        <div className="text-center py-20 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                            <Filter size={48} className="mx-auto mb-4 text-gray-200" />
                            <p className="text-gray-400 font-bold">No tasks found.</p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {filteredTasksBySearch.map(task => (
                                <TaskCard
                                    key={task._id || task.id}
                                    task={task}
                                    onEdit={handleEdit}
                                    onDelete={handleDelete}
                                    onRefresh={fetchTasks}
                                />
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

