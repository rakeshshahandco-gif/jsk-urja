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
    if (!task.isRecurring || !task.recurrence || task.recurrence.type === 'NONE') {
        return null;
    }

    const { type, interval = 1, endDate, dayOfMonth } = task.recurrence;
    let nextDate = new Date(task.dueDate);

    // Safety check date
    if (isNaN(nextDate.getTime())) return null;

    switch (type) {
        case 'DAILY':
            nextDate.setDate(nextDate.getDate() + interval);
            break;

        case 'WEEKLY':
            nextDate.setDate(nextDate.getDate() + (7 * interval));
            break;

        case 'MONTHLY':
            // Target day is either explicit dayOfMonth or the day of the current due date
            let targetDayMonth = dayOfMonth || nextDate.getDate();
            nextDate.setMonth(nextDate.getMonth() + interval);
            const lastDayOfTargetMonth = new Date(nextDate.getFullYear(), nextDate.getMonth() + 1, 0).getDate();
            if (targetDayMonth > lastDayOfTargetMonth) {
                nextDate.setDate(lastDayOfTargetMonth);
            } else {
                nextDate.setDate(targetDayMonth);
            }
            break;

        case 'QUARTERLY':
            let targetDayQuarter = dayOfMonth || nextDate.getDate();
            nextDate.setMonth(nextDate.getMonth() + (interval * 3));
            const lastDayOfTargetQuarter = new Date(nextDate.getFullYear(), nextDate.getMonth() + 1, 0).getDate();
            if (targetDayQuarter > lastDayOfTargetQuarter) {
                nextDate.setDate(lastDayOfTargetQuarter);
            } else {
                nextDate.setDate(targetDayQuarter);
            }
            break;

        case 'YEARLY':
            nextDate.setFullYear(nextDate.getFullYear() + interval);
            // Handle Leap Year (Feb 29 -> Feb 28)
            const originalMonth = new Date(task.dueDate).getMonth();
            const originalDay = new Date(task.dueDate).getDate();
            if (originalMonth === 1 && originalDay === 29) {
                if (nextDate.getMonth() === 2) {
                    nextDate.setDate(0);
                }
            }
            break;

        default:
            return null;
    }

    // Check end date (End of Day comparison to be safe, or just straight comparison)
    if (endDate) {
        const endDateTime = new Date(endDate).setHours(23, 59, 59, 999);
        if (nextDate.getTime() > endDateTime) {
            return null;
        }
    }

    return nextDate;
};
