import React from 'react';
import { format } from 'date-fns';
import { Calendar, Phone, MessageCircle, Clock, CheckCircle, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui';
import styles from '../CustomerMasterReport.module.scss'; // Reusing styles

export const ReminderTable = ({ reminders, onChangeDate, onCloseTask, loading }) => {
    if (loading) {
        return <div className="p-8 text-center">Loading reminders...</div>;
    }

    if (!reminders || reminders.length === 0) {
        return <div className="p-8 text-center text-gray-500">No reminders found.</div>;
    }

    const getStatusBadge = (reminder) => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const rDate = new Date(reminder.reminderDate);

        if (reminder.isClosed) return <span className="bg-gray-100 text-gray-800 px-2 py-1 rounded text-xs font-medium">Closed</span>;
        if (rDate < today) return <span className="bg-red-100 text-red-800 px-2 py-1 rounded text-xs font-medium">Overdue</span>;
        if (rDate.getTime() === today.getTime()) return <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs font-medium">Today</span>;
        return <span className="bg-green-100 text-green-800 px-2 py-1 rounded text-xs font-medium">Upcoming</span>;
    };

    return (
        <div className={styles.tableContainer}>
            <table className={styles.table}>
                <thead>
                    <tr>
                        <th>Customer</th>
                        <th>Contact</th>
                        <th>Reminder Date</th>
                        <th>Type</th>
                        <th>Priority</th>
                        <th>Note</th>
                        <th>Status</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {reminders.map((reminder) => {
                        const customer = reminder.customerId || {}; // Populate handles this, but aggregate manually mapped it too
                        // Aggregate mapping in service: customerId: r.customer (object)

                        return (
                            <tr key={reminder._id}>
                                <td>
                                    <div className="font-medium text-gray-900">{customer.customerName || 'Unknown'}</div>
                                    <div className="text-xs text-gray-500">{customer.company}</div>
                                </td>
                                <td>
                                    <div className="text-sm">{customer.mobile1}</div>
                                </td>
                                <td>
                                    <div className="flex items-center gap-1">
                                        <Calendar size={14} className="text-gray-400" />
                                        <span>{format(new Date(reminder.reminderDate), 'dd MMM yyyy')}</span>
                                    </div>
                                    <div className="flex items-center gap-1 text-xs text-gray-500">
                                        <Clock size={12} />
                                        <span>{reminder.reminderTime}</span>
                                    </div>
                                    {reminder.rescheduleCount > 0 && (
                                        <div className="text-xs text-orange-600 mt-1" title={`${reminder.rescheduleCount} times`}>
                                            Rescheduled {reminder.rescheduleCount}x
                                        </div>
                                    )}
                                </td>
                                <td>
                                    {reminder.followUpType === 'WHATSAPP' ? (
                                        <span className="flex items-center gap-1 text-green-600 text-xs font-medium">
                                            <MessageCircle size={14} /> WhatsApp
                                        </span>
                                    ) : (
                                        <span className="flex items-center gap-1 text-blue-600 text-xs font-medium">
                                            <Phone size={14} /> Call
                                        </span>
                                    )}
                                </td>
                                <td>
                                    <span className={`
                                        px-2 py-1 rounded text-xs font-medium
                                        ${reminder.priority === 'high' ? 'bg-red-50 text-red-700' :
                                            reminder.priority === 'medium' ? 'bg-yellow-50 text-yellow-700' :
                                                'bg-green-50 text-green-700'}
                                    `}>
                                        {reminder.priority?.toUpperCase()}
                                    </span>
                                </td>
                                <td>
                                    <div className="max-w-xs truncate text-sm" title={reminder.taskNote}>
                                        {reminder.taskNote || '-'}
                                    </div>
                                </td>
                                <td>
                                    {getStatusBadge(reminder)}
                                </td>
                                <td>
                                    <div className="flex flex-col gap-2">
                                        {!reminder.isClosed && (
                                            <>
                                                <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => onChangeDate(reminder)}>
                                                    Change Date
                                                </Button>
                                                <Button size="sm" variant="ghost" className="text-xs h-7 text-green-700" onClick={() => onCloseTask(reminder)}>
                                                    <CheckCircle size={14} className="mr-1" /> Close
                                                </Button>
                                            </>
                                        )}
                                        {reminder.isClosed && (
                                            <span className="text-xs text-gray-400 italic">No actions</span>
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
