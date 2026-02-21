/**
 * Calculate the next due date based on recurrence rules
 *Rules:
 * - WEEKLY: due_date + (7 * interval)
 * - MONTHLY: same day-of-month. If day doesn't exist (e.g. 31st), use last day of month.
 * - YEARLY: same month/day. If Feb 29 -> Feb 28.
 * @param {Object} task - The task object containing recurrence settings
 * @returns {Date|null} - The next due date or null if no next occurrence
 */
export const calculateNextDueDate = (task) => {
    if (!task.recurrence || !task.recurrence.enabled) {
        return null;
    }

    const { frequency, interval = 1, recurrenceEndType, recurrenceEndDate, recurrenceEndCount, occurrenceCount = 1 } = task.recurrence;
    let nextDate = new Date(task.dueDate);

    // Safety check date
    if (isNaN(nextDate.getTime())) return null;

    // Check if we hit the count limit
    if (recurrenceEndType === 'ON_COUNT' && recurrenceEndCount && occurrenceCount >= recurrenceEndCount) {
        return null;
    }

    switch (frequency) {
        case 'DAILY':
            nextDate.setDate(nextDate.getDate() + interval);
            break;

        case 'WEEKLY':
            nextDate.setDate(nextDate.getDate() + (7 * interval));
            break;

        case 'MONTHLY':
            nextDate.setMonth(nextDate.getMonth() + interval);
            break;

        case 'QUARTERLY':
            nextDate.setMonth(nextDate.getMonth() + (interval * 3));
            break;

        case 'YEARLY':
            nextDate.setFullYear(nextDate.getFullYear() + interval);
            break;

        default:
            return null;
    }

    // Check end date
    if (recurrenceEndType === 'DATE' && recurrenceEndDate) {
        const endDateTime = new Date(recurrenceEndDate);
        if (nextDate.getTime() > endDateTime.getTime()) {
            return null;
        }
    }

    return nextDate;
};
