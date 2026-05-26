/** Parse $day due-date shortcuts (current month/year). */
export function parseDateShortcut(dayStr) {
    const day = parseInt(dayStr, 10);
    if (!Number.isFinite(day) || day < 1 || day > 31) {
        return { error: 'Invalid date shortcut' };
    }
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const date = new Date(year, month, day);
    if (date.getMonth() !== month || date.getDate() !== day) {
        return { error: 'Invalid date shortcut' };
    }
    const mm = String(month + 1).padStart(2, '0');
    const dd = String(day).padStart(2, '0');
    return {
        date,
        isoDate: `${year}-${mm}-${dd}`,
        label: `${dd}-${mm}-${year}`,
    };
}

/** Last $NN token in text (e.g. "$15" or "$05"). */
export function findDateShortcutInText(text) {
    const matches = [...text.matchAll(/\$(\d{1,2})(?=\s|$|#|@)/g)];
    if (matches.length === 0) return null;
    return parseDateShortcut(matches[matches.length - 1][1]);
}

export function stripDateShortcuts(text) {
    return text.replace(/\$\d{1,2}(?=\s|$|#|@)/g, '').replace(/\s+/g, ' ').trim();
}

/** Active # or @ trigger immediately before cursor. */
export function getActiveTrigger(text, cursorPos) {
    const before = text.slice(0, cursorPos);
    const hash = before.match(/#([\w-]*)$/);
    if (hash) return { type: 'group', query: hash[1] };
    const at = before.match(/@([\w-]*)$/);
    if (at) return { type: 'assignee', query: at[1] };
    return null;
}

export function filterGroups(groups, query) {
    const q = (query || '').toLowerCase();
    return (groups || []).filter((g) => {
        const name = (g.name || '').toLowerCase();
        return !q || name.includes(q);
    });
}

export function filterUsers(users, query) {
    const q = (query || '').toLowerCase();
    return (users || []).filter((u) => {
        if (u.isActive === false) return false;
        const name = (u.fullName || u.name || '').toLowerCase();
        return !q || name.includes(q);
    });
}

/** Title with $, #, @ shortcut tokens removed. */
export function buildCleanTitle(text) {
    let t = stripDateShortcuts(text);
    t = t.replace(/#[\w-]*/g, '');
    t = t.replace(/@[\w-]*/g, '');
    return t.replace(/\s+/g, ' ').trim();
}

export function removeTriggerToken(text, cursorPos) {
    const before = text.slice(0, cursorPos);
    const after = text.slice(cursorPos);
    const replaced = before.replace(/#([\w-]*)$|@([\w-]*)$/, '');
    return (replaced + after).replace(/\s+/g, ' ').trimEnd();
}
