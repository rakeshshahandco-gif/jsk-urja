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
        <div className="p-6 max-w-4xl mx-auto">
            <div className="flex items-center gap-4 mb-6">
                <Button variant="ghost" onClick={() => navigate(-1)} className="p-2">
                    <ChevronLeft size={20} />
                </Button>
                <div>
                    <h1 className="text-2xl font-black text-gray-900 tracking-tight">Create New Task</h1>
                    <p className="text-sm text-gray-500">Assign and schedule a new task for your team.</p>
                </div>
            </div>

            <div className="bg-white p-6 rounded-xl border shadow-sm">
                <TaskForm
                    task={customerId ? { customerId } : null}
                    onSuccess={handleSuccess}
                    onCancel={() => navigate(-1)}
                />
            </div>
        </div>
    );
};
