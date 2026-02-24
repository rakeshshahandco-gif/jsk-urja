import React from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { TaskForm } from './TaskForm';
import { Button } from '@/components/ui';
import { ChevronLeft } from 'lucide-react';

export const TaskCreatePage = () => {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const customerId = searchParams.get('customerId');

    const handleSuccess = () => {
        navigate('/tasks/list');
    };

    return (
        <div className="p-4 max-w-5xl mx-auto">
            <div className="flex items-center gap-3 mb-3">
                <button onClick={() => navigate(-1)} style={{ height: 28, width: 28, border: '1px solid #e5e7eb', borderRadius: 6, background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <ChevronLeft size={16} />
                </button>
                <div>
                    <h1 className="text-base font-bold text-gray-900 leading-tight">Create New Task</h1>
                    <p className="text-xs text-gray-400">Assign and schedule a task</p>
                </div>
            </div>

            <div className="bg-white p-4 rounded-xl border shadow-sm">
                <TaskForm
                    task={customerId ? { customerId } : null}
                    onSuccess={handleSuccess}
                    onCancel={() => navigate(-1)}
                />
            </div>
        </div>
    );
};
