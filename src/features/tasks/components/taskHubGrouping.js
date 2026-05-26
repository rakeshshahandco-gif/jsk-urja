import { parseISO, startOfDay, isToday, isPast, addDays, isBefore } from 'date-fns';
import { PRIORITY_ORDER } from './taskHubConstants';

export const sortTasks = (tasks) =>
    [...tasks].sort((a, b) => {
        const da = a?.dueDate ? new Date(a.dueDate) : new Date('9999-01-01');
        const db = b?.dueDate ? new Date(b.dueDate) : new Date('9999-01-01');
        const ta = Number.isNaN(da.getTime()) ? 9999999999999 : da.getTime();
        const tb = Number.isNaN(db.getTime()) ? 9999999999999 : db.getTime();
        if (ta !== tb) return ta - tb;
        const pa = PRIORITY_ORDER[a?.priority] ?? 99;
        const pb = PRIORITY_ORDER[b?.priority] ?? 99;
        return pa - pb;
    });

export const groupTasksForWorkboard = (tasks) => {
    const today = startOfDay(new Date());
    const in7Days = addDays(today, 7);
    const groups = { overdue: [], today: [], week: [], future: [] };

    tasks.forEach((t) => {
        if (!t?.dueDate) {
            groups.future.push(t);
            return;
        }
        try {
            const due = startOfDay(parseISO(t.dueDate));
            if (Number.isNaN(due.getTime())) {
                groups.future.push(t);
                return;
            }
            if (isToday(due)) groups.today.push(t);
            else if (isPast(due)) groups.overdue.push(t);
            else if (isBefore(due, in7Days) || due.getTime() === in7Days.getTime()) groups.week.push(t);
            else groups.future.push(t);
        } catch {
            groups.future.push(t);
        }
    });

    Object.keys(groups).forEach((k) => {
        groups[k] = sortTasks(groups[k]);
    });
    return groups;
};

export const workboardStatsFromGroups = (groups) => ({
    overdue: groups.overdue?.length ?? 0,
    today: groups.today?.length ?? 0,
    week: groups.week?.length ?? 0,
    open: Object.values(groups).reduce((sum, arr) => sum + (arr?.length ?? 0), 0),
});
