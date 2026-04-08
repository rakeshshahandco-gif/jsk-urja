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
    // For TaskMaster, recurrence is always considered enabled if the master itself is active.
    // For Task instance, we check the enabled flag.
    if (!task.recurrence) {
        return null;
    }

    const { enabled } = task.recurrence;
    if (enabled === false) return null;

    const { 
        frequency, 
        interval = 1, 
        recurrenceEndType, 
        endType, // Fallback for TaskMaster
        recurrenceEndDate, 
        endDate, // Fallback for TaskMaster
        recurrenceEndCount, 
        occurrenceCount: endCount // Fallback for TaskMaster
    } = task.recurrence;

    const actualEndType = recurrenceEndType || endType || 'NEVER';
    const actualEndDate = recurrenceEndDate || endDate;
    const actualEndCount = recurrenceEndCount || endCount;
    const currentCount = task.recurrence.occurrenceCount || 1;

    let nextDate = new Date(task.dueDate);
    
    // Safety check date
    if (isNaN(nextDate.getTime())) return null;

    // Check if we hit the count limit
    if (actualEndType === 'ON_COUNT' || actualEndType === 'AFTER_COUNT') {
        if (actualEndCount && currentCount >= actualEndCount) {
             return null;
        }
    }

    switch (frequency) {
        case 'DAILY':
            nextDate.setDate(nextDate.getDate() + interval);
            break;

        case 'WEEKLY':
            nextDate.setDate(nextDate.getDate() + (7 * interval));
            break;

        case 'MONTHLY':
            nextDate.setMonth(nextDate.getMonth() + 1 * interval);
            break;
        case 'EVERY_2_MONTHS':
            nextDate.setMonth(nextDate.getMonth() + 2 * interval);
            break;
        case 'EVERY_6_MONTHS':
            nextDate.setMonth(nextDate.getMonth() + 6 * interval);
            break;
        case 'QUARTERLY':
            nextDate.setMonth(nextDate.getMonth() + 3 * interval);
            break;

        case 'YEARLY':
            nextDate.setFullYear(nextDate.getFullYear() + interval);
            break;

        default:
            return null;
    }

    // Check end date
    if (actualEndType === 'ON_DATE' || actualEndType === 'DATE') {
        if (actualEndDate) {
            const endDateTime = new Date(actualEndDate);
            if (nextDate.getTime() > endDateTime.getTime()) {
                return null;
            }
        }
    }

    return nextDate;
};
