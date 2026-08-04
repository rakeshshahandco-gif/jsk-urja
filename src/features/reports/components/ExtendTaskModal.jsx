import React, { useState } from 'react';
import { format } from 'date-fns';
import { X, Calendar, MessageSquare } from 'lucide-react';
import { Button, Input, Modal } from '@/components/ui';

export const ExtendTaskModal = ({ task, isOpen, onClose, onConfirm }) => {
    const [newDueDate, setNewDueDate] = useState('');
    const [reason, setReason] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    if (!isOpen || !task) return null;

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        if (!newDueDate) {
            setError('Please select a new due date.');
            return;
        }

        if (task?.dueDate) {
            const currentDay = new Date(task.dueDate);
            currentDay.setHours(0, 0, 0, 0);
            const nextDay = new Date(newDueDate);
            nextDay.setHours(0, 0, 0, 0);
            if (nextDay.getTime() <= currentDay.getTime()) {
                setError('Extended date must be later than the current due date.');
                return;
            }
        }

        setLoading(true);
        try {
            await onConfirm(task._id, { newDueDate, reason: reason?.trim() || '' });
            setNewDueDate('');
            setReason('');
            onClose();
        } catch (err) {
            setError(err?.response?.data?.message || 'Failed to extend task.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Extend Due Date" maxWidth="md">
            <div className="p-6">
                <form onSubmit={handleSubmit} className="space-y-6">
                    <div>
                        <label className="text-sm font-medium text-gray-700 mb-2 block">Current Due Date:</label>
                        <div className="p-3 bg-gray-50 rounded-lg border border-gray-200 text-gray-600 font-medium">
                            {task.dueDate ? format(new Date(task.dueDate), 'dd/MM/yyyy HH:mm') : 'None'}
                        </div>
                    </div>

                    <div>
                        <label className="text-sm font-medium text-gray-700 mb-2 block flex items-center gap-2">
                            New Due Date:
                            <span className="text-red-500">*</span>
                        </label>
                        <div className="relative">
                            <Calendar size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                            <Input
                                type="datetime-local"
                                value={newDueDate}
                                onChange={(e) => setNewDueDate(e.target.value)}
                                className="pl-10 border-gray-300 focus:ring-primary focus:border-primary"
                                required
                            />
                        </div>
                    </div>

                    <div>
                        <label className="text-sm font-medium text-gray-700 mb-2 block flex items-center gap-2">
                            Reason for extension (Optional)
                        </label>
                        <div className="relative">
                            <textarea
                                value={reason}
                                onChange={(e) => setReason(e.target.value)}
                                placeholder="Reason for extension (Optional)"
                                className="w-full min-h-[100px] p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all resize-none text-sm"
                            />
                        </div>
                    </div>

                    {error ? (
                        <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg p-3">
                            {error}
                        </div>
                    ) : null}

                    <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={onClose}
                            className="px-6 border-gray-300 text-gray-600 hover:bg-gray-50"
                        >
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            loading={loading}
                            disabled={!newDueDate}
                            className="px-8 bg-primary hover:bg-primary/90 text-white font-semibold shadow-sm"
                        >
                            Confirm
                        </Button>
                    </div>
                </form>
            </div>
        </Modal>
    );
};
