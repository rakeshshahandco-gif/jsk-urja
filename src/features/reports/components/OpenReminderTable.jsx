import React from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { Clock } from 'lucide-react';
import { Button } from '@/components/ui';

export const OpenReminderTable = ({ reminders, onAction, loading }) => {
    const navigate = useNavigate();
    if (loading) {
        return <div className="p-8 text-center text-gray-500">Loading open reminders...</div>;
    }

    if (!reminders || reminders.length === 0) {
        return <div className="p-8 text-center text-gray-500">No reminders found.</div>;
    }

    return (
        <div className="overflow-x-auto rounded-md border border-gray-200 bg-white shadow-sm">
            <table className="w-full text-sm text-left text-gray-500">
                <thead className="bg-gray-50 text-xs uppercase text-gray-700">
                    <tr>
                        <th className="px-6 py-3 font-medium w-1/4">Company & Contact</th>
                        <th className="px-6 py-3 font-medium w-1/6">Reminder</th>
                        <th className="px-6 py-3 font-medium w-1/3">Context & History</th>
                        <th className="px-6 py-3 font-medium w-1/6 text-right">Actions</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                    {reminders.map((reminder) => {
                        const customer = reminder.customerId || {};
                        const companyName = customer.company || customer.customerName || 'Unknown Company';

                        // Find primary contact
                        const primaryContact = customer.contactPersons?.find(cp => cp.isPrimary)
                            || customer.contactPersons?.[0];
                        const contactName = primaryContact?.name || '-';

                        const rDate = reminder.reminderDate ? new Date(reminder.reminderDate) : null;
                        const isValidDate = rDate && !isNaN(rDate.getTime());

                        return (
                            <tr key={reminder._id} className="hover:bg-gray-50 border-b border-gray-100 last:border-0 align-top">
                                {/* Column 1: Company & Contact */}
                                <td className="px-6 py-4 w-1/4">
                                    <div className="font-bold text-gray-900 text-base">{companyName}</div>
                                    <div className="text-sm text-gray-500 mt-1">{contactName}</div>

                                    {/* Mobile/Contact details if available */}
                                    {(customer.mobile1 || customer.mobile) && (
                                        <div className="text-xs text-blue-600 mt-1 flex items-center gap-1">
                                            <span role="img" aria-label="phone">📞</span> {customer.mobile1 || customer.mobile}
                                        </div>
                                    )}
                                </td>

                                {/* Column 2: Date & Status */}
                                <td className="px-6 py-4 w-1/6">
                                    <div className="font-medium text-gray-900 whitespace-nowrap">
                                        {isValidDate ? format(rDate, 'dd MMM yyyy') : 'No Date'}
                                    </div>
                                    <div className="flex flex-col gap-1 mt-1">
                                        {reminder.reminderTime && (
                                            <div className="flex items-center gap-1 text-xs text-gray-500">
                                                <Clock size={12} />
                                                {reminder.reminderTime}
                                            </div>
                                        )}
                                        <span className={`inline-flex w-fit items-center px-1.5 py-0.5 rounded text-[10px] font-medium border
                                            ${reminder.followUpType === 'WHATSAPP' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-blue-50 text-blue-700 border-blue-200'}`}>
                                            {reminder.followUpType}
                                        </span>
                                        {reminder.priority === 'high' && (
                                            <span className="inline-flex w-fit items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-50 text-red-700 border border-red-200">
                                                High Priority
                                            </span>
                                        )}
                                    </div>
                                </td>

                                {/* Column 3: Context (New) */}
                                <td className="px-6 py-4 w-1/3">
                                    <div className="space-y-3">
                                        {/* What to Talk Next */}
                                        <div>
                                            <div className="text-[10px] uppercase text-gray-400 font-bold tracking-wider mb-0.5">What To Talk Next</div>
                                            <div className="text-sm text-gray-700 bg-yellow-50 p-2 rounded border border-yellow-100">
                                                {reminder.whatToTalkNext || reminder.taskNote || '-'}
                                            </div>
                                        </div>

                                        {/* Last Conversation */}
                                        <div>
                                            <div className="flex justify-between items-baseline mb-0.5">
                                                <div className="text-[10px] uppercase text-gray-400 font-bold tracking-wider">Latest Conversation</div>
                                                {reminder.lastConversation && reminder.lastConversation.conversationDate && (
                                                    <span className="text-[10px] text-gray-400">
                                                        {(() => {
                                                            const d = new Date(reminder.lastConversation.conversationDate);
                                                            return !isNaN(d.getTime()) ? format(d, 'dd MMM') : '';
                                                        })()}
                                                    </span>
                                                )}
                                            </div>

                                            {reminder.lastConversation ? (
                                                <div className="text-xs text-gray-600 border-l-2 border-gray-200 pl-2">
                                                    <div className="font-medium text-gray-800 mb-0.5 flex items-center gap-1">
                                                        {reminder.lastConversation.mode === 'whatsapp' ? '💬' : '📞'}
                                                        <span className="truncate">{reminder.lastConversation.discussionDetails?.substring(0, 60)}...</span>
                                                    </div>
                                                    {reminder.lastConversation.outcome && (
                                                        <div className="text-gray-500 italic truncate">Result: {reminder.lastConversation.outcome}</div>
                                                    )}
                                                </div>
                                            ) : (
                                                <div className="text-xs text-gray-400 italic">No previous conversation recorded.</div>
                                            )}
                                        </div>

                                        <button
                                            onClick={() => onAction('history', reminder)}
                                            className="text-xs text-blue-600 hover:text-blue-800 hover:underline font-medium flex items-center gap-1"
                                        >
                                            View Full History →
                                        </button>

                                        {/* Creator Info */}
                                        {(reminder.createdBy?.name || reminder.creator?.name) && (
                                            <div className="pt-2 border-t border-gray-100 flex items-center gap-1 text-[10px] text-gray-400 italic">
                                                <span>Created by:</span>
                                                <span className="font-medium text-gray-500">{reminder.createdBy?.name || reminder.creator?.name}</span>
                                            </div>
                                        )}
                                    </div>
                                </td>

                                {/* Column 4: Actions */}
                                <td className="px-6 py-4 w-1/6 text-right">
                                    <div className="flex flex-col gap-2 items-end">
                                        <button
                                            onClick={() => {
                                                const cId = customer._id || customer.id;
                                                if (cId) navigate(`/followup/${cId}`);
                                            }}
                                            className="w-full text-xs font-semibold px-3 py-1 rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                                        >
                                            Open →
                                        </button>
                                        {!reminder.isClosed ? (
                                            <>
                                                <Button
                                                    size="sm"
                                                    className="bg-red-600 hover:bg-red-700 text-white h-8 px-3 w-full"
                                                    onClick={() => onAction('close', reminder)}
                                                >
                                                    Close
                                                </Button>

                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    className="h-8 px-3 border-gray-300 hover:bg-gray-100 w-full"
                                                    onClick={() => onAction('edit', reminder)}
                                                >
                                                    Change Date
                                                </Button>
                                            </>
                                        ) : (
                                            <span className="text-green-600 font-medium py-1 px-3 bg-green-50 rounded-full text-xs">Closed</span>
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
